-- P483 Phase 1: Project Lifecycle — Repair Queue Table
-- AC #100: Worktree orphan detection via repair_queue.
-- AC #103: On failed worktree stat during project_create transaction, queue for deferred repair.
--
-- This table tracks projects whose worktree directories failed to stat at commit time,
-- allowing operators to investigate and recover without losing the registry entry.

CREATE TABLE IF NOT EXISTS roadmap.project_repair_queue (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES roadmap.project(project_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_project_repair_queue_project_id ON roadmap.project_repair_queue(project_id);
CREATE INDEX idx_project_repair_queue_resolved ON roadmap.project_repair_queue(resolved_at) WHERE resolved_at IS NULL;
