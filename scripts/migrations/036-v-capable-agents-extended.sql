-- P271: extend v_capable_agents with live agent_health columns
--
-- Original view exposes agent registry + capabilities + workload but drops
-- the live fields (current_proposal, current_cubic, active_model,
-- last_heartbeat_at) that agent_health carries. The board and squad
-- planner both want to answer "which capable agent is currently on what"
-- without re-joining agent_health in every caller.
--
-- Consumer audit (2026-04-18): only src/core/pipeline/pipeline-cron.ts
-- references this view and it selects columns by name (SELECT v.capability,
-- v.agent_identity, v.id), not by ordinal — safe to add columns.

BEGIN;

CREATE OR REPLACE VIEW roadmap.v_capable_agents AS
SELECT
    ar.id,
    ar.agent_identity,
    ar.agent_type,
    ar.status,
    ac.capability,
    ac.proficiency,
    COALESCE(aw.active_lease_count, 0)                           AS active_leases,
    COALESCE(aw.context_load_score, 0)                           AS context_load,
    ah.current_proposal,
    ah.current_cubic,
    ah.active_model,
    ah.last_heartbeat_at,
    EXTRACT(EPOCH FROM (now() - ah.last_heartbeat_at))::int      AS heartbeat_age_seconds
FROM roadmap_workforce.agent_registry ar
JOIN roadmap_workforce.agent_capability ac
  ON ac.agent_id = ar.id
LEFT JOIN roadmap_workforce.agent_workload aw
  ON aw.agent_id = ar.id
LEFT JOIN roadmap_workforce.agent_health ah
  ON ah.agent_identity = ar.agent_identity
WHERE ar.status = 'active';

COMMENT ON VIEW roadmap.v_capable_agents IS
    'P271: capable active agents with live agent_health columns (current_proposal, current_cubic, active_model, heartbeat age). Extends the original capability/workload projection so board and squad planner can answer "which agent is currently on what" without extra joins.';

COMMIT;
