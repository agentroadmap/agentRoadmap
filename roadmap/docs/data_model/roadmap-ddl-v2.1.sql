DROP TRIGGER IF EXISTS trg_sync_blocked_flag ON roadmap.proposal_dependencies;
DROP FUNCTION IF EXISTS roadmap.fn_sync_blocked_flag();

CREATE OR REPLACE VIEW roadmap.v_proposal_blocked_status AS
SELECT
    p.id,
    p.display_id,
    p.status,
    EXISTS (
        SELECT 1
        FROM   roadmap.proposal_dependencies d
        WHERE  d.from_proposal_id = p.id
          AND  d.dependency_type  = 'blocks'
          AND  d.resolved         = false
    ) AS is_blocked,
    (
        SELECT COUNT(*)
        FROM   roadmap.proposal_dependencies d
        WHERE  d.from_proposal_id = p.id
          AND  d.resolved         = false
    ) AS unresolved_dep_count
FROM roadmap.proposal p;

COMMENT ON VIEW roadmap.v_proposal_blocked_status IS
    'Dynamically computed block status per proposal; no stored flag — always current';
