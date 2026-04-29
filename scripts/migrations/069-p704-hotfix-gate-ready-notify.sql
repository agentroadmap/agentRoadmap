-- Migration 069 — P704: fn_notify_gate_ready misses hotfix workflow
--
-- Problem:
--   fn_notify_gate_ready (the BEFORE UPDATE OF maturity trigger that
--   wakes the orchestrator's `proposal_gate_ready` NOTIFY listener)
--   has a CASE statement on (draft/review/develop/merge). Hotfix
--   workflow uses TRIAGE / FIX instead, so its mature transitions
--   silently fall through to ELSE → no NOTIFY → orchestrator never
--   gets the fast-path wake. Hotfix proposals only get picked up by
--   the 30s polling fallback, behind every older proposal in the
--   queue. P704/P689 sat at TRIAGE/mature for >12 minutes without
--   the D1 hotfix gate firing — visible in the journal only as
--   "leaving for implicit-gate scanner" with no follow-up dispatch.
--
-- Fix:
--   Branch on (NEW.type, status). Hotfix: TRIAGE→FIX uses D1,
--   FIX→DEPLOYED uses D3 (matches the orchestrator-side
--   inferGateForState() in scripts/orchestrator.ts and the gate_role
--   rows seeded by migration 067). Standard RFC and other workflows
--   keep their existing mapping.

BEGIN;

CREATE OR REPLACE FUNCTION roadmap.fn_notify_gate_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_gate     text;
    v_to_state text;
    v_type     text := COALESCE(LOWER(NEW.type), 'feature');
BEGIN
    -- Only fire when maturity transitions TO 'mature'
    IF NEW.maturity = 'mature'
       AND OLD.maturity IS DISTINCT FROM 'mature' THEN

        IF v_type = 'hotfix' THEN
            -- Hotfix is a 3-stage workflow: TRIAGE → FIX → DEPLOYED.
            -- D1 gates TRIAGE→FIX (defect investigation).
            -- D3 gates FIX→DEPLOYED (fix verification). No D2 / D4.
            CASE UPPER(NEW.status)
                WHEN 'TRIAGE' THEN v_gate := 'D1'; v_to_state := 'FIX';
                WHEN 'FIX'    THEN v_gate := 'D3'; v_to_state := 'DEPLOYED';
                ELSE
                    -- Terminal (DEPLOYED/ESCALATE/WONT_FIX/NON_ISSUE) or
                    -- unmapped: silent.
                    RETURN NEW;
            END CASE;
        ELSE
            -- Standard RFC and all other workflows.
            CASE LOWER(NEW.status)
                WHEN 'draft'   THEN v_gate := 'D1'; v_to_state := 'Review';
                WHEN 'review'  THEN v_gate := 'D2'; v_to_state := 'Develop';
                WHEN 'develop' THEN v_gate := 'D3'; v_to_state := 'Merge';
                WHEN 'merge'   THEN v_gate := 'D4'; v_to_state := 'Complete';
                ELSE
                    -- Terminal or unmapped state: silent.
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
