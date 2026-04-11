-- 020-effective-blocking-view.sql
-- Addresses: mature/obsolete proposals shouldn't block downstream work.
-- Agents shouldn't burn tokens re-discovering this every turn.
--
-- Changes:
--   1. Add resolved_at column to proposal_dependencies (manual override)
--   2. Create v_effective_blocking view (state-aware blocking)
--   3. Create v_blocking_diagram materialized view (full DAG for agent consumption)
--   4. Replace broken v_blocked_proposals with correct version

BEGIN;

-- ─── 1. Add resolved_at for manual dependency resolution ──────────────────

ALTER TABLE proposal_dependencies
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE proposal_dependencies
  ADD COLUMN IF NOT EXISTS resolved_by TEXT DEFAULT NULL;

COMMENT ON COLUMN proposal_dependencies.resolved_at IS
  'Timestamp when this dependency was manually resolved. NULL = unresolved.';

COMMENT ON COLUMN proposal_dependencies.resolved_by IS
  'Agent or user identity that resolved this dependency.';

-- ─── 2. v_effective_blocking: Who is ACTUALLY blocked right now ───────────
-- A dependency is effectively blocking when:
--   - dependency_type = 'blocks'
--   - NOT manually resolved (resolved_at IS NULL)
--   - Upstream proposal maturity is NOT 'mature' or 'obsolete'

CREATE OR REPLACE VIEW roadmap.v_effective_blocking AS
SELECT
    d.id AS dep_id,
    blocked.display_id AS blocked_by,
    blocked.title AS blocked_by_title,
    blocker.display_id AS blocking,
    blocker.title AS blocking_title,
    blocker.maturity_state AS blocking_maturity,
    blocker.status AS blocking_status,
    d.dependency_type,
    d.resolved_at,
    CASE
        WHEN d.resolved_at IS NOT NULL THEN 'resolved'
        WHEN blocker.maturity_state IN ('mature', 'obsolete') THEN 'auto_resolved'
        WHEN d.dependency_type = 'blocks' THEN 'blocking'
        ELSE d.dependency_type
    END AS effective_status
FROM proposal_dependencies d
JOIN proposal blocked ON blocked.id = d.from_proposal_id
JOIN proposal blocker ON blocker.id = d.to_proposal_id
WHERE d.dependency_type = 'blocks';

COMMENT ON VIEW roadmap.v_effective_blocking IS
  'State-aware blocking: only shows blocks deps where upstream is not mature/obsolete and not manually resolved.';

-- ─── 3. v_blocking_diagram: Full pre-computed DAG for agent consumption ───
-- One query gives agents everything they need:
--   - What blocks me (and is it real or resolved?)
--   - What do I block (and are those proposals still active?)

CREATE OR REPLACE VIEW roadmap.v_blocking_diagram AS
SELECT
    'i_depend_on' AS direction,
    d.from_proposal_id AS proposal_id,
    dep.display_id AS proposal_display_id,
    d.to_proposal_id AS related_id,
    rel.display_id AS related_display_id,
    rel.title AS related_title,
    rel.status AS related_status,
    rel.maturity_state AS related_maturity,
    d.dependency_type,
    d.resolved_at,
    CASE
        WHEN d.resolved_at IS NOT NULL THEN false
        WHEN d.dependency_type = 'blocks' AND rel.maturity_state NOT IN ('mature', 'obsolete') THEN true
        ELSE false
    END AS is_effective_blocker
FROM proposal_dependencies d
JOIN proposal dep ON dep.id = d.from_proposal_id
JOIN proposal rel ON rel.id = d.to_proposal_id

UNION ALL

SELECT
    'depends_on_me' AS direction,
    d.to_proposal_id AS proposal_id,
    rel.display_id AS proposal_display_id,
    d.from_proposal_id AS related_id,
    dep.display_id AS related_display_id,
    dep.title AS related_title,
    dep.status AS related_status,
    dep.maturity_state AS related_maturity,
    d.dependency_type,
    d.resolved_at,
    CASE
        WHEN d.resolved_at IS NOT NULL THEN false
        WHEN d.dependency_type = 'blocks' AND rel.maturity_state NOT IN ('mature', 'obsolete') THEN true
        ELSE false
    END AS is_effective_blocker
FROM proposal_dependencies d
JOIN proposal dep ON dep.id = d.from_proposal_id
JOIN proposal rel ON rel.id = d.to_proposal_id;

COMMENT ON VIEW roadmap.v_blocking_diagram IS
  'Complete blocking DAG with effective status. Query by proposal_id to get all deps in one shot.';

-- ─── 4. Fix v_blocked_proposals ───────────────────────────────────────────

DROP VIEW IF EXISTS v_blocked_proposals CASCADE;
CREATE OR REPLACE VIEW v_blocked_proposals AS
SELECT DISTINCT
    blocked.id,
    blocked.display_id,
    blocked.title,
    blocked.status,
    blocked.maturity_state,
    string_agg(DISTINCT blocker.display_id, ', ') AS blocked_by_proposals
FROM proposal_dependencies d
JOIN proposal blocked ON blocked.id = d.from_proposal_id
JOIN proposal blocker ON blocker.id = d.to_proposal_id
WHERE d.dependency_type = 'blocks'
  AND d.resolved_at IS NULL
  AND blocker.maturity_state NOT IN ('mature', 'obsolete')
GROUP BY blocked.id, blocked.display_id, blocked.title, blocked.status, blocked.maturity_state;

COMMENT ON VIEW v_blocked_proposals IS
  'Proposals that are effectively blocked by unresolved, non-mature dependencies.';

COMMIT;
