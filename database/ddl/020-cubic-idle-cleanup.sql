-- P196: Cubic Lifecycle Management — idle detection, automatic cleanup, and resource reclamation
-- Extends roadmap.cubics with lifecycle tracking via cubic_state table.

-- Cubic lifecycle metadata (extends existing roadmap.cubics table)
CREATE TABLE IF NOT EXISTS roadmap.cubic_state (
  cubic_id text PRIMARY KEY REFERENCES roadmap.cubics(cubic_id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'ACTIVE',
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  idle_since timestamptz,
  lifecycle_status text NOT NULL DEFAULT 'ACTIVE',

  CONSTRAINT cubic_state_phase_check
    CHECK (phase IN ('RUNNING', 'IDLE', 'COMPLETED', 'FAILED')),
  CONSTRAINT cubic_state_lifecycle_check
    CHECK (lifecycle_status IN ('ACTIVE', 'IDLE', 'COMPLETED', 'STALE', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS idx_cubic_state_status
  ON roadmap.cubic_state(lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_cubic_state_activity
  ON roadmap.cubic_state(last_activity_at);

-- Function to initialize cubic_state row when a cubic is created
CREATE OR REPLACE FUNCTION roadmap.fn_init_cubic_state()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO roadmap.cubic_state (cubic_id, phase, last_activity_at, lifecycle_status)
  VALUES (NEW.cubic_id, 'RUNNING', NOW(), 'ACTIVE')
  ON CONFLICT (cubic_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create cubic_state on cubic insert
DROP TRIGGER IF EXISTS trg_cubic_state_init ON roadmap.cubics;
CREATE TRIGGER trg_cubic_state_init
  AFTER INSERT ON roadmap.cubics
  FOR EACH ROW
  EXECUTE FUNCTION roadmap.fn_init_cubic_state();

-- Backfill: create cubic_state rows for existing cubics that don't have one
INSERT INTO roadmap.cubic_state (cubic_id, phase, last_activity_at, lifecycle_status)
SELECT
  c.cubic_id,
  CASE
    WHEN c.status = 'active' THEN 'RUNNING'
    WHEN c.status = 'idle' THEN 'IDLE'
    WHEN c.status = 'complete' THEN 'COMPLETED'
    WHEN c.status = 'expired' THEN 'COMPLETED'
    ELSE 'IDLE'
  END,
  COALESCE(c.activated_at, c.created_at),
  CASE
    WHEN c.status = 'active' THEN 'ACTIVE'
    WHEN c.status = 'idle' THEN 'IDLE'
    WHEN c.status = 'complete' THEN 'COMPLETED'
    WHEN c.status = 'expired' THEN 'ARCHIVED'
    ELSE 'IDLE'
  END
FROM roadmap.cubics c
LEFT JOIN roadmap.cubic_state cs ON cs.cubic_id = c.cubic_id
WHERE cs.cubic_id IS NULL;
