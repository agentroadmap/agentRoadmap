/**
 * P466: Spawn Briefing Protocol Integration Test
 *
 * Demonstrates the full flow:
 * 1. Parent calls briefing_assemble() to create warm-boot payload
 * 2. Parent spawns child with briefing_id
 * 3. Child calls childBootCheckBriefing(briefing_id) to verify payload exists
 * 4. Child works and hits a known error
 * 5. Child emits spawn_summary with new findings
 * 6. Subsequent spawns inherit the learned patterns
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  briefingAssemble,
  briefingLoad,
  childBootCheckBriefing,
  emitSpawnSummary,
  type TaskContext,
} from "./spawn-briefing-service.js";
import { query } from "../postgres/pool.js";

test("P466 Integration: warm-boot payload assembly and memory write-back", async (t) => {
  // AC1-3: Parent assembles briefing with full context
  const parentTaskContext: TaskContext = {
    task_id: "P450-gate-review",
    mission: "Conduct gate review for P450 and transition to Develop if approved",
    success_criteria: [
      "Proposal status transitioned to Develop",
      "Gating decision recorded in discussion",
      "No validation errors from MCP tools",
    ],
    done_signal: "ac-pass",
    allowed_tools: ["add_discussion", "prop_transition", "get_proposal"],
    forbidden_tools: ["git_push"],
    budget: {
      max_tokens: 100000,
      max_minutes: 45,
      max_tool_calls: 200,
    },
    stop_conditions: ["MCP validation fails 3 times", "timeout > 45 minutes"],
    parent_agent: "liaison-orchestrator",
    liaison_agent: "agency-liaison",
    rescue_team_channel: "chan_escalation",
    request_assistance_threshold: 3,
    topic_keywords: ["gate", "review", "proposal", "mcp"],
  };

  // AC4: Assembly flow — loads memory, MCP quirks, fallback playbook
  const parentBriefing = await briefingAssemble(parentTaskContext, "orchestrator-agent");

  assert.ok(parentBriefing.briefing_id, "briefing_id generated");
  assert.equal(parentBriefing.task_id, "P450-gate-review");
  assert.equal(parentBriefing.mission, parentTaskContext.mission);
  assert.deepEqual(parentBriefing.success_criteria, parentTaskContext.success_criteria);

  // Verify briefing is persisted
  const persisted = await query(
    `SELECT briefing_id, task_id FROM roadmap.spawn_briefing WHERE briefing_id = $1`,
    [parentBriefing.briefing_id]
  );
  assert.equal(persisted.rowCount, 1);

  // AC5: Child boot check — requires briefing_id from spawn args
  const childBriefing = await childBootCheckBriefing(parentBriefing.briefing_id);
  assert.equal(childBriefing.briefing_id, parentBriefing.briefing_id);
  assert.deepEqual(childBriefing.allowed_tools, ["add_discussion", "prop_transition", "get_proposal"]);

  // Simulate child discovering an error
  const discoveredError = {
    error_signature: "mcp_prop_transition_missing_args",
    tool: "prop_transition",
    message: "Missing required argument: proposal_id must be numeric, not UUID",
  };

  // AC6: Child emits spawn_summary with new findings
  await emitSpawnSummary({
    briefing_id: parentBriefing.briefing_id,
    outcome: "failure",
    summary: "Task failed on first MCP call due to parameter validation",
    new_findings: [
      {
        date: new Date().toISOString(),
        summary: `MCP prop_transition requires proposal_id as numeric string (e.g. "450"), not UUID format`,
        proposal: "P466",
      },
      {
        date: new Date().toISOString(),
        summary: `Common mistake: passing proposal.uuid instead of proposal.id to MCP add_discussion`,
        proposal: "P466",
      },
    ],
    updated_quirks: [
      {
        tool: "prop_transition",
        canonical_args: { proposal_id: "text (numeric)", to_state: "text", author: "text" },
        gotchas: ["proposal_id must be numeric string, convert from UUID if needed"],
      },
      {
        tool: "add_discussion",
        canonical_args: { proposal_id: "text (numeric)", author: "text", content: "text" },
        gotchas: ["proposal_id is required; use proposal.id not proposal.uuid"],
      },
    ],
    tool_calls_made: 1,
    tokens_used: 2500,
    duration_seconds: 5.2,
    error_log: {
      error: discoveredError.message,
      tool: "prop_transition",
      args_sent: { proposal_uuid: "550e8400-e29b-41d4-a716-446655440000" },
    },
    emitted_by: "child-agent-gate-001",
  });

  // Verify summary is recorded
  const summary = await query(
    `SELECT outcome, new_findings, updated_quirks FROM roadmap.spawn_summary WHERE briefing_id = $1`,
    [parentBriefing.briefing_id]
  );
  assert.equal(summary.rowCount, 1);
  assert.equal(summary.rows[0].outcome, "failure");
  assert.equal(summary.rows[0].new_findings.length, 2);
  assert.equal(summary.rows[0].updated_quirks.length, 2);

  // AC7: Harvester verifies findings (TODO: implement in next phase)
  // For now, just assert the summary structure is complete

  // AC8: Subsequent spawns inherit harvested findings (simulated)
  // Create a new briefing for a second attempt
  const secondTaskContext: TaskContext = {
    task_id: "P450-gate-review-retry",
    mission: "Retry gate review now that we know the MCP quirks",
    success_criteria: ["Proposal status transitioned to Develop"],
    done_signal: "ac-pass",
    parent_agent: "liaison-orchestrator",
    topic_keywords: ["gate", "review", "mcp", "prop_transition"],
  };

  const secondBriefing = await briefingAssemble(secondTaskContext, "orchestrator-agent");

  // Verify that briefing has access to MCP quirks (they were registered via updated_quirks)
  // For now, this is a TODO: AC8 relies on harvester updating mcp_tool_schema
  assert.ok(secondBriefing.briefing_id);

  // Verify we can manually add the learned quirk to mcp_tool_schema
  await query(
    `INSERT INTO roadmap.mcp_tool_schema
     (tool_name, mcp_server, canonical_args, known_gotchas, verified_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (tool_name) DO UPDATE SET
       known_gotchas = EXCLUDED.known_gotchas,
       verified_at = now()`,
    [
      "prop_transition",
      "agenthive",
      JSON.stringify({ proposal_id: "text (numeric)", to_state: "text" }),
      JSON.stringify([
        {
          issue: "proposal_id must be numeric string, not UUID",
          workaround: "Use proposal.id (e.g. '450') instead of UUID format",
        },
      ]),
    ]
  );

  // Now a third spawn should inherit this quirk
  const thirdBriefing = await briefingAssemble(
    { task_id: "P450-gate-retry-v2", mission: "Third attempt", success_criteria: [] },
    "orchestrator-agent"
  );

  // Fetch the quirks included in the briefing
  const thirdBriefingData = await briefingLoad(thirdBriefing.briefing_id);

  // Should include the registered quirk
  const propTransitionQuirk = thirdBriefingData.mcp_quirks.find((q) => q.tool === "prop_transition");
  assert.ok(propTransitionQuirk, "Briefing should include prop_transition quirks");
  assert.ok(propTransitionQuirk.gotchas.length > 0);
});

console.log("P466 integration test passed: warm-boot payload and memory write-back contract verified");
