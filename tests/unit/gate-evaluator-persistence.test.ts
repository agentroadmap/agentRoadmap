import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	GateEvaluatorAgent,
	GatePersistenceFailure,
} from "../../src/apps/cubic-agents/gate-evaluator.ts";

/**
 * P740 (HF-C): unit-test the post-verdict persistence verification path.
 *
 * The full GateEvaluatorAgent.evaluate() pipeline is heavy (depends on
 * createGateEvaluator and a real proposal projection); here we test the
 * applyVerdict / assertStatusAdvanced / assertMaturityDemoted helpers in
 * isolation by reaching into the prototype. The helpers are private but
 * testable because they only depend on the injected queryFn and
 * transitionProposalFn.
 */

type QueryRow = Record<string, any>;
type FakeQueryResult = { rows: QueryRow[]; rowCount?: number };

function makeAgent(
	queryHandler: (sql: string, params?: any[]) => Promise<FakeQueryResult>,
	transitionFn?: (
		id: number,
		newStatus: string,
		author?: string,
		summary?: string,
	) => Promise<any>,
): GateEvaluatorAgent {
	const queryFn = queryHandler as any;
	return new GateEvaluatorAgent(queryFn, 1, "D3", transitionFn ?? (async () => ({})));
}

const proposalBrief = {
	id: 99,
	display_id: "P099",
	title: "Test proposal",
	type: "feature",
	status: "DEVELOP",
	maturity: "mature",
	priority: null,
	summary: null,
	design: null,
} as any;

const gateD3 = {
	id: "D3",
	name: "D3",
	from_state: "DEVELOP",
	to_state: "MERGE",
	mode: "auto",
	clearance: 3,
} as any;

describe("P740 HF-C: applyVerdict persistence verification", () => {
	it("approve: re-reads status after transition; passes when status advanced", async () => {
		let transitionCalled = false;
		const calls: string[] = [];
		const queryHandler = async (sql: string): Promise<FakeQueryResult> => {
			calls.push(sql);
			if (sql.includes("SELECT status")) {
				return { rows: [{ status: "MERGE" }] };
			}
			return { rows: [] };
		};
		const transitionFn = async () => {
			transitionCalled = true;
		};
		const agent = makeAgent(queryHandler, transitionFn);
		const decision = { verdict: "approve", reason: "ok" } as any;
		await (agent as any).applyVerdict(proposalBrief, gateD3, decision);
		assert.equal(transitionCalled, true);
		assert.ok(calls.some((s) => s.includes("SELECT status")));
	});

	it("approve: throws GatePersistenceFailure when status didn't advance", async () => {
		const queryHandler = async (sql: string): Promise<FakeQueryResult> => {
			if (sql.includes("SELECT status")) {
				return { rows: [{ status: "DEVELOP" }] }; // unchanged
			}
			return { rows: [] };
		};
		const transitionFn = async () => {
			/* no-op: simulates silent SQL failure */
		};
		const agent = makeAgent(queryHandler, transitionFn);
		const decision = { verdict: "approve", reason: "ok" } as any;
		await assert.rejects(
			() => (agent as any).applyVerdict(proposalBrief, gateD3, decision),
			(err: unknown) => {
				assert.ok(err instanceof GatePersistenceFailure);
				const e = err as GatePersistenceFailure;
				assert.equal(e.kind, "status");
				assert.equal(e.expected, "MERGE");
				assert.equal(e.actual, "DEVELOP");
				assert.equal(e.proposalId, 99);
				assert.equal(e.displayId, "P099");
				return true;
			},
		);
	});

	it("hold: demotes maturity to active and verifies", async () => {
		const updates: string[] = [];
		const queryHandler = async (sql: string): Promise<FakeQueryResult> => {
			updates.push(sql);
			if (sql.includes("UPDATE roadmap_proposal.proposal")) return { rows: [] };
			if (sql.includes("INSERT INTO roadmap_proposal.proposal_discussions"))
				return { rows: [] };
			if (sql.includes("SELECT maturity")) return { rows: [{ maturity: "active" }] };
			return { rows: [] };
		};
		const agent = makeAgent(queryHandler);
		const decision = { verdict: "hold", reason: "AC unverified" } as any;
		await (agent as any).applyVerdict(proposalBrief, gateD3, decision);
		assert.ok(updates.some((s) => s.includes("UPDATE roadmap_proposal.proposal")));
		assert.ok(updates.some((s) => s.includes("SELECT maturity")));
	});

	it("hold: throws GatePersistenceFailure when maturity stays mature", async () => {
		const queryHandler = async (sql: string): Promise<FakeQueryResult> => {
			if (sql.includes("SELECT maturity")) return { rows: [{ maturity: "mature" }] };
			return { rows: [] };
		};
		const agent = makeAgent(queryHandler);
		const decision = { verdict: "hold", reason: "AC unverified" } as any;
		await assert.rejects(
			() => (agent as any).applyVerdict(proposalBrief, gateD3, decision),
			(err: unknown) => {
				assert.ok(err instanceof GatePersistenceFailure);
				const e = err as GatePersistenceFailure;
				assert.equal(e.kind, "maturity");
				assert.equal(e.expected, "active");
				assert.equal(e.actual, "mature");
				return true;
			},
		);
	});

	it("reject: demotes maturity to obsolete and verifies", async () => {
		const queryHandler = async (sql: string): Promise<FakeQueryResult> => {
			if (sql.includes("SELECT maturity")) return { rows: [{ maturity: "obsolete" }] };
			return { rows: [] };
		};
		const agent = makeAgent(queryHandler);
		const decision = { verdict: "reject", reason: "scope violation" } as any;
		// should not throw
		await (agent as any).applyVerdict(proposalBrief, gateD3, decision);
	});

	it("pending verdict is a no-op (no mutation, no read)", async () => {
		const calls: string[] = [];
		const queryHandler = async (sql: string): Promise<FakeQueryResult> => {
			calls.push(sql);
			return { rows: [] };
		};
		const agent = makeAgent(queryHandler);
		const decision = { verdict: "pending", reason: "deps unresolved" } as any;
		await (agent as any).applyVerdict(proposalBrief, gateD3, decision);
		assert.equal(calls.length, 0);
	});
});
