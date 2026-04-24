import process from "node:process";

type ProposalSpec = {
	displayId: string;
	type: "component" | "feature" | "issue";
	title: string;
	summary: string;
	motivation: string;
	design: string;
	dependency?: string;
};

const proposals: ProposalSpec[] = [
	{
		displayId: "P410",
		type: "component",
		title: "Control Database Boundary",
		summary:
			"Define the ownership boundary between agenthive_control and per-project databases.",
		motivation:
			"AgentHive is now used to develop AgentHive, so platform state must not be mixed with project-domain data.",
		design:
			"Keep proposals, workflow, dispatch, leases, reviews, budgets, agents, providers, routes, context policy, and control-panel state in agenthive_control with project_id. Keep only project domain/runtime data in project databases.",
	},
	{
		displayId: "P411",
		type: "feature",
		title: "Control Database Bootstrap",
		summary:
			"Create agenthive_control and bootstrap schemas for identity, runtime, projects, git, workforce, models, budgets, dispatch, workflow, docs, and audit.",
		motivation:
			"Shared services need one authoritative database for multi-project operation.",
		design:
			"Create schema-qualified, idempotent migrations and compatibility views for the transition window.",
		dependency: "P410",
	},
	{
		displayId: "P412",
		type: "feature",
		title: "Project Domain Database Isolation",
		summary:
			"Move project domain/runtime tables into one registered database per project.",
		motivation:
			"Project data should be isolated without splitting AgentHive workflow state.",
		design:
			"Register every project database in the control DB and route project-domain tools through PoolManager with explicit project context.",
		dependency: "P410,P411",
	},
	{
		displayId: "P413",
		type: "issue",
		title: "Dispatch and Agency Hardening",
		summary:
			"Deduplicate work offers, enforce agency project subscriptions, and prevent claim storms.",
		motivation:
			"Stable agencies can create many per-dispatch workers; without claim policy one agency can take over the queue.",
		design:
			"Require project_id, proposal_id, role, and required_capabilities on offers; enforce claim policy and expose stop controls.",
		dependency: "P410",
	},
	{
		displayId: "P414",
		type: "feature",
		title: "Provider Route and Budget Governance",
		summary:
			"Normalize provider accounts, model routes, credentials, budgets, and context policy.",
		motivation:
			"Provider access is a route plus account, CLI, auth source, host policy, budget, and context policy, not just a model name.",
		design:
			"Store provider accounts, model catalog, model routes, hierarchical budgets, and context policies in the control DB.",
		dependency: "P410,P411",
	},
	{
		displayId: "P415",
		type: "feature",
		title: "Control Panel Observability",
		summary:
			"Make TUI, web, and mobile feeds show project, proposal, dispatch, agency, worker, host, model route, provider, CLI, budget, and stop scope.",
		motivation:
			"Operators need to identify and stop runaway agents without guessing from partial feed lines.",
		design:
			"Build common control-panel event shapes on top of agenthive_control and audit every operator action.",
		dependency: "P410,P413",
	},
	{
		displayId: "P416",
		type: "issue",
		title: "Schema Reconciliation for Control Plane",
		summary:
			"Resolve migration drift and classify proposal/workflow state as control-plane data.",
		motivation:
			"Inconsistent project_id and provider/dispatch schema definitions block reliable runtime invariants.",
		design:
			"Choose one authoritative migration path, canonicalize project_id types, and classify every table as control, project, or projection.",
		dependency: "P410,P411",
	},
	{
		displayId: "P417",
		type: "issue",
		title: "Dispatch Idempotency and Transition Leases",
		summary:
			"Make dispatch rows the idempotency boundary for state-machine work.",
		motivation:
			"Checking agent_runs is too late; duplicate offers may already be posted and claimed.",
		design:
			"Add deterministic dispatch idempotency keys and lease transition processing before dispatch creation.",
		dependency: "P413",
	},
	{
		displayId: "P418",
		type: "issue",
		title: "Claim Policy Must Fail Closed",
		summary:
			"Reject claims when project scope, capabilities, route, host, or budget policy is missing.",
		motivation:
			"Empty required capabilities or missing project scope allow the wrong agencies to claim work.",
		design:
			"Move claim eligibility into database policy and record durable rejection reasons.",
		dependency: "P413,P414",
	},
	{
		displayId: "P419",
		type: "issue",
		title: "State Machine Concurrency Ceilings",
		summary:
			"Enforce hard active-claim and worker ceilings by global, project, host, agency, proposal, state, and role scopes.",
		motivation:
			"Without transaction-enforced ceilings, one healthy agency can overload the state machine.",
		design:
			"Check active claims and workers in the same transaction that grants a claim.",
		dependency: "P413",
	},
	{
		displayId: "P420",
		type: "issue",
		title: "Dispatch Retry and Terminal Semantics",
		summary: "Prevent failed work from reissuing endlessly as new dispatches.",
		motivation:
			"Failure loops currently look like progress and can trigger spawn storms.",
		design:
			"Define dispatch lifecycle states, retry attempts, cooldowns, retryable errors, and terminal outcomes.",
		dependency: "P417",
	},
	{
		displayId: "P421",
		type: "component",
		title: "Service Topology Ownership",
		summary: "Define one state-machine owner per service responsibility.",
		motivation:
			"Orchestrator, gate pipeline, offer providers, MCP, feed listeners, and workers overlap responsibilities.",
		design:
			"Document active/passive behavior, service leases, heartbeats, drain semantics, and restart runbooks.",
		dependency: "P411,P415",
	},
	{
		displayId: "P422",
		type: "feature",
		title: "Operator Stop and Cancel Controls",
		summary: "Add DB-backed cancel, suspend, drain, and terminate operations.",
		motivation:
			"Killing OS processes alone is insufficient because the database may respawn work.",
		design:
			"Expose stop scopes for project, proposal, dispatch, claim, agency, worker, host, and provider route with audit logs.",
		dependency: "P413,P415",
	},
	{
		displayId: "P423",
		type: "feature",
		title: "State Feed Causal IDs",
		summary:
			"Add causal identifiers and stop scopes to TUI, web, and mobile events.",
		motivation:
			"Feed lines need enough IDs to explain why an agent is running and how to stop it.",
		design:
			"Emit project, proposal, transition, dispatch, claim, run, agency, worker, host, route, model, budget, and auth-source-class fields.",
		dependency: "P415",
	},
	{
		displayId: "P424",
		type: "issue",
		title: "Host, Provider, and Route Separation",
		summary:
			"Separate host, agency, provider account, model route, CLI, and worktree policy.",
		motivation:
			"Host identity and worktree hints are currently confused with provider and agency ownership.",
		design:
			"Resolve route, credentials, host policy, and worktree policy as separate control-plane decisions before spawn.",
		dependency: "P414",
	},
	{
		displayId: "P425",
		type: "feature",
		title: "State Machine Race Integration Tests",
		summary:
			"Cover duplicate polls, concurrent claims, retries, cancellation, and policy failures with Postgres-backed tests.",
		motivation:
			"The dangerous failures are transaction races, not only unit-level logic bugs.",
		design:
			"Add tests for dispatch idempotency, concurrent claims, failed spawn retries, cancellation, agency suspension, budget blocks, and host-policy blocks.",
		dependency: "P417,P418,P420",
	},
	{
		displayId: "P426",
		type: "issue",
		title: "MCP Runtime Reliability",
		summary:
			"Make MCP health, transport compatibility, and proposal-tool readiness observable.",
		motivation:
			"Proposal workflow depends on MCP, but failures currently surface as opaque transport errors.",
		design:
			"Expose direct smoke-test methods, separate service and database health, preserve structured tool errors, and document deployment verification.",
		dependency: "P410",
	},
	{
		displayId: "P427",
		type: "issue",
		title: "Cubic Worktree Path Normalization",
		summary:
			"Normalize cubic paths and repair legacy /data/code/worktree-* rows.",
		motivation:
			"Active cubics can point at stale or nonexistent legacy worktree paths, making the feed misleading and spawned work unsafe.",
		design:
			"Fix fn_acquire_cubic defaults, make cubic_create use the canonical root, pass selected executor paths from the orchestrator, and provide a dry-run/apply repair script.",
		dependency: "P413,P423",
	},
];

function hasApplyFlag(): boolean {
	return process.argv.includes("--apply");
}

async function main() {
	const apply = hasApplyFlag();
	if (!apply) {
		for (const proposal of proposals) {
			console.log(
				`DRY RUN ${proposal.displayId} ${proposal.type}: ${proposal.title}`,
			);
		}
		console.log("\nRun with --apply to create/update through MCP.");
		return;
	}

	const module = await import("../src/apps/mcp-server/server.ts");
	const createMcpServer =
		module.createMcpServer ?? module.default?.createMcpServer;
	if (!createMcpServer) {
		throw new Error("createMcpServer export not found.");
	}

	const server = await createMcpServer(process.cwd());
	try {
		for (const proposal of proposals) {
			const getResult = await server.invokeTool("mcp_proposal", {
				action: "get",
				args: { id: proposal.displayId },
			});
			const getText = getResult.content?.[0]?.text ?? "";
			if (getText.startsWith("⚠️")) {
				throw new Error(`${proposal.displayId}: ${getText}`);
			}
			const exists = !getText.includes(
				`Proposal ${proposal.displayId} not found`,
			);
			const action = exists ? "update" : "create";
			const args = exists
				? {
						id: proposal.displayId,
						title: proposal.title,
						summary: proposal.summary,
						motivation: proposal.motivation,
						design: proposal.design,
						dependency: proposal.dependency,
						author: "codex",
					}
				: {
						display_id: proposal.displayId,
						type: proposal.type,
						title: proposal.title,
						status: "DRAFT",
						summary: proposal.summary,
						motivation: proposal.motivation,
						design: proposal.design,
						dependency: proposal.dependency,
						author: "codex",
					};
			const result = await server.invokeTool("mcp_proposal", { action, args });
			const text = result.content?.[0]?.text ?? JSON.stringify(result);
			if (text.startsWith("⚠️")) {
				throw new Error(`${proposal.displayId}: ${text}`);
			}
			console.log(`${proposal.displayId}: ${text}`);
		}
	} finally {
		await server.stop();
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
