/**
 * P466: Spawn Briefing Protocol handlers
 *
 * MCP actions:
 * - briefing_assemble: parent assembles warm-boot payload before spawn
 * - briefing_load: child loads briefing and verifies it exists (fail-closed)
 * - spawn_summary_emit: child emits completion notification for harvester
 * - briefing_list: list recent briefings for debugging
 * - fallback_playbook_add: curator adds error recovery patterns
 * - mcp_quirks_register: register known MCP param quirks
 */

import {
  briefingAssemble,
  briefingLoad,
  childBootCheckBriefing,
  emitSpawnSummary,
  type TaskContext,
  type SpawnBriefing,
  type SpawnSummaryPayload,
} from "../../../../infra/agency/spawn-briefing-service.js";
import { query } from "../../../../infra/postgres/pool.js";

export interface BriefingAssembleInput {
  task_id: string;
  mission: string;
  success_criteria?: string[];
  done_signal?: "ac-pass" | "verdict" | "pr-merged" | "custom";
  allowed_tools?: string[];
  forbidden_tools?: string[];
  budget?: {
    max_tokens?: number | null;
    max_minutes?: number | null;
    max_tool_calls?: number | null;
  };
  stop_conditions?: string[];
  parent_agent?: string;
  liaison_agent?: string;
  rescue_team_channel?: string;
  request_assistance_threshold?: number;
  topic_keywords?: string[];
  briefed_by: string;
}

export interface BriefingLoadInput {
  briefing_id: string;
}

export interface SpawnSummaryEmitInput {
  briefing_id: string;
  outcome: "success" | "partial" | "failure" | "timeout" | "escalated";
  summary?: string;
  new_findings?: Array<{ date?: string; summary: string; proposal?: string }>;
  updated_quirks?: Array<{ tool: string; canonical_args?: Record<string, any>; gotchas?: string[] }>;
  tool_calls_made?: number;
  tokens_used?: number;
  duration_seconds?: number;
  error_log?: Record<string, any>;
  state_snapshot?: Record<string, any>;
  emitted_by: string;
}

export interface BriefingListInput {
  limit?: number;
  offset?: number;
}

export interface FallbackPlaybookAddInput {
  error_signature: string;
  tool_name?: string;
  error_class?: string;
  try_action: string;
  rationale?: string;
  source_proposal?: string;
  confidence?: number;
}

export interface McpQuirksRegisterInput {
  tool_name: string;
  mcp_server?: string;
  canonical_args: Record<string, string>;
  description?: string;
  known_gotchas?: Array<{ issue: string; workaround: string }>;
  param_aliases?: Record<string, string>;
}

/**
 * briefing_assemble: Parent assembles warm-boot payload before spawn
 *
 * Steps:
 * 1. Validate task context
 * 2. Call briefingAssemble() service
 * 3. Return briefing_id and payload snapshot
 */
export async function handleBriefingAssemble(input: BriefingAssembleInput): Promise<SpawnBriefing> {
  if (!input.task_id?.trim()) {
    throw new Error("task_id is required");
  }
  if (!input.mission?.trim()) {
    throw new Error("mission is required");
  }
  if (!input.briefed_by?.trim()) {
    throw new Error("briefed_by (agent identity) is required");
  }

  const taskContext: TaskContext = {
    task_id: input.task_id,
    mission: input.mission,
    success_criteria: input.success_criteria || [],
    done_signal: input.done_signal,
    allowed_tools: input.allowed_tools,
    forbidden_tools: input.forbidden_tools,
    budget: input.budget,
    stop_conditions: input.stop_conditions,
    parent_agent: input.parent_agent,
    liaison_agent: input.liaison_agent,
    rescue_team_channel: input.rescue_team_channel,
    request_assistance_threshold: input.request_assistance_threshold,
    topic_keywords: input.topic_keywords,
  };

  return await briefingAssemble(taskContext, input.briefed_by);
}

/**
 * briefing_load: Child loads briefing and verifies it exists (fail-closed)
 *
 * If briefing_id is missing or not found, throws error and prevents spawn.
 */
export async function handleBriefingLoad(input: BriefingLoadInput): Promise<SpawnBriefing> {
  if (!input.briefing_id?.trim()) {
    throw new Error("briefing_id is required");
  }

  return await briefingLoad(input.briefing_id);
}

/**
 * child_boot_check: Child calls at startup to verify warm-boot payload
 *
 * Fails closed if briefing_id missing or not found.
 */
export async function handleChildBootCheck(input: BriefingLoadInput): Promise<{ status: string; briefing: SpawnBriefing }> {
  const briefing = await childBootCheckBriefing(input.briefing_id);
  return {
    status: "ready",
    briefing,
  };
}

/**
 * spawn_summary_emit: Child emits completion notification for harvester
 *
 * Records outcome, new findings, and quirks update.
 * Subsequent spawns inherit the harvested findings.
 */
export async function handleSpawnSummaryEmit(
  input: SpawnSummaryEmitInput
): Promise<{ id: number; briefing_id: string; outcome: string }> {
  if (!input.briefing_id?.trim()) {
    throw new Error("briefing_id is required");
  }
  if (!["success", "partial", "failure", "timeout", "escalated"].includes(input.outcome)) {
    throw new Error(
      `outcome must be one of: success, partial, failure, timeout, escalated (got: ${input.outcome})`
    );
  }
  if (!input.emitted_by?.trim()) {
    throw new Error("emitted_by (agent identity) is required");
  }

  const payload: SpawnSummaryPayload = {
    briefing_id: input.briefing_id,
    outcome: input.outcome,
    summary: input.summary,
    new_findings: (input.new_findings || []).map((f) => ({
      date: f.date || new Date().toISOString(),
      summary: f.summary,
      proposal: f.proposal,
    })),
    updated_quirks: (input.updated_quirks || []).map((q) => ({
      tool: q.tool,
      canonical_args: q.canonical_args ?? {},
      gotchas: q.gotchas ?? [],
    })),
    tool_calls_made: input.tool_calls_made,
    tokens_used: input.tokens_used,
    duration_seconds: input.duration_seconds,
    error_log: input.error_log,
    state_snapshot: input.state_snapshot,
    emitted_by: input.emitted_by,
  };

  await emitSpawnSummary(payload);

  // Fetch the ID of the inserted summary
  const result = await query(
    `SELECT id FROM roadmap.spawn_summary WHERE briefing_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [input.briefing_id]
  );

  const summary_id = result.rows[0]?.id || 0;

  return {
    id: summary_id,
    briefing_id: input.briefing_id,
    outcome: input.outcome,
  };
}

/**
 * briefing_list: List recent briefings for debugging/audit
 */
export async function handleBriefingList(
  input: BriefingListInput
): Promise<
  Array<{
    briefing_id: string;
    task_id: string;
    mission: string;
    briefed_by: string;
    briefed_at: string;
  }>
> {
  const limit = Math.min(input.limit || 20, 100);
  const offset = input.offset || 0;

  const result = await query(
    `
    SELECT
      briefing_id,
      task_id,
      mission,
      briefed_by,
      briefed_at
    FROM roadmap.spawn_briefing
    ORDER BY briefed_at DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );

  return result.rows || [];
}

/**
 * fallback_playbook_add: Curator adds error recovery patterns
 *
 * Can be called manually or by harvester on completion.
 */
export async function handleFallbackPlaybookAdd(input: FallbackPlaybookAddInput): Promise<{ id: number; error_signature: string }> {
  if (!input.error_signature?.trim()) {
    throw new Error("error_signature is required");
  }
  if (!input.try_action?.trim()) {
    throw new Error("try_action is required");
  }

  const result = await query(
    `
    INSERT INTO roadmap.fallback_playbook (
      error_signature,
      tool_name,
      error_class,
      try_action,
      rationale,
      source_proposal,
      confidence
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, error_signature
    `,
    [
      input.error_signature,
      input.tool_name || null,
      input.error_class || null,
      input.try_action,
      input.rationale || null,
      input.source_proposal || null,
      input.confidence ?? 0.75,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error("Failed to add fallback playbook entry");
  }

  const row = result.rows[0];
  return {
    id: row.id,
    error_signature: row.error_signature,
  };
}

/**
 * mcp_quirks_register: Register known MCP parameter quirks
 *
 * Updates or inserts MCP tool schema with canonical params and gotchas.
 */
export async function handleMcpQuirksRegister(input: McpQuirksRegisterInput): Promise<{ tool_name: string; registered_at: string }> {
  if (!input.tool_name?.trim()) {
    throw new Error("tool_name is required");
  }
  if (!input.canonical_args || Object.keys(input.canonical_args).length === 0) {
    throw new Error("canonical_args (map of param names to types) is required");
  }

  // Upsert: update if exists, insert if not
  const result = await query(
    `
    INSERT INTO roadmap.mcp_tool_schema (
      tool_name,
      mcp_server,
      canonical_args,
      description,
      known_gotchas,
      param_aliases,
      verified_at,
      verified_commit
    ) VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
    ON CONFLICT (tool_name) DO UPDATE SET
      mcp_server = COALESCE(EXCLUDED.mcp_server, roadmap.mcp_tool_schema.mcp_server),
      canonical_args = EXCLUDED.canonical_args,
      description = COALESCE(EXCLUDED.description, roadmap.mcp_tool_schema.description),
      known_gotchas = EXCLUDED.known_gotchas,
      param_aliases = EXCLUDED.param_aliases,
      verified_at = now(),
      last_discovered_at = now()
    RETURNING tool_name, verified_at
    `,
    [
      input.tool_name,
      input.mcp_server || null,
      JSON.stringify(input.canonical_args),
      input.description || null,
      JSON.stringify(input.known_gotchas || []),
      JSON.stringify(input.param_aliases || {}),
      null, // TODO: pass git commit hash if available
    ]
  );

  if (result.rows.length === 0) {
    throw new Error(`Failed to register MCP quirks for ${input.tool_name}`);
  }

  const row = result.rows[0];
  return {
    tool_name: row.tool_name,
    registered_at: row.verified_at,
  };
}
