/**
 * P466: Spawn Briefing Protocol Handler Tests
 *
 * Tests for MCP action handlers: briefing_assemble, briefing_load, spawn_summary_emit, etc.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  handleBriefingAssemble,
  handleBriefingLoad,
  handleChildBootCheck,
  handleSpawnSummaryEmit,
  handleBriefingList,
  handleFallbackPlaybookAdd,
  handleMcpQuirksRegister,
  type BriefingAssembleInput,
  type BriefingLoadInput,
  type SpawnSummaryEmitInput,
} from "./handlers.js";

test("handleBriefingAssemble: creates briefing via MCP action", async (t) => {
  const input: BriefingAssembleInput = {
    task_id: "test-p466-mcp-001",
    mission: "Test MCP briefing assembly",
    success_criteria: ["Briefing created", "Task completes"],
    briefed_by: "mcp-test-agent",
    allowed_tools: ["add_discussion", "prop_transition"],
    parent_agent: "liaison-orchestrator",
    topic_keywords: ["spawn", "briefing"],
  };

  const briefing = await handleBriefingAssemble(input);

  assert.ok(briefing.briefing_id);
  assert.equal(briefing.task_id, "test-p466-mcp-001");
  assert.equal(briefing.mission, "Test MCP briefing assembly");
  assert.deepEqual(briefing.allowed_tools, ["add_discussion", "prop_transition"]);
  assert.equal(briefing.briefed_by, "mcp-test-agent");
});

test("handleBriefingAssemble: requires task_id and mission", async (t) => {
  const inputMissingTaskId = {
    mission: "Mission",
    briefed_by: "agent",
  } as BriefingAssembleInput;

  let error: Error | null = null;
  try {
    await handleBriefingAssemble(inputMissingTaskId);
  } catch (e) {
    error = e as Error;
  }

  assert.ok(error);
  assert.match(error!.message, /task_id/);
});

test("handleBriefingLoad: retrieves briefing via MCP action", async (t) => {
  const assembleInput: BriefingAssembleInput = {
    task_id: "test-p466-mcp-002",
    mission: "Test briefing load",
    briefed_by: "mcp-test-agent",
  };

  const assembled = await handleBriefingAssemble(assembleInput);

  const loadInput: BriefingLoadInput = {
    briefing_id: assembled.briefing_id,
  };

  const loaded = await handleBriefingLoad(loadInput);

  assert.equal(loaded.briefing_id, assembled.briefing_id);
  assert.equal(loaded.task_id, "test-p466-mcp-002");
});

test("handleChildBootCheck: loads briefing and confirms ready", async (t) => {
  const assembleInput: BriefingAssembleInput = {
    task_id: "test-p466-mcp-003",
    mission: "Test child boot check",
    briefed_by: "mcp-test-agent",
  };

  const assembled = await handleBriefingAssemble(assembleInput);

  const bootCheck = await handleChildBootCheck({
    briefing_id: assembled.briefing_id,
  });

  assert.equal(bootCheck.status, "ready");
  assert.ok(bootCheck.briefing);
  assert.equal(bootCheck.briefing.briefing_id, assembled.briefing_id);
});

test("handleSpawnSummaryEmit: records completion summary", async (t) => {
  const assembleInput: BriefingAssembleInput = {
    task_id: "test-p466-mcp-004",
    mission: "Test spawn summary emit",
    briefed_by: "mcp-test-agent",
  };

  const briefing = await handleBriefingAssemble(assembleInput);

  const summaryInput: SpawnSummaryEmitInput = {
    briefing_id: briefing.briefing_id,
    outcome: "success",
    summary: "Task completed",
    new_findings: [
      {
        summary: "Discovered MCP quirk with add_discussion",
        proposal: "P466",
      },
    ],
    updated_quirks: [
      {
        tool: "add_discussion",
        canonical_args: { proposal_id: "text", author: "text", content: "text" },
        gotchas: ["requires numeric proposal_id"],
      },
    ],
    tool_calls_made: 10,
    tokens_used: 5000,
    duration_seconds: 30,
    emitted_by: "child-agent",
  };

  const result = await handleSpawnSummaryEmit(summaryInput);

  assert.ok(result.id);
  assert.equal(result.briefing_id, briefing.briefing_id);
  assert.equal(result.outcome, "success");
});

test("handleSpawnSummaryEmit: validates outcome enum", async (t) => {
  const input = {
    briefing_id: "00000000-0000-0000-0000-000000000000",
    outcome: "invalid_outcome" as any,
    emitted_by: "agent",
  };

  let error: Error | null = null;
  try {
    await handleSpawnSummaryEmit(input);
  } catch (e) {
    error = e as Error;
  }

  assert.ok(error);
  assert.match(error!.message, /outcome must be/);
});

test("handleBriefingList: lists recent briefings", async (t) => {
  // Create a few briefings
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const input: BriefingAssembleInput = {
      task_id: `test-list-${i}`,
      mission: `Test briefing ${i}`,
      briefed_by: "mcp-test-agent",
    };
    const briefing = await handleBriefingAssemble(input);
    ids.push(briefing.briefing_id);
  }

  const list = await handleBriefingList({ limit: 10 });

  assert.ok(list.length > 0);
  // Should include at least our test briefings
  const testBriefings = list.filter((b) => ids.includes(b.briefing_id));
  assert.equal(testBriefings.length, 3);
});

test("handleFallbackPlaybookAdd: records error recovery pattern", async (t) => {
  const input = {
    error_signature: `test_error_sig_${Date.now()}`,
    tool_name: "test_tool",
    error_class: "ValidationError",
    try_action: "Use correct parameter names",
    rationale: "MCP tools have specific param requirements",
    source_proposal: "P466",
    confidence: 0.9,
  };

  const result = await handleFallbackPlaybookAdd(input);

  assert.ok(result.id);
  assert.equal(result.error_signature, input.error_signature);
});

test("handleFallbackPlaybookAdd: requires error_signature and try_action", async (t) => {
  const inputMissingSig = {
    try_action: "Do something",
  } as any;

  let error: Error | null = null;
  try {
    await handleFallbackPlaybookAdd(inputMissingSig);
  } catch (e) {
    error = e as Error;
  }

  assert.ok(error);
  assert.match(error!.message, /error_signature/);
});

test("handleMcpQuirksRegister: registers MCP tool schema", async (t) => {
  const input = {
    tool_name: `test_quirk_tool_${Date.now()}`,
    mcp_server: "agenthive",
    canonical_args: {
      proposal_id: "text (numeric string)",
      author: "text",
      content: "text",
    },
    description: "Test tool for P466",
    known_gotchas: [
      {
        issue: "proposal_id must be numeric",
        workaround: "Use proposal.id not proposal.uuid",
      },
    ],
    param_aliases: {
      proposal_uuid: "proposal_id",
    },
  };

  const result = await handleMcpQuirksRegister(input);

  assert.equal(result.tool_name, input.tool_name);
  assert.ok(result.registered_at);
});

test("handleMcpQuirksRegister: requires canonical_args", async (t) => {
  const inputMissingArgs = {
    tool_name: "test_tool",
  } as any;

  let error: Error | null = null;
  try {
    await handleMcpQuirksRegister(inputMissingArgs);
  } catch (e) {
    error = e as Error;
  }

  assert.ok(error);
  assert.match(error!.message, /canonical_args/);
});

console.log("All P466 MCP handler tests passed");
