-- P466: Spawn briefing protocol — warm-boot payload assembly and inheritance
-- Adds infrastructure for spawn briefing assembly, memory inheritance, MCP quirks,
-- fallback playbooks, and memory write-back contracts.

-- Main spawn_briefing table: stores assembled briefing payload before spawn
CREATE TABLE IF NOT EXISTS roadmap.spawn_briefing (
  briefing_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Mission
  task_id text NOT NULL,                    -- proposal_id, dispatch_id, or ad-hoc identifier
  mission text NOT NULL,                    -- one-paragraph what + why
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of binary-checkable criteria strings
  done_signal text NOT NULL DEFAULT 'ac-pass',  -- ac-pass | verdict | pr-merged | custom

  -- Constraints
  allowed_tools jsonb NOT NULL DEFAULT '[]'::jsonb,  -- explicit allow-list
  forbidden_tools jsonb NOT NULL DEFAULT '[]'::jsonb,  -- explicit deny-list
  budget jsonb NOT NULL DEFAULT '{"max_tokens": null, "max_minutes": null, "max_tool_calls": null}'::jsonb,
  stop_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,  -- e.g. 'tests fail twice', '3 strikes same error'

  -- Context payload
  inherited_memory jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of {key, body} memory entries
  mcp_quirks jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of {tool, canonical_args, gotchas[]}
  fallback_playbook jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of {error_signature, try, rationale}
  recent_findings jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of {date, summary, proposal}

  -- Escalation
  parent_agent text,                        -- who to contact if stuck
  liaison_agent text,                       -- who supervises the agency
  rescue_team_channel text,                 -- chan_list channel for cross-agency help
  request_assistance_threshold integer DEFAULT 3,  -- strikes before mandatory escalation

  -- Provenance
  briefed_by text NOT NULL,                 -- agent/role that assembled this briefing
  briefed_at timestamptz NOT NULL DEFAULT now(),

  -- Metadata
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT spawn_briefing_task_id_not_empty CHECK (task_id != ''),
  CONSTRAINT spawn_briefing_mission_not_empty CHECK (mission != ''),
  CONSTRAINT spawn_briefing_done_signal_valid CHECK (
    done_signal IN ('ac-pass', 'verdict', 'pr-merged', 'custom')
  )
);

CREATE INDEX IF NOT EXISTS spawn_briefing_task_id_idx ON roadmap.spawn_briefing (task_id);
CREATE INDEX IF NOT EXISTS spawn_briefing_created_at_idx ON roadmap.spawn_briefing (created_at DESC);
CREATE INDEX IF NOT EXISTS spawn_briefing_briefed_by_idx ON roadmap.spawn_briefing (briefed_by);

COMMENT ON TABLE roadmap.spawn_briefing IS
'Warm-boot payload for spawn: mission, constraints, context (memory/quirks/playbook), escalation, provenance.
Child boot requires briefing_id from spawn args; refuses to start without it (fail-closed).';

-- Fallback playbook: error signatures mapped to recovery strategies
-- Harvested from child spawn_summary submissions and human-curated entries
CREATE TABLE IF NOT EXISTS roadmap.fallback_playbook (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  error_signature text NOT NULL,            -- e.g. "mcp_add_discussion_missing_proposal_id"
  tool_name text,                           -- e.g. "add_discussion", optional for cross-tool errors
  error_class text,                         -- e.g. "ValidationError", "ArgumentError"
  normalized_error_pattern text,            -- regex or text pattern to match

  try_action text NOT NULL,                 -- what to do instead (step-by-step)
  rationale text,                           -- why this works (teach the principle)

  source_proposal text,                     -- proposal where this was learned (e.g. "P450")
  harvested_from_spawn_id uuid,             -- if from harvester: the briefing_id that discovered it
  confidence numeric NOT NULL DEFAULT 0.75,  -- 0.0-1.0 confidence that this fix works

  verified_against_commit text,             -- git commit hash last verified against (staleness check)
  verified_at timestamptz,

  is_obsolete boolean DEFAULT false,        -- mark as stale if code changed
  curation_note text,                       -- curator comment or context

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fallback_playbook_signature_not_empty CHECK (error_signature != ''),
  CONSTRAINT fallback_playbook_action_not_empty CHECK (try_action != ''),
  CONSTRAINT fallback_playbook_confidence_valid CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

CREATE INDEX IF NOT EXISTS fallback_playbook_signature_idx ON roadmap.fallback_playbook (error_signature);
CREATE INDEX IF NOT EXISTS fallback_playbook_tool_idx ON roadmap.fallback_playbook (tool_name);
CREATE INDEX IF NOT EXISTS fallback_playbook_obsolete_idx ON roadmap.fallback_playbook (is_obsolete);
CREATE INDEX IF NOT EXISTS fallback_playbook_confidence_idx ON roadmap.fallback_playbook (confidence DESC);

COMMENT ON TABLE roadmap.fallback_playbook IS
'Error → recovery mapping: learned patterns from failed spawns, harvested or human-curated.
Child spawn_summary submission populates this; queries fetch top-N entries by confidence.
verified_commit prevents stale entries (harvester validates before merging).';

-- MCP tool schema: extends P456 discovery; canonical param names and known gotchas
CREATE TABLE IF NOT EXISTS roadmap.mcp_tool_schema (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  tool_name text NOT NULL UNIQUE,
  mcp_server text,                          -- which MCP serves this (e.g. "agenthive", "roadmap")

  canonical_args jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {param_name: type_hint}
  description text,

  known_gotchas jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of {issue: string, workaround: string}

  param_aliases jsonb DEFAULT '{}'::jsonb,  -- {wrong_name: correct_name} for common mistakes

  last_discovered_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_commit text,

  metadata jsonb,

  CONSTRAINT mcp_tool_schema_tool_name_not_empty CHECK (tool_name != '')
);

CREATE INDEX IF NOT EXISTS mcp_tool_schema_tool_idx ON roadmap.mcp_tool_schema (tool_name);
CREATE INDEX IF NOT EXISTS mcp_tool_schema_server_idx ON roadmap.mcp_tool_schema (mcp_server);

COMMENT ON TABLE roadmap.mcp_tool_schema IS
'MCP tool canonical schemas: param names, descriptions, known gotchas, aliases.
Extends P456 schema discovery with quirks and workarounds learned from agent attempts.
Briefing assembly fetches from here for mcp_quirks payload.';

-- Spawn summary: child emits on completion (success or failure)
-- Parent/harvester merges new_findings into memory and fallback_playbook
CREATE TABLE IF NOT EXISTS roadmap.spawn_summary (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

  briefing_id uuid NOT NULL REFERENCES roadmap.spawn_briefing (briefing_id) ON DELETE CASCADE,

  outcome text NOT NULL,                    -- success | partial | failure | timeout | escalated
  summary text,

  new_findings jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of {date, summary, proposal}
  updated_quirks jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of {tool, canonical_args, gotchas[]}

  tool_calls_made integer,
  tokens_used integer,
  duration_seconds numeric,

  error_log jsonb,                          -- if failure, error details for harvest
  state_snapshot jsonb,                     -- final checkpoint state

  emitted_by text,                          -- agent identity that emitted this
  emitted_at timestamptz NOT NULL DEFAULT now(),

  harvested_into_memory boolean DEFAULT false,
  harvested_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT spawn_summary_outcome_valid CHECK (
    outcome IN ('success', 'partial', 'failure', 'timeout', 'escalated')
  ),
  CONSTRAINT spawn_summary_briefing_id_not_empty CHECK (briefing_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS spawn_summary_briefing_idx ON roadmap.spawn_summary (briefing_id);
CREATE INDEX IF NOT EXISTS spawn_summary_outcome_idx ON roadmap.spawn_summary (outcome);
CREATE INDEX IF NOT EXISTS spawn_summary_harvested_idx ON roadmap.spawn_summary (harvested_into_memory)
  WHERE harvested_into_memory = false;

COMMENT ON TABLE roadmap.spawn_summary IS
'Completion record from child spawn: outcome, new findings, quirks, tool usage, error details.
Parent/harvester processes this to update memory and fallback_playbook (close memory write-back loop).';
