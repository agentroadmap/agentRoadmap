-- Migration 070 — P741: HF-J + HF-F
--
-- HF-J: Auto-release active leases when proposal.status transitions, with
--       reason='gate_transitioned'. Update fn_lease_clear_maturity_on_release
--       so that reason maps to maturity='new' (NOT 'mature') — the proposal
--       has already moved past this gate.
--
-- HF-F: fn_notify_gate_ready must suppress NOTIFY when a recent gate_decision_log
--       entry already exists for the same (proposal_id, from_state) within the
--       last 10 minutes. Stops the redundant re-fire we observed on P436 (after
--       it advanced to MERGE) and the loop pattern on P435/P687/P676.
--
-- Pairs with P738 (HF-B, worker prompt), P739 (HF-A, dispatcher role), and
-- P740 (HF-C, gate-evaluator persistence verification). This migration is the
-- DB-side backstop in case any TS-side path bypasses the safeguards.

BEGIN;

-- ─── HF-J part 1: trigger function to release leases on status transition ───

CREATE OR REPLACE FUNCTION roadmap.fn_release_leases_on_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE roadmap_proposal.proposal_lease
       SET released_at    = NOW(),
           release_reason = 'gate_transitioned'
     WHERE proposal_id = NEW.id
       AND released_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_leases_on_transition
  ON roadmap_proposal.proposal;
CREATE TRIGGER trg_release_leases_on_transition
AFTER UPDATE OF status ON roadmap_proposal.proposal
FOR EACH ROW
EXECUTE FUNCTION roadmap.fn_release_leases_on_transition();

-- ─── HF-J part 2: extend fn_lease_clear_maturity_on_release to handle the new reason ──
-- The production trigger trg_lease_clear_maturity_on_release is bound to
-- roadmap_proposal.fn_lease_clear_maturity_on_release (not the roadmap.* one).
-- We patch BOTH schemas to keep them in sync; the roadmap.* version is the
-- canonical source and the roadmap_proposal.* version is what the trigger
-- actually invokes.

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
  -- Only fire on the released_at NULL→NOT NULL transition.
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
    -- Another agent still holds the proposal — leave maturity='active'.
    RETURN NEW;
  END IF;

  SELECT status INTO v_status
    FROM roadmap_proposal.proposal
   WHERE id = NEW.proposal_id;

  IF v_status IN ('DEPLOYED','COMPLETE','CLOSED','MERGED','RECYCLED') THEN
    v_new_maturity := 'mature';
  ELSIF v_status IN ('REJECTED','DISCARDED','ABANDONED') THEN
    v_new_maturity := 'obsolete';
  -- P741 (HF-J): gate_transitioned means the proposal already moved past
  -- this gate via the trg_release_leases_on_transition trigger. Do NOT
  -- bump maturity to 'mature' — that would re-fire fn_notify_gate_ready
  -- for the OLD stage that we just left.
  ELSIF NEW.release_reason = 'gate_transitioned' THEN
    v_new_maturity := 'new';
  ELSIF NEW.release_reason IN ('work_delivered','gate_review_complete') THEN
    -- Agent finished work or a gate signed off — call for next gate.
    v_new_maturity := 'mature';
  ELSE
    -- gate_hold, gate_reject, lease_expired, manual_release, etc. — back to queue.
    v_new_maturity := 'new';
  END IF;

  UPDATE roadmap_proposal.proposal
     SET maturity = v_new_maturity
   WHERE id = NEW.proposal_id
     AND maturity <> 'obsolete';

  RETURN NEW;
END;
$$;

-- ─── HF-F: suppress fn_notify_gate_ready when recent gate decision exists ──

CREATE OR REPLACE FUNCTION roadmap.fn_notify_gate_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_gate           text;
    v_to_state       text;
    v_type           text := COALESCE(LOWER(NEW.type), 'feature');
    v_recent_decision boolean;
BEGIN
    -- Only fire when maturity transitions TO 'mature'
    IF NEW.maturity = 'mature'
       AND OLD.maturity IS DISTINCT FROM 'mature' THEN

        -- P741 (HF-F): suppress NOTIFY when a recent gate_decision_log
        -- already exists for this (proposal_id, from_state). Stops the
        -- redundant re-fire that drove the loop. 10-minute window matches
        -- the existing freshness check in transitionProposal().
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
$$;

-- ─── Post-migration validation ───────────────────────────────────────────────
DO $$
DECLARE
  v_trigger_exists boolean;
  v_release_reason_branch boolean;
  v_notify_suppression boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
     WHERE trigger_name = 'trg_release_leases_on_transition'
       AND event_object_schema = 'roadmap_proposal'
       AND event_object_table = 'proposal'
  ) INTO v_trigger_exists;
  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION 'P741 validation: trg_release_leases_on_transition not found';
  END IF;

  -- Validate the schema-bound function (roadmap_proposal.*) — that's what
  -- the trigger actually invokes.
  SELECT prosrc LIKE '%gate_transitioned%' INTO v_release_reason_branch
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'roadmap_proposal'
     AND p.proname = 'fn_lease_clear_maturity_on_release' LIMIT 1;
  IF NOT v_release_reason_branch THEN
    RAISE EXCEPTION 'P741 validation: roadmap_proposal.fn_lease_clear_maturity_on_release missing gate_transitioned branch';
  END IF;

  SELECT prosrc LIKE '%recent_decision%' INTO v_notify_suppression
    FROM pg_proc WHERE proname = 'fn_notify_gate_ready' LIMIT 1;
  IF NOT v_notify_suppression THEN
    RAISE EXCEPTION 'P741 validation: fn_notify_gate_ready missing recent-decision suppression';
  END IF;
END;
$$;

COMMIT;
