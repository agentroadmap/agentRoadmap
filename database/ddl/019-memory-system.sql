-- P194: Project Memory and Agent Memory System
-- Creates the project_memory table for shared, cacheable platform context.
-- Note: agent_memory already exists in roadmap_efficiency (see baseline schema).
-- This migration adds project-level memory and extends spawn_briefing for cache hints.

-- ── Project Memory ─────────────────────────────────────────────────────────────
-- Shared context table for stable, cacheable platform knowledge.
-- Seeded with architecture, workflow, conventions, glossary, and schema summaries.
-- Used by the dispatch pipeline to inject a stable system-prompt prefix that
-- benefits from LLM prompt caching (reduces redundant token spend across fleet).

CREATE TABLE IF NOT EXISTS roadmap.project_memory (
  id          serial      PRIMARY KEY,
  key         text        UNIQUE NOT NULL,
  category    text        NOT NULL,
  content     jsonb       NOT NULL,
  version     int         NOT NULL DEFAULT 1,
  is_cached   bool        NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,

  CONSTRAINT project_memory_category_check
    CHECK (category IN ('architecture', 'workflow', 'conventions', 'glossary', 'schema'))
);

CREATE INDEX IF NOT EXISTS idx_project_memory_key      ON roadmap.project_memory (key);
CREATE INDEX IF NOT EXISTS idx_project_memory_category ON roadmap.project_memory (category);

COMMENT ON TABLE roadmap.project_memory IS
'Shared platform context loaded into agent system-prompt prefix before dispatch.
Stable entries are cached by the LLM provider, cutting token spend across the fleet.';

-- ── Seed Data ──────────────────────────────────────────────────────────────────

INSERT INTO roadmap.project_memory (key, category, content) VALUES

  ('architecture', 'architecture', '{
    "pillars": ["proposal_lifecycle", "workforce_mgmt", "efficiency", "utility"],
    "data_layer": "postgres + filesystem",
    "messaging": "pg_notify + MCP",
    "worktrees": true,
    "key_services": ["gate_pipeline", "orchestrator", "gateway"],
    "schema": "roadmap"
  }'::jsonb),

  ('workflow_states', 'workflow', '{
    "rfc": ["DRAFT", "REVIEW", "DEVELOP", "MERGE", "COMPLETE"],
    "quick_fix": ["TRIAGE", "FIX", "DEPLOYED"],
    "gating": {
      "D1": "coherence_check",
      "D2": "ac_verification",
      "D3": "integration_test",
      "D4": "stability_check"
    }
  }'::jsonb),

  ('conventions', 'conventions', '{
    "commits": "feat(P###): description",
    "proposals": "RFC-5 standard",
    "tests": "structural_mirroring",
    "reviews": "skeptic_required",
    "priority_levels": {"feature": 1.0, "directive": 1.5, "critical": 2.0}
  }'::jsonb),

  ('glossary', 'glossary', '{
    "cubic": "Isolated execution environment with dedicated agent slots and Git worktree",
    "maturity": "Lifecycle within state: new → active → mature → obsolete",
    "AC": "Acceptance Criteria — testable conditions for proposal advancement",
    "skeptic": "AI reviewer that validates coherence, feasibility, and quality"
  }'::jsonb),

  ('schema_summary', 'schema', '{
    "proposals": "id, type, status, maturity, title, summary, design, motivation",
    "proposal_maturity": "new, active, mature, obsolete",
    "proposal_state": "DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE",
    "reference_domains": 12,
    "cubic_metadata": "id, agent_identity, phase, task, lock_acquired_at"
  }'::jsonb)

ON CONFLICT (key) DO UPDATE SET
  content    = EXCLUDED.content,
  version    = roadmap.project_memory.version + 1,
  updated_at = now(),
  updated_by = 'migration:019-memory-system';

-- ── Add UNIQUE constraint to agent_memory ─────────────────────────────────────
-- The baseline agent_memory table in roadmap_efficiency lacks (agent_identity, key, layer)
-- uniqueness. P194 adds this so setAgentMemory() can do true upserts.
-- Deduplicate first (keep highest id per group) before adding constraint.

DELETE FROM roadmap_efficiency.agent_memory a
USING roadmap_efficiency.agent_memory b
WHERE a.agent_identity = b.agent_identity
  AND a.key            = b.key
  AND a.layer          = b.layer
  AND a.id             < b.id;

ALTER TABLE roadmap_efficiency.agent_memory
  DROP CONSTRAINT IF EXISTS agent_memory_identity_key_layer_uq;

ALTER TABLE roadmap_efficiency.agent_memory
  ADD CONSTRAINT agent_memory_identity_key_layer_uq
    UNIQUE (agent_identity, key, layer);

-- ── Extend spawn_briefing for project context cache hints ──────────────────────
-- Adds a project_context JSONB column to carry loaded project_memory entries
-- and a cache_control JSONB column to signal caching intent to the dispatcher.

ALTER TABLE roadmap.spawn_briefing
  ADD COLUMN IF NOT EXISTS project_context jsonb,
  ADD COLUMN IF NOT EXISTS cache_control   jsonb;

COMMENT ON COLUMN roadmap.spawn_briefing.project_context IS
'Snapshot of project_memory entries loaded at briefing-assembly time.
Injected into the agent system-prompt prefix for prompt-cache hits.';

COMMENT ON COLUMN roadmap.spawn_briefing.cache_control IS
'LLM cache-control hint assembled by the dispatcher, e.g. {"type": "ephemeral"}.
Signals to the caller that the project_context prefix should be marked cacheable.';
