-- ============================================================================
-- 081-p706c0-rollback.sql
--
-- Rollback for 081-p706c0-hotpath-functions.sql. Restores the prior CREATE
-- OR REPLACE definitions captured from migrations 011/046/066/069 + the P741
-- patch via pg_get_functiondef() at 2026-04-29 23:16 UTC.
--
-- Note: rolling back does NOT re-create the dropped duplicate
-- roadmap.fn_lease_clear_maturity_on_release because no trigger ever
-- referenced it; restoring it would be cosmetic. Add CREATE OR REPLACE if
-- you need the dead code back for some external tooling.
-- ============================================================================

BEGIN;

-- 1. fn_notify_gate_ready (pre-rewrite)
CREATE OR REPLACE FUNCTION roadmap.fn_notify_gate_ready()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_gate           text;
    v_to_state       text;
    v_type           text := COALESCE(LOWER(NEW.type), 'feature');
    v_recent_decision boolean;
BEGIN
    IF NEW.maturity = 'mature'
       AND OLD.maturity IS DISTINCT FROM 'mature' THEN

        SELECT EXISTS (
            SELECT 1
              FROM roadmap_proposal.gate_decision_log
             WHERE proposal_id = NEW.id
               AND from_state ILIKE NEW.status
               AND created_at > NOW() - INTERVAL '10 minutes'
        ) INTO v_recent_decision;

        IF v_recent_decision THEN
            RETURN NEW;
        END IF;

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
$function$;

-- 2. fn_sync_proposal_maturity (pre-rewrite)
CREATE OR REPLACE FUNCTION roadmap.fn_sync_proposal_maturity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('DEPLOYED','COMPLETE','CLOSED','MERGED','RECYCLED') THEN
    NEW.maturity := 'mature';
    RETURN NEW;
  END IF;

  IF NEW.status IN ('REJECTED','DISCARDED','ABANDONED') THEN
    NEW.maturity := 'obsolete';
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM roadmap_proposal.proposal_lease
     WHERE proposal_id = NEW.id
       AND released_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    NEW.maturity := 'active';
  ELSE
    NEW.maturity := 'new';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. fn_lease_clear_maturity_on_release (active version: roadmap_proposal)
CREATE OR REPLACE FUNCTION roadmap_proposal.fn_lease_clear_maturity_on_release()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  ELSIF NEW.release_reason = 'gate_transitioned' THEN
    v_new_maturity := 'new';
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
$function$;

-- 4. Restore the dropped duplicate roadmap.fn_lease_clear_maturity_on_release
--    (cosmetic; no trigger references it).
CREATE OR REPLACE FUNCTION roadmap.fn_lease_clear_maturity_on_release()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
  ELSIF NEW.release_reason = 'gate_transitioned' THEN
    v_new_maturity := 'new';
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
$function$;

-- 5. fn_guard_terminal_maturity (pre-rewrite)
CREATE OR REPLACE FUNCTION roadmap.fn_guard_terminal_maturity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status IN ('COMPLETE', 'REJECTED', 'ABANDONED', 'DEPLOYED', 'MERGED', 'CLOSED', 'WONT_FIX')
       AND NEW.maturity = 'mature' THEN
        NEW.maturity := 'new';
    END IF;
    RETURN NEW;
END;
$function$;

COMMIT;
