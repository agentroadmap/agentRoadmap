-- Migration 071 — P721: rate-limit classification
--
-- Problem: Claude's daily usage cap exits with a recognisable message
-- ("You've hit your limit · resets 11pm (America/Toronto)"). The
-- orchestrator currently treats these as 'failed' runs, which trips the P689
-- circuit breaker after 7 such runs and floods Discord with CRITICAL alerts
-- for a route outage, not a real dispatch loop.
--
-- Fix:
--   1. Allow 'rate_limited' as a valid agent_runs.status value.
--   2. Allow 'throttled' as a valid squad_dispatch.dispatch_status value.
--   3. Create roadmap.host_model_route_throttle — records which routes are
--      throttled and until when; checked by postWorkOffer before dispatching.
--   4. Seed notification_route for 'route_throttled' → discord_webhook at
--      WARNING severity (not CRITICAL — it's expected/transient behaviour).
--
-- Idempotent: uses IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.

BEGIN;

-- ─── 1. Extend agent_runs status CHECK ───────────────────────────────────────
-- Find and drop the existing status CHECK so we can widen it.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class r ON c.conrelid = r.oid
  JOIN pg_namespace n ON r.relnamespace = n.oid
  WHERE n.nspname = 'roadmap_workforce'
    AND r.relname = 'agent_runs'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE roadmap_workforce.agent_runs DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

ALTER TABLE roadmap_workforce.agent_runs
  ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'rate_limited', 'cancelled', 'timeout'));

-- ─── 2. Extend squad_dispatch status CHECK ────────────────────────────────────
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class r ON c.conrelid = r.oid
  JOIN pg_namespace n ON r.relnamespace = n.oid
  WHERE n.nspname = 'roadmap_workforce'
    AND r.relname = 'squad_dispatch'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%dispatch_status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE roadmap_workforce.squad_dispatch DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

ALTER TABLE roadmap_workforce.squad_dispatch
  ADD CONSTRAINT squad_dispatch_status_check
  CHECK (dispatch_status IN ('open', 'assigned', 'active', 'blocked', 'completed', 'failed', 'throttled', 'cancelled'));

-- ─── 3. Route throttle table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roadmap.host_model_route_throttle (
  provider       text        NOT NULL,
  model          text        NOT NULL,
  throttled_until timestamptz NOT NULL,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (provider, model)
);

CREATE INDEX IF NOT EXISTS idx_route_throttle_until
  ON roadmap.host_model_route_throttle (throttled_until);

COMMENT ON TABLE roadmap.host_model_route_throttle IS
  'P721: tracks per-(provider, model) throttle windows due to usage caps or 429s. '
  'postWorkOffer skips dispatch when now() < throttled_until.';

-- ─── 4. Notification route seed ───────────────────────────────────────────────
-- One discord webhook at WARNING (not CRITICAL — outage is expected/transient).
-- Backstop log_only at INFO so the event is never silently dropped.
INSERT INTO roadmap.notification_route
  (kind, severity_min, transport, target, notes)
VALUES
  ('route_throttled', 'WARNING', 'discord_webhook', NULL,
   'P721: model route hit usage cap — throttled until reset time'),
  ('route_throttled', 'INFO',    'log_only',        NULL,
   'P721: backstop — always log throttle events regardless of discord delivery')
ON CONFLICT DO NOTHING;

COMMIT;
