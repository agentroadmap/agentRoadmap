-- P482 Phase 1: Multi-Project Bootstrap — Registry Table & Seeds
-- Creates the foundational project registry table with three seed projects.
-- No column propagation to other tables (Phase 2).
-- In-process session binding (Phase 3 defers to durable table).

CREATE TABLE IF NOT EXISTS roadmap.project (
  project_id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  worktree_root TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX idx_project_slug ON roadmap.project(slug);

-- Seed three projects: AgentHive (existing) + audiobook + ai-singer.
-- AgentHive's project_id=1 is preserved to keep existing proposal.project_id=1 references valid.
INSERT INTO roadmap.project (slug, name, worktree_root, status, created_at)
VALUES
  ('agenthive', 'AgentHive', '/data/code/worktree', 'active', NOW()),
  ('audiobook', 'Audiobook', '/data/code/audiobook/worktree', 'active', NOW()),
  ('ai-singer', 'AI Singer', '/data/code/ai-singer/worktree', 'active', NOW())
ON CONFLICT (slug) DO NOTHING;
