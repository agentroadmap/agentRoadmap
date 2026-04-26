-- 049-p409b-maturity-text-assignment-fix.sql
-- Description: Hotfix latent bug in fn_sync_proposal_maturity (originally migration 011)
-- Bug: NEW.maturity := jsonb_build_object(NEW.status, v_level) writes a JSON object
--      like {"REVIEW": "active"} into the TEXT-typed maturity column. The
--      fn_validate_proposal_reference_terms trigger then rejects every status change
--      with `Unknown proposal maturity "{REVIEW: active}"` because no such value
--      exists in roadmap.reference_terms.
-- Fix: Assign just the level value (active/obsolete/new) to NEW.maturity, matching
--      the TEXT column type and reference_terms vocabulary.
-- Discovered while attempting D1 gate of P475 and P476 — every transition failed
-- silently for who knows how long. The bug was masked because the trigger only fires
-- on status CHANGE, and most callers go through trigger-bypassing service paths.
-- P-ref: P409 (extends, hotfix)
-- Date: 2026-04-26

BEGIN;

CREATE OR REPLACE FUNCTION roadmap.fn_sync_proposal_maturity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_level text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Terminal-stage guard (P409): do not recompute maturity for completed proposals.
  IF NEW.status IN ('DEPLOYED','COMPLETE','CLOSED','MERGED','RECYCLED') THEN
    RETURN NEW;
  END IF;

  v_level := CASE
    WHEN NEW.status IN ('FIX','DEVELOP','REVIEW','REVIEWING','MERGE','ESCALATE') THEN 'active'
    WHEN NEW.status IN ('REJECTED','DISCARDED','ABANDONED') THEN 'obsolete'
    ELSE 'new'
  END;

  -- P409b: assign the text level, not a JSON map.
  NEW.maturity := v_level;
  RETURN NEW;
END;
$$;

COMMIT;
