/**
 * Gate Evaluator Agent — Automated Mature→Advance Transitions
 *
 * P206 AC-4: GateEvaluatorAgent class exists in src/apps/cubic-agents/gate-evaluator.ts
 * with evaluate(proposal, gate) method returning GateDecision.
 *
 * This agent:
 * 1. Checks if a proposal can be promoted (dependencies resolved)
 * 2. Verifies acceptance criteria if required
 * 3. Dispatches to evaluator based on gate mode (auto/ai-agent/quorum)
 * 4. Records decision in gate_decision_log
 * 5. Auto-transitions proposal on approval
 */

import type { query } from "../../infra/postgres/pool.ts";
import {
	createGateEvaluator,
	type GateDecision,
	type GateEvaluatorConfig,
	type GateBrief,
	type ProposalBrief,
} from "../../core/gate/evaluator.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GateTaskRequest {
	proposal_id: number;
	gate_name: string;
	from_state: string;
	to_state: string;
}

// ─── Gate Evaluator Agent ────────────────────────────────────────────────────

export class GateEvaluatorAgent {
	constructor(
		private queryFn: typeof query,
		private proposalId: number,
		private gateName: string,
		private transitionProposalFn?: (
			id: number,
			newStatus: string,
			authorIdentity?: string,
			changeSummary?: string,
		) => Promise<any>,
	) {}

	/**
	 * Main evaluation entrypoint.
	 * P206 AC-4: evaluate(proposal, gate) → GateDecision
	 */
	async evaluate(proposal: ProposalBrief, gate: GateBrief): Promise<GateDecision> {
		console.log(
			`[GateEvaluator] Evaluating ${proposal.display_id} for gate ${gate.name}`,
		);

		// Step 1: Check can_promote (unresolved dependencies)
		const canPromote = await this.checkCanPromote(proposal.id);
		if (!canPromote) {
			const decision: GateDecision = {
				verdict: "reject",
				reason: "Unresolved dependencies prevent promotion",
			};
			await this.recordGateDecision(proposal, gate, decision);
			return decision;
		}

		// Step 2: Verify acceptance criteria if gate requires them
		let acStatus: any = null;
		if (gate.requires_ac) {
			acStatus = await this.verifyAcceptanceCriteria(proposal.id);
			if (acStatus.failedCount > 0) {
				const decision: GateDecision = {
					verdict: "reject",
					reason: `Failed ACs: ${acStatus.failedCount}/${acStatus.totalCount}`,
					metadata: {
						pass_rate: acStatus.passRate,
						failed_count: acStatus.failedCount,
						total_count: acStatus.totalCount,
					},
				};
				await this.recordGateDecision(proposal, gate, decision);
				return decision;
			}
		}

		// Step 3: For gates that don't require ACs, auto-approve if deps resolved
		if (!gate.requires_ac) {
			const decision: GateDecision = {
				verdict: "approve",
				reason: "All dependencies resolved; no ACs required for this gate",
				metadata: { gate_requires_ac: false },
			};
			await this.recordGateDecision(proposal, gate, decision, acStatus);
			return decision;
		}

		// Step 4: Get gate evaluator mode and config for AC-required gates
		const evaluatorConfig = await this.getEvaluatorConfig(gate.name);
		if (!evaluatorConfig) {
			const decision: GateDecision = {
				verdict: "abstain",
				reason: `No evaluator configuration found for gate ${gate.name}`,
			};
			await this.recordGateDecision(proposal, gate, decision, acStatus);
			return decision;
		}

		// Step 5: Create evaluator and get decision
		const evaluator = createGateEvaluator(evaluatorConfig, {
			queryFn: this.queryFn,
			// TODO(P206): spawnAgentFn for ai-agent mode dispatches to cubic
			spawnAgentFn: undefined,
		});

		const decision = await evaluator.evaluate(proposal, gate);

		// Step 6: Record decision
		await this.recordGateDecision(proposal, gate, decision, acStatus);

		// Step 7: Auto-transition if approved
		if (decision.verdict === "approve") {
			try {
				const transitionFn = this.transitionProposalFn || (await this.getDefaultTransitionFn());
				await transitionFn(
					proposal.id,
					gate.to_state,
					"gate-evaluator",
					`Auto-advanced via gate ${gate.name}`,
				);
				console.log(
					`[GateEvaluator] ✓ Transitioned ${proposal.display_id} to ${gate.to_state}`,
				);
			} catch (err) {
				console.error(
					`[GateEvaluator] ✗ Failed to transition proposal:`,
					err,
				);
				throw err;
			}
		}

		return decision;
	}

	/**
	 * P206 AC-6: Gate evaluator checks can_promote() before evaluating
	 */
	private async checkCanPromote(proposalId: number): Promise<boolean> {
		const { rows } = await this.queryFn<{ count: string }>(
			`SELECT COUNT(*) as count
			 FROM roadmap_proposal.proposal_dependencies
			 WHERE from_proposal_id = $1 AND resolved = false`,
			[proposalId],
		);

		const unresolvedCount = Number(rows[0]?.count ?? 0);
		return unresolvedCount === 0;
	}

	/**
	 * Verify acceptance criteria status for a proposal
	 */
	private async verifyAcceptanceCriteria(
		proposalId: number,
	): Promise<{
		totalCount: number;
		passedCount: number;
		failedCount: number;
		passRate: number;
	}> {
		const { rows } = await this.queryFn<{
			total: string;
			passed: string;
			failed: string;
		}>(
			`SELECT COUNT(*) as total,
			        SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) as passed,
			        SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failed
			 FROM roadmap_proposal.proposal_acceptance_criteria
			 WHERE proposal_id = $1`,
			[proposalId],
		);

		const totalCount = Number(rows[0]?.total ?? 0);
		const passedCount = Number(rows[0]?.passed ?? 0);
		const failedCount = Number(rows[0]?.failed ?? 0);
		const passRate = totalCount > 0 ? (passedCount / totalCount) * 100 : 0;

		return { totalCount, passedCount, failedCount, passRate };
	}

	/**
	 * Get evaluator configuration for a gate
	 * For now, uses hardcoded modes. TODO(P206): Load from gate_task_template
	 *
	 * Note: Gates that don't require ACs still use 'auto' mode but with
	 * ac_pass_threshold=0, which means they only check dependencies.
	 */
	private async getEvaluatorConfig(
		gateName: string,
	): Promise<GateEvaluatorConfig | null> {
		// TODO(P206): Query gate_task_template table once it's populated
		// For MVP, use hardcoded defaults based on gate name
		const configs: Record<string, GateEvaluatorConfig> = {
			D1: {
				mode: "auto",
				ac_pass_threshold: 0, // Draft→Review: only dependency check, no AC required
				allow_unresolved_deps: false,
			},
			D2: {
				mode: "auto",
				ac_pass_threshold: 100, // Review→Develop: requires 100% AC pass
				allow_unresolved_deps: false,
			},
			D3: {
				mode: "auto",
				ac_pass_threshold: 100, // Develop→Merge: requires 100% AC pass
				allow_unresolved_deps: false,
			},
			D4: {
				mode: "auto",
				ac_pass_threshold: 0, // Merge→Complete: only dependency check, no AC required
				allow_unresolved_deps: false,
			},
		};

		return configs[gateName] ?? null;
	}

	/**
	 * Get default transition function from actual storage module
	 */
	private async getDefaultTransitionFn(): Promise<typeof import("../../postgres/proposal-storage.ts").transitionProposal> {
		const { transitionProposal } = await import("../../postgres/proposal-storage.ts");
		return transitionProposal;
	}

	/**
	 * Record gate decision in gate_decision_log
	 * P206 AC-2 & AC-5: Records verdict='approve'/'reject' with metadata
	 */
	private async recordGateDecision(
		proposal: ProposalBrief,
		gate: GateBrief,
		decision: GateDecision,
		acStatus?: {
			totalCount: number;
			passedCount: number;
			failedCount: number;
			passRate: number;
		},
	): Promise<void> {
		try {
			// P206 AC-5: ac_pass_rate field
			const acPassRate = acStatus
				? acStatus.passRate
				: null;

			await this.queryFn(
				`INSERT INTO roadmap_proposal.gate_decision_log
				 (proposal_id, from_state, to_state, maturity, gate, decided_by,
				  authority_agent, decision, rationale, ac_verification)
				 VALUES ($1, $2, $3, 'mature', $4, 'system', 'gate-evaluator',
				 $5, $6, $7)`,
				[
					proposal.id,
					gate.from_state,
					gate.to_state,
					gate.name,
					decision.verdict,
					decision.reason,
					JSON.stringify({
						pass_rate: acPassRate,
						...decision.metadata,
					}),
				],
			);

			console.log(
				`[GateEvaluator] Recorded decision: ${decision.verdict} for ${proposal.display_id}`,
			);
		} catch (err) {
			console.error(`[GateEvaluator] Failed to record gate decision:`, err);
			throw err;
		}
	}
}

/**
 * Factory function to create and run gate evaluator
 * Used by orchestrator or standalone execution
 */
export async function runGateEvaluation(
	request: GateTaskRequest,
	queryFn: typeof query,
): Promise<GateDecision> {
	// Fetch proposal details
	const { rows: proposals } = await queryFn<{
		id: number;
		display_id: string;
		title: string;
		status: string;
		workflow_name: string;
	}>(
		`SELECT id, display_id, title, status,
		        (SELECT workflow_name FROM roadmap_proposal.proposal_type_config
		         WHERE type = p.type LIMIT 1) as workflow_name
		 FROM roadmap_proposal.proposal p
		 WHERE id = $1`,
		[request.proposal_id],
	);

	if (!proposals[0]) {
		throw new Error(`Proposal ${request.proposal_id} not found`);
	}

	const proposal = proposals[0];

	// Construct gate brief
	const gate: GateBrief = {
		name: request.gate_name,
		from_state: request.from_state,
		to_state: request.to_state,
		requires_ac:
			request.from_state !== "DRAFT" && request.from_state !== "MERGE",
	};

	const proposalBrief: ProposalBrief = {
		id: proposal.id,
		display_id: proposal.display_id,
		title: proposal.title,
		status: proposal.status,
		workflow_name: proposal.workflow_name,
	};

	const agent = new GateEvaluatorAgent(
		queryFn,
		request.proposal_id,
		request.gate_name,
	);

	return await agent.evaluate(proposalBrief, gate);
}
