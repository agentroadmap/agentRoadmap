-- Rollback for migration 070 (P741 HF-J + HF-F)
--
-- Restores:
--   1. fn_lease_clear_maturity_on_release without the gate_transitioned branch
--   2. fn_notify_gate_ready without the recent-decision suppression
--   3. Drops trg_release_leases_on_transition + fn_release_leases_on_transition
--
-- Run only if HF-J/HF-F is causing operational issues; the source restored
-- here is the pre-070 baseline (post-069).

BEGIN;

DROP TRIGGER IF EXISTS trg_release_leases_on_transition
  ON roadmap_proposal.proposal;
DROP FUNCTION IF EXISTS roadmap.fn_release_leases_on_transition();

-- Revert roadmap_proposal.* (the trigger-bound version) to pre-070 baseline.
CREATE OR REPLACE FUNCTION roadmap_proposal.fn_lease_clear_maturity_on_release()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_other_alive_count int;
  v_status            text;
  v_new_maturity      text;
BEGIN
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_other_alive_count
    FROM roadmap_proposal.proposal_lease
   WHERE proposal_id = NEW.proposal_id
     AND id <> NEW.id
     AND released_at IS NULL
     AND (expires_at IS NULL OR expires_at > now());

  IF v_other_alive_count > 0 THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status
    FROM roadmap_proposal.proposal
   WHERE id = NEW.proposal_id;

  IF v_status IN ('DEPLOYED','COMPLETE','CLOSED','MERGED','RECYCLED') THEN
    v_new_maturity := 'mature';
  ELSIF v_status IN ('REJECTED','DISCARDED','ABANDONED') THEN
    v_new_maturity := 'obsolete';
  ELSIF NEW.release_reason IN ('work_delivered','gate_review_complete') THEN
    v_new_maturity := 'mature';
  ELSE
    v_new_maturity := 'new';
  END IF;

  UPDATE roadmap_proposal.proposal
     SET maturity = v_new_maturity
   WHERE id = NEW.proposal_id
     AND maturity <> 'obsolete';

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION roadmap.fn_lease_clear_maturity_on_release()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_other_alive_count int;
  v_status            text;
  v_new_maturity      text;
BEGIN
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_other_alive_count
    FROM roadmap_proposal.proposal_lease
   WHERE proposal_id = NEW.proposal_id
     AND id <> NEW.id
     AND released_at IS NULL
     AND (expires_at IS NULL OR expires_at > now());

  IF v_other_alive_count > 0 THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status
    FROM roadmap_proposal.proposal
   WHERE id = NEW.proposal_id;

  IF v_status IN ('DEPLOYED','COMPLETE','CLOSED','MERGED','RECYCLED') THEN
    v_new_maturity := 'mature';
  ELSIF v_status IN ('REJECTED','DISCARDED','ABANDONED') THEN
    v_new_maturity := 'obsolete';
  ELSIF NEW.release_reason IN ('work_delivered','gate_review_complete') THEN
    v_new_maturity := 'mature';
  ELSE
    v_new_maturity := 'new';
  END IF;

  UPDATE roadmap_proposal.proposal
     SET maturity = v_new_maturity
   WHERE id = NEW.proposal_id
     AND maturity <> 'obsolete';

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION roadmap.fn_notify_gate_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_gate     text;
    v_to_state text;
    v_type     text := COALESCE(LOWER(NEW.type), 'feature');
BEGIN
    IF NEW.maturity = 'mature'
       AND OLD.maturity IS DISTINCT FROM 'mature' THEN

        IF v_type = 'hotfix' THEN
            CASE UPPER(NEW.status)
                WHEN 'TRIAGE' THEN v_gate := 'D1'; v_to_state := 'FIX';
                WHEN 'FIX'    THEN v_gate := 'D3'; v_to_state := 'DEPLOYED';
                ELSE
                    RETURN NEW;
            END CASE;
        ELSE
            CASE LOWER(NEW.status)
                WHEN 'draft'   THEN v_gate := 'D1'; v_to_state := 'Review';
                WHEN 'review'  THEN v_gate := 'D2'; v_to_state := 'Develop';
                WHEN 'develop' THEN v_gate := 'D3'; v_to_state := 'Merge';
                WHEN 'merge'   THEN v_gate := 'D4'; v_to_state := 'Complete';
                ELSE
                    RETURN NEW;
            END CASE;
        END IF;

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

COMMIT;
