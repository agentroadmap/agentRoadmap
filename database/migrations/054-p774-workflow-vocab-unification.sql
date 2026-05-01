-- P774: Workflow vocabulary unification (C1)
-- - Add proposal.obsoleted_reason column
-- - Create roadmap.workflow_stage_definition table with canonical stage vocabulary
-- - Seed active stages: DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE, CANCELLED
-- Ref: P706, P774

BEGIN;

-- 1. Add obsoleted_reason to proposals
ALTER TABLE roadmap_proposal.proposal
  ADD COLUMN IF NOT EXISTS obsoleted_reason TEXT;

-- 2. Backfill obsoleted_reason for proposals already marked obsolete
UPDATE roadmap_proposal.proposal
SET obsoleted_reason = 'Marked obsolete during roadmap hygiene pass'
WHERE maturity = 'obsolete' AND obsoleted_reason IS NULL;

-- 3. Create workflow_stage_definition table
CREATE TABLE IF NOT EXISTS roadmap.workflow_stage_definition (
  id              BIGSERIAL PRIMARY KEY,
  stage_name      TEXT NOT NULL UNIQUE,
  display_label   TEXT NOT NULL,
  display_order   INTEGER NOT NULL,
  hex_color       TEXT,
  allowed_next    TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  gate_id         TEXT,
  is_terminal     BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON roadmap.workflow_stage_definition TO roadmap_agent;
GRANT SELECT ON roadmap.workflow_stage_definition TO PUBLIC;

-- 4. Seed canonical stages
INSERT INTO roadmap.workflow_stage_definition
  (stage_name, display_label, display_order, hex_color, allowed_next, gate_id, is_terminal)
VALUES
  ('DRAFT',     'Draft',          1, '#6B7280', '{REVIEW}'::TEXT[],    'D1', false),
  ('REVIEW',    'In Review',      2, '#3B82F6', '{DEVELOP}'::TEXT[],   'D2', false),
  ('DEVELOP',   'In Progress',    3, '#F59E0B', '{MERGE}'::TEXT[],     'D3', false),
  ('MERGE',     'Ready to Merge', 4, '#8B5CF6', '{COMPLETE}'::TEXT[],  'D4', false),
  ('COMPLETE',  'Complete',       5, '#10B981', '{}'::TEXT[],          NULL,  true),
  ('CANCELLED', 'Cancelled',      6, '#EF4444', '{}'::TEXT[],          NULL,  true)
ON CONFLICT (stage_name) DO UPDATE SET
  display_label = EXCLUDED.display_label,
  display_order = EXCLUDED.display_order,
  hex_color     = EXCLUDED.hex_color,
  allowed_next  = EXCLUDED.allowed_next,
  gate_id       = EXCLUDED.gate_id,
  is_terminal   = EXCLUDED.is_terminal,
  is_active     = EXCLUDED.is_active;

COMMIT;
