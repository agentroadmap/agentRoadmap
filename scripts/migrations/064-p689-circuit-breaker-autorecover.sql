-- P689: auto-recovery trigger for the dispatch circuit breaker.
--
-- When a proposal's `status` or `maturity` actually changes, clear the
-- circuit-breaker pause so future dispatches can resume. This way the
-- operator doesn't have to manually unpause after a real fix lands.
-- Other reasons for `gate_scanner_paused=true` (operator pause, etc.) are
-- left untouched — only `gate_paused_by='circuit_breaker'` is cleared.

BEGIN;

CREATE OR REPLACE FUNCTION roadmap_proposal.fn_clear_circuit_breaker_on_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	-- Only clear when something actually moved.
	IF (NEW.status IS DISTINCT FROM OLD.status
	    OR NEW.maturity IS DISTINCT FROM OLD.maturity)
	   AND OLD.gate_scanner_paused = true
	   AND OLD.gate_paused_by = 'circuit_breaker' THEN
		NEW.gate_scanner_paused := false;
		NEW.gate_paused_by := NULL;
		NEW.gate_paused_at := NULL;
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_circuit_breaker_on_progress ON roadmap_proposal.proposal;
CREATE TRIGGER trg_clear_circuit_breaker_on_progress
	BEFORE UPDATE OF status, maturity ON roadmap_proposal.proposal
	FOR EACH ROW
	EXECUTE FUNCTION roadmap_proposal.fn_clear_circuit_breaker_on_progress();

COMMIT;
