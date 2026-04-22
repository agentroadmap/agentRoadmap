-- P290: Gate enforcement — prevent forward status advancement on gated transitions
-- without a recent gate decision in gate_decision_log or proposal_reviews.
--
-- Gated transitions: DRAFT→REVIEW (D1), REVIEW→DEVELOP (D2),
--                    DEVELOP→MERGE (D3), MERGE→COMPLETE (D4)
--
-- Enforcement: BEFORE UPDATE trigger checks that within the last 10 minutes
-- either gate_decision_log has decision='advance' for (proposal_id, from→to)
-- or proposal_reviews has verdict='approve' for the proposal.
--
-- Bypass: set local app.gate_bypass = 'true' within the same transaction
-- to allow the orchestrator to pre-insert the decision record then update.
--
-- Prerequisites: 018-gate-decision-audit.sql must be applied.
-- Backward-compatible: trigger only fires on forward status changes along
-- the four gated paths; other transitions and backward rollbacks are unaffected.

BEGIN;

CREATE OR REPLACE FUNCTION roadmap_proposal.fn_guard_gate_advance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_gate_key TEXT;
    v_has_decision BOOLEAN;
BEGIN
    -- Only act on forward gated status changes
    v_gate_key := UPPER(OLD.status) || E'\u2192' || UPPER(NEW.status);

    IF v_gate_key NOT IN (
        E'DRAFT\u2192REVIEW',
        E'REVIEW\u2192DEVELOP',
        E'DEVELOP\u2192MERGE',
        E'MERGE\u2192COMPLETE'
    ) THEN
        RETURN NEW;
    END IF;

    -- Allow orchestrator bypass within an explicit transaction
    IF current_setting('app.gate_bypass', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Check gate_decision_log for a recent 'advance' decision
    SELECT EXISTS (
        SELECT 1
        FROM roadmap_proposal.gate_decision_log gdl
        WHERE gdl.proposal_id = NEW.id
          AND UPPER(gdl.from_state) = UPPER(OLD.status)
          AND UPPER(gdl.to_state)   = UPPER(NEW.status)
          AND gdl.decision = 'advance'
          AND gdl.created_at >= now() - INTERVAL '10 minutes'
    ) INTO v_has_decision;

    IF v_has_decision THEN
        RETURN NEW;
    END IF;

    -- Check proposal_reviews for an 'approve' verdict (within 10 minutes)
    SELECT EXISTS (
        SELECT 1
        FROM roadmap_proposal.proposal_reviews pr
        WHERE pr.proposal_id = NEW.id
          AND pr.verdict = 'approve'
          AND pr.reviewed_at >= now() - INTERVAL '10 minutes'
    ) INTO v_has_decision;

    IF v_has_decision THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'Gate transition % → % on proposal % requires a gate decision. '
        'Submit a gate review (proposal_reviews verdict=approve) or '
        'gate_decision_log (decision=advance) within the last 10 minutes before advancing.',
        OLD.status, NEW.status, NEW.id
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_gate_advance ON roadmap_proposal.proposal;

CREATE TRIGGER trg_guard_gate_advance
    BEFORE UPDATE OF status ON roadmap_proposal.proposal
    FOR EACH ROW
    EXECUTE FUNCTION roadmap_proposal.fn_guard_gate_advance();

COMMENT ON FUNCTION roadmap_proposal.fn_guard_gate_advance() IS
    'P290: Enforces that gated status transitions (D1-D4) require a recent '
    'gate_decision_log advance entry or proposal_reviews approve verdict. '
    'Bypass with SET LOCAL app.gate_bypass = ''true'' inside a transaction.';

COMMIT;
