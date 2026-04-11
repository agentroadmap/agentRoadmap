/**
 * AgentHive Orchestrator — Event-driven agent dispatcher using MCP cubic tools.
 * 
 * Watches for proposal state changes via pg_notify and dispatches
 * the right expert agent into a cubic using the MCP tools:
 *   - cubic_create: create workspace
 *   - cubic_focus: acquire lock and set focus
 *   - cubic_transition: move to next phase and release lock
 *   - cubic_recycle: reuse cubic for new task
 * 
 * Workflow mapping:
 *   DRAFT → design phase (Architect enhances)
 *   REVIEW → design phase (Reviewer evaluates)
 *   DEVELOP → build phase (Developer implements)
 *   MERGE → test phase (Merge Agent integrates)
 *   COMPLETE → ship phase (Deployed)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { getPool, query } from "../src/infra/postgres/pool.ts";

const MCP_URL = "http://127.0.0.1:6421/sse";

const GATE_READY_CHANNEL = "proposal_gate_ready";
const MATURITY_CHANGED_CHANNEL = "proposal_maturity_changed";
const TRANSITION_QUEUED_CHANNEL = "transition_queued";

const logger = {
  log: (...args: unknown[]) => console.log("[Orchestrator]", ...args),
  warn: (...args: unknown[]) => console.warn("[Orchestrator]", ...args),
  error: (...args: unknown[]) => console.error("[Orchestrator]", ...args),
};

// Map proposal status to cubic phase
const STATE_TO_PHASE: Record<string, string> = {
  DRAFT: "design",
  REVIEW: "design",
  TRIAGE: "design",
  FIX: "build",
  DEVELOP: "build",
  MERGE: "test",
  COMPLETE: "ship",
  DEPLOYED: "ship",
};

// Map proposal status to agent type
const STATE_TO_AGENT: Record<string, string> = {
  DRAFT: "architect",
  REVIEW: "reviewer",
  TRIAGE: "triage-agent",
  FIX: "fix-agent",
  DEVELOP: "coder",
  MERGE: "merge-agent",
};

// Agent prompts for each state
const AGENT_PROMPTS: Record<string, string> = {
  DRAFT: "You are an Architecture Agent. Enhance this DRAFT proposal with acceptance criteria, design rationale, and implementation plan. Move to REVIEW when complete.",
  REVIEW: "You are an RFC Reviewer. Evaluate this proposal for coherence, economic optimization, and structural soundness. Check all acceptance criteria. Advance to DEVELOP if mature.",
  TRIAGE: "You are a Triage Agent. Evaluate this issue. If already fixed, move to FIX → DEPLOYED. If needs work, move to FIX.",
  FIX: "You are a Fix Agent. Implement the code changes to resolve this issue. Write tests. Move to DEPLOYED when complete.",
  DEVELOP: "You are a Senior Developer. Implement all acceptance criteria. Write production code and tests. Set maturity to mature when all ACs are met.",
  MERGE: "You are a Merge Agent. Integrate worktree branches into main. Run tests. Verify integration. Advance to COMPLETE.",
};

interface Proposal {
  id: string;
  display_id: string;
  status: string;
  type: string;
  title: string;
  maturity_state: string;
}

// Get MCP client connection
async function getMcpClient(): Promise<Client> {
  const transport = new SSEClientTransport(new URL(MCP_URL));
  const client = new Client({ name: "orchestrator", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

// Create a cubic for an agent
async function createCubicForAgent(proposal: Proposal): Promise<string | null> {
  const client = await getMcpClient();
  try {
    const agent = STATE_TO_AGENT[proposal.status] || "coder";
    const result = await client.callTool({
      name: "cubic_create",
      arguments: {
        name: `${agent} — ${proposal.display_id} ${proposal.title.substring(0, 40)}`,
        agents: [agent, "reviewer"],
        proposals: [proposal.display_id],
      },
    });
    const data = JSON.parse(result.content?.[0]?.text || "{}");
    if (data.success && data.cubic) {
      logger.log(`📦 Created cubic ${data.cubic.id} for ${proposal.display_id}`);
      return data.cubic.id;
    }
    return null;
  } finally {
    await client.close();
  }
}

// Focus a cubic (acquire lock)
async function focusCubic(cubicId: string, agent: string, task: string, phase: string): Promise<boolean> {
  const client = await getMcpClient();
  try {
    const result = await client.callTool({
      name: "cubic_focus",
      arguments: { cubicId, agent, task, phase },
    });
    const text = result.content?.[0]?.text || "";
    return text.includes("success") || text.includes("locked");
  } finally {
    await client.close();
  }
}

// Transition cubic to next phase (release lock)
async function transitionCubic(cubicId: string, toPhase: string): Promise<boolean> {
  const client = await getMcpClient();
  try {
    const result = await client.callTool({
      name: "cubic_transition",
      arguments: { cubicId, toPhase },
    });
    const text = result.content?.[0]?.text || "";
    return text.includes("success") || text.includes("transitioned");
  } finally {
    await client.close();
  }
}

// Recycle cubic for reuse
async function recycleCubic(cubicId: string): Promise<boolean> {
  const client = await getMcpClient();
  try {
    const result = await client.callTool({
      name: "cubic_recycle",
      arguments: { cubicId, resetCode: true },
    });
    const text = result.content?.[0]?.text || "";
    return text.includes("success") || text.includes("recycled");
  } finally {
    await client.close();
  }
}

// Find existing cubic for this agent type
async function findExistingCubic(agentType: string): Promise<string | null> {
  const client = await getMcpClient();
  try {
    const result = await client.callTool({
      name: "cubic_list",
      arguments: {},
    });
    const text = result.content?.[0]?.text || "";
    const data = JSON.parse(text);
    
    // Find a cubic that matches our agent type and is not locked
    for (const cubic of data.cubics || []) {
      if (cubic.name?.toLowerCase().includes(agentType.toLowerCase()) && !cubic.lock) {
        return cubic.id;
      }
    }
    return null;
  } finally {
    await client.close();
  }
}

async function handleProposal(proposal: Proposal) {
  const agent = STATE_TO_AGENT[proposal.status];
  const phase = STATE_TO_PHASE[proposal.status];
  
  if (!agent || !phase) {
    logger.log(`No agent for state: ${proposal.status}`);
    return;
  }

  // Try to find existing cubic, or create new one
  let cubicId = await findExistingCubic(agent);
  if (!cubicId) {
    cubicId = await createCubicForAgent(proposal);
  }

  if (!cubicId) {
    logger.error(`Failed to create/find cubic for ${proposal.display_id}`);
    return;
  }

  // Focus the cubic (acquire lock)
  const task = `${AGENT_PROMPTS[proposal.status]} Working on: ${proposal.display_id} - ${proposal.title}`;
  const locked = await focusCubic(cubicId, agent, task, phase);
  
  if (locked) {
    logger.log(`🔒 ${agent} locked ${cubicId} for ${proposal.display_id} (phase: ${phase})`);
    logger.log(`   Task: ${task.substring(0, 100)}...`);
  } else {
    logger.warn(`Failed to lock ${cubicId} for ${proposal.display_id}`);
  }
}

async function pollAndDispatch() {
  const states = ["DRAFT", "REVIEW", "TRIAGE", "FIX", "DEVELOP", "MERGE"];
  
  for (const state of states) {
    const result = await query(
      `SELECT id, display_id, status, type, title, maturity_state 
       FROM roadmap.proposal 
       WHERE status = $1 AND maturity_state = 'new' 
       ORDER BY priority DESC NULLS LAST 
       LIMIT 3`,
      [state]
    );
    
    if (result.rows.length > 0) {
      logger.log(`📋 ${state}: ${result.rows.length} proposals ready`);
      for (const p of result.rows) {
        await handleProposal(p);
      }
    }
  }
}

async function handleStateChange(payload: string) {
  try {
    const data = JSON.parse(payload);
    const proposalId = data.proposal_id || data.id;

    if (!proposalId) return;

    const result = await query(
      "SELECT id, display_id, status, type, title, maturity_state FROM roadmap.proposal WHERE id = $1",
      [proposalId]
    );

    if (result.rows.length > 0) {
      const proposal = result.rows[0];
      logger.log(`📨 State change: ${proposal.display_id} → ${proposal.status} (${proposal.maturity_state})`);
      await handleProposal(proposal);
    }
  } catch (err) {
    logger.error("Error handling state change:", err);
  }
}

async function main() {
  logger.log("Starting Orchestrator with MCP cubic tools...");

  const pool = getPool();
  const pgClient = await pool.connect();

  // Listen for state changes
  await pgClient.query(`LISTEN ${GATE_READY_CHANNEL}`);
  await pgClient.query(`LISTEN ${MATURITY_CHANGED_CHANNEL}`);
  await pgClient.query(`LISTEN ${TRANSITION_QUEUED_CHANNEL}`);

  logger.log("Listening for notifications on pg_notify channels");

  // Handle notifications
  pgClient.on("notification", (msg: { channel: string; payload?: string }) => {
    if (msg.payload) {
      handleStateChange(msg.payload);
    }
  });

  // Initial poll
  logger.log("Running initial poll...");
  await pollAndDispatch();

  // Poll every 5 minutes
  setInterval(() => pollAndDispatch(), 5 * 60 * 1000);

  logger.log("Orchestrator running. Waiting for state changes...");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down...`);
    pgClient.release();
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
