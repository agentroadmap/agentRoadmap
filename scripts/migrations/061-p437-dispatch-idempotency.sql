-- P437: Dispatch idempotency + transition leases.
--
-- Make the squad_dispatch row the idempotency boundary for proposal state
-- work. A deterministic idempotency_key over
-- (project_id, proposal_id, workflow_state, maturity, role, dispatch_version)
-- plus a partial UNIQUE INDEX over open/assigned/active rows means concurrent
-- callers either INSERT the same row (one wins) or DO UPDATE the existing one
-- (and bump attempt_count). Repeated polls within a transition window get the
-- same dispatch_id back.
--
-- Pre-existing call sites (postWorkOffer + the two orchestrator gate inserts)
-- are migrated in code to compute the key and use ON CONFLICT.

BEGIN;

-- Required for digest()/sha256 hashing.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add idempotency columns. Defaults keep legacy rows valid until the
--    UPDATE backfill completes.
ALTER TABLE roadmap_workforce.squad_dispatch
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS attempt_count   integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dispatch_version integer NOT NULL DEFAULT 1;

-- 2. Backfill idempotency_key for historical rows. The key is
--    sha256(project_id : proposal_id : status : maturity : role : version).
--    Status / maturity come from the proposal at backfill time; for live rows
--    they may have drifted from the dispatch's original intent, but a stable
--    key is more important than a perfect one for the partial-unique index.
UPDATE roadmap_workforce.squad_dispatch sd
SET idempotency_key = encode(
  digest(
    COALESCE(sd.project_id::text, '0') || ':' ||
    sd.proposal_id::text || ':' ||
    COALESCE(p.status, 'unknown') || ':' ||
    COALESCE(p.maturity, 'unknown') || ':' ||
    sd.dispatch_role || ':' ||
    sd.dispatch_version::text,
    'sha256'
  ),
  'hex'
)
FROM roadmap.proposal p
WHERE sd.proposal_id = p.id
  AND sd.idempotency_key IS NULL;

-- For dispatches whose proposal has been deleted (rare), generate a unique
-- placeholder so the NOT NULL constraint holds.
UPDATE roadmap_workforce.squad_dispatch
SET idempotency_key = 'legacy:' || id::text
WHERE idempotency_key IS NULL;

ALTER TABLE roadmap_workforce.squad_dispatch
  ALTER COLUMN idempotency_key SET NOT NULL,
  ALTER COLUMN idempotency_key SET DEFAULT ('legacy:' || gen_random_uuid()::text);
-- Default protects legacy INSERT call sites that haven't been migrated yet —
-- they get a unique placeholder so the NOT NULL holds and the partial unique
-- index never collides. Once postWorkOffer + the orchestrator gate INSERTs
-- compute the deterministic key explicitly, the default becomes a safety net.

-- 3. Partial UNIQUE INDEX. Only enforces uniqueness over rows currently in an
--    "alive" state — completed / failed / cancelled rows are excluded so the
--    same logical work can re-dispatch a fresh row after terminal close.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_squad_dispatch_idempotency_alive
  ON roadmap_workforce.squad_dispatch (idempotency_key)
  WHERE dispatch_status IN ('open', 'assigned', 'active');

-- 4. transition_lease: a per-(project_id, proposal_id, workflow_state)
--    advisory mutex held during transition processing. Callers acquire via
--    INSERT ... ON CONFLICT DO UPDATE WHERE expires_at < now() RETURNING ...,
--    or via SELECT ... FOR UPDATE inside a transaction. Expired rows are
--    auto-stealable by the next caller; we don't need a reaper.
CREATE TABLE IF NOT EXISTS roadmap_workforce.transition_lease (
  project_id     bigint      NOT NULL,
  proposal_id    bigint      NOT NULL REFERENCES roadmap_proposal.proposal(id) ON DELETE CASCADE,
  workflow_state text        NOT NULL,
  acquired_by    text        NOT NULL,
  acquired_at    timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '30 seconds',
  PRIMARY KEY (project_id, proposal_id, workflow_state)
);

CREATE INDEX IF NOT EXISTS idx_transition_lease_expiry
  ON roadmap_workforce.transition_lease (expires_at);

COMMIT;
