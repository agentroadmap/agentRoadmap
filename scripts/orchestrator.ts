/**
 * AgentHive Orchestrator — Event-driven agent dispatcher.
 * 
 * Watches for proposal state changes via pg_notify and dispatches
 * the right expert agent into a cubic for each state transition.
 * 
 * This is the "brain" that keeps the machine running:
 *   DRAFT → Architect (enhance with ACs)
 *   REVIEW → Reviewer (evaluate and decide)  
 *   DEVELOP → Developer (implement code)
 *   MERGE → Merge Agent (integrate and test)
 *   COMPLETE → Archive
 * 
 * The orchestrator listens on channels:
 *   - proposal_maturity_changed (when an agent signals maturity)
 *   - transition_queued (when a gate approves a transition)
 *   - proposal_gate_ready (when PipelineCron processes)
 */

import { basename } from "node:path";
import { getPool, query } from "../src/infra/postgres/pool.ts";

const GATE_READY_CHANNEL = "proposal_gate_ready";
const MATURITY_CHANGED_CHANNEL = "proposal_maturity_changed";
const TRANSITION_QUEUED_CHANNEL = "transition_queued";

const logger = {
  log: (...args: unknown[]) => console.log("[Orchestrator]", ...args),
  warn: (...args: unknown[]) => console.warn("[Orchestrator]", ...args),
  error: (...args: unknown[]) => console.error("[Orchestrator]", ...args),
};

// Agent dispatch map: state → agent type
const AGENT_DISPATCH: Record<string, { agent: string; prompt: string }> = {
  DRAFT: {
    agent: "architect",
    prompt: "You are an Architecture Agent. Enhance this DRAFT proposal with acceptance criteria, design rationale, and implementation plan. Move to REVIEW when complete.",
  },
  REVIEW: {
    agent: "reviewer",
    prompt: "You are an RFC Reviewer. Evaluate this proposal for coherence, economic optimization, and structural soundness. Check all acceptance criteria are well-defined. Advance to DEVELOP if mature.",
  },
  TRIAGE: {
    agent: "triage-agent",
    prompt: "You are a Triage Agent. Evaluate this issue. If it's already fixed in codebase, move to FIX → DEPLOYED. If it needs work, move to FIX.",
  },
  FIX: {
    agent: "fix-agent",
    prompt: "You are a Fix Agent. Implement the code changes to resolve this issue. Write tests. Move to DEPLOYED when complete.",
  },
  DEVELOP: {
    agent: "developer",
    prompt: "You are a Senior Developer. Implement all acceptance criteria for this proposal. Write production code and tests. Set maturity to mature when all ACs are met.",
  },
  MERGE: {
    agent: "merge-agent",
    prompt: "You are a Merge Agent. Integrate worktree branches into main. Run tests. Verify integration. Advance to COMPLETE.",
  },
};

interface Proposal {
  id: string;
  display_id: string;
  status: string;
  type: string;
  title: string;
  maturity_state: string;
}

async function getProposal(id: string): Promise<Proposal | null> {
  const result = await query(
    "SELECT id, display_id, status, type, title, maturity_state FROM roadmap.proposal WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

async function getProposalsByState(status: string): Promise<Proposal[]> {
  const result = await query(
    "SELECT id, display_id, status, type, title, maturity_state FROM roadmap.proposal WHERE status = $1 ORDER BY priority DESC NULLS LAST",
    [status]
  );
  return result.rows;
}

function shouldDispatch(proposal: Proposal): boolean {
  // Only dispatch if proposal is new (not already being worked on)
  return proposal.maturity_state === "new";
}

function buildAgentPrompt(proposal: Proposal): string {
  const dispatch = AGENT_DISPATCH[proposal.status];
  if (!dispatch) return "";

  return `${dispatch.prompt}

PROPOSAL: ${proposal.display_id} - ${proposal.title}
TYPE: ${proposal.type}
STATUS: ${proposal.status}
MATURITY: ${proposal.maturity_state}

Project root: /data/code/AgentHive
MCP server: http://127.0.0.1:6421/sse

1. Read proposal details via MCP: prop_get { id: "${proposal.display_id}" }
2. Read acceptance criteria: list_ac { proposalId: "${proposal.display_id}" }
3. Do the work described above
4. Update proposal state via MCP
5. Commit changes with message referencing ${proposal.display_id}

Script pattern:
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
const transport = new SSEClientTransport(new URL("http://127.0.0.1:6421/sse"));
const client = new Client({ name: "${dispatch.agent}", version: "1.0.0" });
await client.connect(transport);
// ... work ...
await client.close();`;
}

async function handleStateChange(payload: string) {
  try {
    const data = JSON.parse(payload);
    const proposalId = data.proposal_id || data.id;

    if (!proposalId) {
      logger.warn("State change without proposal_id:", payload);
      return;
    }

    const proposal = await getProposal(proposalId);
    if (!proposal) {
      logger.warn(`Proposal ${proposalId} not found`);
      return;
    }

    const dispatch = AGENT_DISPATCH[proposal.status];
    if (!dispatch) {
      logger.log(`No agent for state: ${proposal.status} (${proposal.display_id})`);
      return;
    }

    if (!shouldDispatch(proposal)) {
      logger.log(`Skipping ${proposal.display_id} (maturity: ${proposal.maturity_state})`);
      return;
    }

    logger.log(`🚀 Dispatching ${dispatch.agent} for ${proposal.display_id} (${proposal.status})`);
    logger.log(`   Title: ${proposal.title}`);

    // Log the dispatch event
    await query(
      `INSERT INTO roadmap.audit_log (actor, action, resource_type, resource_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        "orchestrator",
        "agent_dispatch",
        "proposal",
        proposalId,
        JSON.stringify({ agent: dispatch.agent, state: proposal.status }),
      ]
    );
  } catch (err) {
    logger.error("Error handling state change:", err);
  }
}

async function pollReadyProposals() {
  for (const state of Object.keys(AGENT_DISPATCH)) {
    const proposals = await getProposalsByState(state);
    const ready = proposals.filter(shouldDispatch);

    if (ready.length > 0) {
      logger.log(`📋 ${state}: ${ready.length} proposals ready for ${AGENT_DISPATCH[state].agent}`);
      for (const p of ready.slice(0, 3)) {
        logger.log(`   → ${p.display_id}: ${p.title}`);
      }
    }
  }
}

async function main() {
  logger.log("Starting Orchestrator Agent Dispatcher...");

  const pool = getPool();
  const client = await pool.connect();

  // Listen for state change notifications
  await client.query(`LISTEN ${GATE_READY_CHANNEL}`);
  await client.query(`LISTEN ${MATURITY_CHANGED_CHANNEL}`);
  await client.query(`LISTEN ${TRANSITION_QUEUED_CHANNEL}`);

  logger.log("Listening for notifications on:");
  logger.log(`  - ${GATE_READY_CHANNEL}`);
  logger.log(`  - ${MATURITY_CHANGED_CHANNEL}`);
  logger.log(`  - ${TRANSITION_QUEUED_CHANNEL}`);

  // Handle incoming notifications
  client.on("notification", (msg: { channel: string; payload?: string }) => {
    logger.log(`📨 Notification on ${msg.channel}`);
    if (msg.payload) {
      handleStateChange(msg.payload);
    }
  });

  // Poll for ready proposals every 5 minutes
  await pollReadyProposals();
  setInterval(() => pollReadyProposals(), 5 * 60 * 1000);

  logger.log("Orchestrator is running. Waiting for state changes...");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down...`);
    client.release();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[Orchestrator] Fatal error:", err);
  process.exit(1);
});
