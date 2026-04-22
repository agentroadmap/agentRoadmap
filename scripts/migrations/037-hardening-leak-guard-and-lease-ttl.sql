-- P279: Hardening for autonomous orchestrator handover.
-- (1) proposal_lease.expires_at: NOT NULL with 30-minute default TTL so reaper
--     in P269 always has an anchor to reap against.
-- (2) agent_health.active_model: trigger enforcing the model is an enabled row
--     in roadmap.model_routes. Application layer (agent-spawner.ts) already
--     resolves via model_routes; this is belt-and-suspenders to block drift
--     from ad-hoc writers (manual SQL, old code paths, test fixtures).

BEGIN;

-- (1) Lease TTL default + NOT NULL
UPDATE roadmap_proposal.proposal_lease
SET expires_at = claimed_at + interval '30 min'
WHERE expires_at IS NULL AND released_at IS NULL;

UPDATE roadmap_proposal.proposal_lease
SET expires_at = COALESCE(released_at, claimed_at + interval '30 min')
WHERE expires_at IS NULL;

ALTER TABLE roadmap_proposal.proposal_lease
  ALTER COLUMN expires_at SET DEFAULT now() + interval '30 min',
  ALTER COLUMN expires_at SET NOT NULL;

-- (2) Model leak-guard: active_model must resolve to an enabled route.
CREATE OR REPLACE FUNCTION roadmap_workforce.fn_guard_active_model()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.active_model IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM roadmap.model_routes
    WHERE model_name = NEW.active_model
      AND is_enabled = TRUE
  ) THEN
    RAISE EXCEPTION
      'agent_health.active_model % is not an enabled row in roadmap.model_routes',
      NEW.active_model
      USING ERRCODE = 'check_violation',
            HINT = 'Only models present in roadmap.model_routes with is_enabled=TRUE may be reported as active.';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_active_model ON roadmap_workforce.agent_health;
CREATE TRIGGER trg_guard_active_model
  BEFORE INSERT OR UPDATE OF active_model
  ON roadmap_workforce.agent_health
  FOR EACH ROW EXECUTE FUNCTION roadmap_workforce.fn_guard_active_model();

COMMIT;
