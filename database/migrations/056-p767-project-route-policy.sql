-- P767: project_route_policy schema + seed (Umbrella D, first deliverable)
-- Semantics: empty allowed_route_providers = allow any; non-empty = allowlist.
-- forbidden_route_providers always excludes those providers.
-- max_hourly_tokens_by_route: JSON map {"anthropic": 100000, "openai": 200000}

CREATE TABLE IF NOT EXISTS roadmap.project_route_policy (
  project_id                 BIGINT      PRIMARY KEY
                             REFERENCES roadmap.project(project_id) ON DELETE CASCADE,
  allowed_route_providers    TEXT[]      NOT NULL DEFAULT '{}',
  forbidden_route_providers  TEXT[]      NOT NULL DEFAULT '{}',
  max_hourly_tokens_by_route JSONB       NOT NULL DEFAULT '{}',
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roadmap.project_route_policy IS
  'Per-project route allowlist and hourly token-budget caps (Umbrella D, P767). '
  'Empty allowed_route_providers means any provider is permitted. '
  'forbidden_route_providers is always excluded regardless of allowed list.';

-- Seed: default open policy for project_id=1 (the main agenthive project)
INSERT INTO roadmap.project_route_policy (project_id)
SELECT project_id FROM roadmap.project WHERE project_id = 1
ON CONFLICT (project_id) DO NOTHING;
