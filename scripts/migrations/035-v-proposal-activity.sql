-- P272: v_proposal_activity unified projection for board feed
--
-- Joins proposal × active_lease × active_or_assigned squad_dispatch ×
-- agent_health × LATERAL latest proposal_event, so the board can render
-- "who's working on this right now, in which cubic, on which model,
-- last heartbeat age" in a single query instead of N-per-render.
--
-- Schema notes (verified live 2026-04-18):
--   roadmap_proposal.proposal              — column is `type` (not proposal_type)
--   roadmap_proposal.proposal_event        — column is `event_type` (not event_kind)
--   roadmap_workforce.squad_dispatch       — has no cubic_id column
--   roadmap_workforce.agent_health         — provides current_cubic + active_model

BEGIN;

DROP VIEW IF EXISTS roadmap.v_proposal_activity;

CREATE VIEW roadmap.v_proposal_activity AS
SELECT
    p.id                                                         AS proposal_id,
    p.display_id,
    p.type                                                       AS proposal_type,
    p.status,
    p.maturity,
    lease.agent_identity                                         AS lease_holder,
    lease.claimed_at                                             AS lease_claimed_at,
    lease.expires_at                                             AS lease_expires_at,
    sd.agent_identity                                            AS gate_dispatch_agent,
    sd.dispatch_role                                             AS gate_dispatch_role,
    sd.dispatch_status                                           AS gate_dispatch_status,
    ah.current_cubic                                             AS active_cubic,
    ah.active_model,
    ah.last_heartbeat_at,
    EXTRACT(EPOCH FROM (now() - ah.last_heartbeat_at))::int      AS heartbeat_age_seconds,
    latest.created_at                                            AS last_event_at,
    latest.event_type                                            AS last_event_type
FROM roadmap_proposal.proposal p
LEFT JOIN roadmap_proposal.proposal_lease lease
       ON lease.proposal_id = p.id
      AND lease.released_at IS NULL
LEFT JOIN roadmap_workforce.squad_dispatch sd
       ON sd.proposal_id = p.id
      AND sd.dispatch_status IN ('assigned', 'active')
      AND sd.completed_at IS NULL
LEFT JOIN roadmap_workforce.agent_health ah
       ON ah.agent_identity = COALESCE(lease.agent_identity, sd.agent_identity)
LEFT JOIN LATERAL (
    SELECT created_at, event_type
    FROM roadmap_proposal.proposal_event
    WHERE proposal_id = p.id
    ORDER BY created_at DESC
    LIMIT 1
) latest ON true;

COMMENT ON VIEW roadmap.v_proposal_activity IS
    'P272: unified live-activity projection joining proposal × active lease × assigned/active squad_dispatch × agent_health × latest proposal_event. Consumed by the board feed (P270) to render lease holder, gate dispatch fallback, active cubic, active model, and heartbeat age without N-per-render queries.';

COMMIT;
