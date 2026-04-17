-- P240: implicit maturity gating.
--
-- Mature proposals are the gate-ready set. transition_queue is no longer the
-- lifecycle source of truth and must not be populated by maturity triggers.

BEGIN;

CREATE OR REPLACE VIEW roadmap_proposal.v_implicit_gate_ready AS
SELECT p.id,
       p.display_id,
       p.type,
       p.status,
       p.maturity,
       p.title,
       p.summary,
       CASE LOWER(p.status)
         WHEN 'draft'   THEN 'D1'
         WHEN 'review'  THEN 'D2'
         WHEN 'develop' THEN 'D3'
         WHEN 'merge'   THEN 'D4'
       END AS gate,
       CASE LOWER(p.status)
         WHEN 'draft'   THEN 'Review'
         WHEN 'review'  THEN 'Develop'
         WHEN 'develop' THEN 'Merge'
         WHEN 'merge'   THEN 'Complete'
       END AS to_stage,
       lease.agent_identity AS active_lease_agent,
       dispatch.id AS active_gate_dispatch_id,
       p.modified_at
FROM roadmap_proposal.proposal p
LEFT JOIN LATERAL (
  SELECT pl.agent_identity
  FROM roadmap_proposal.proposal_lease pl
  WHERE pl.proposal_id = p.id
    AND pl.released_at IS NULL
  ORDER BY pl.claimed_at DESC
  LIMIT 1
) lease ON true
LEFT JOIN LATERAL (
  SELECT sd.id
  FROM roadmap_workforce.squad_dispatch sd
  WHERE sd.proposal_id = p.id
    AND sd.dispatch_role = 'gate-reviewer'
    AND sd.dispatch_status = 'active'
  ORDER BY sd.assigned_at DESC
  LIMIT 1
) dispatch ON true
WHERE p.maturity = 'mature'
  AND LOWER(p.status) IN ('draft', 'review', 'develop', 'merge');

COMMENT ON VIEW roadmap_proposal.v_implicit_gate_ready IS
  'P240 derived gate-ready projection. proposal.status + proposal.maturity are lifecycle truth; transition_queue is not required.';

CREATE OR REPLACE FUNCTION roadmap.fn_notify_gate_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_gate     text;
    v_to_state text;
BEGIN
    IF NEW.maturity = 'mature'
       AND OLD.maturity IS DISTINCT FROM 'mature' THEN
        CASE LOWER(NEW.status)
            WHEN 'draft'   THEN v_gate := 'D1'; v_to_state := 'Review';
            WHEN 'review'  THEN v_gate := 'D2'; v_to_state := 'Develop';
            WHEN 'develop' THEN v_gate := 'D3'; v_to_state := 'Merge';
            WHEN 'merge'   THEN v_gate := 'D4'; v_to_state := 'Complete';
            ELSE
                PERFORM pg_notify('proposal_gate_ready', jsonb_build_object(
                    'proposal_id', NEW.id,
                    'display_id',  NEW.display_id,
                    'stage',       NEW.status,
                    'reason',      'no_gate_defined_for_state',
                    'source',      'implicit_maturity_gating',
                    'ts',          to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                )::text);
                RETURN NEW;
        END CASE;

        PERFORM pg_notify('proposal_gate_ready', jsonb_build_object(
            'proposal_id', NEW.id,
            'display_id',  NEW.display_id,
            'gate',        v_gate,
            'from_stage',  NEW.status,
            'to_stage',    v_to_state,
            'source',      'implicit_maturity_gating',
            'ts',          to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )::text);
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION roadmap.fn_enqueue_mature_proposals()
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
    -- Compatibility no-op. The orchestrator scans
    -- roadmap_proposal.v_implicit_gate_ready and listens on proposal_gate_ready.
    RETURN 0;
END;
$$;

COMMIT;

