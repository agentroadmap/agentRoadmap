-- /scripts/dr/lease-reconcile.sql
--
-- P591 C1+C3: Run on the new primary (hiveCentral DB) immediately after
-- failover. Releases per-tenant proposal leases whose holders didn't see the
-- failover (silence > 60s before failover_time).
--
-- v3 layout assumption: each project owns a tenant DB whose connection is
-- registered in `project.project_db`. Leases live in
-- `<tenant>.proposal.proposal_lease`; dispatch in `<tenant>.dispatch.work_offer`.
-- This script writes ONE row per tenant into a central observability mirror
-- (`roadmap.dr_orphan_lease_request`) and a follower job inside each tenant DB
-- consumes it (the central DB has no FDW to tenant DBs in v1, by design).
--
-- See docs/dr/hivecentral-dr-design.md §5b (per-tenant fan-out) for the full
-- topology. The v1 implementation uses NOTIFY + a per-tenant reconciler
-- daemon; this SQL only enqueues work into the central observability mirror.
--
-- Required psql -v variables:
--   -v failover_time='2026-04-26T15:30:00Z'
--
-- C3: NULL last_renewed_at must be treated as orphan, NOT silently kept active.
-- The previous form `last_renewed_at < cutoff.ts` returned NULL (not TRUE)
-- when last_renewed_at IS NULL, so freshly-issued-but-never-renewed leases
-- belonging to dead agents would survive failover. Use IS NULL OR < cutoff.

\set ON_ERROR_STOP on
\set QUIET on

\if :{?failover_time}
\else
  \echo 'ERROR: -v failover_time=<ISO-8601> is required'
  \quit
\endif

BEGIN;

-- The cutoff: any lease whose last_renewed_at is older than failover_time - 60s
-- (or NULL — never renewed) can't have seen the failover and won't successfully
-- renew on the new primary.
WITH cutoff AS (
  SELECT (:'failover_time')::timestamptz - interval '60 seconds' AS ts
),
-- Enqueue one orphan-reconcile request per tenant DB. The per-tenant
-- reconciler daemon (running inside each project's tenant DB) reads this
-- table and issues the matching UPDATE/INSERT inside its own database.
enqueued AS (
  INSERT INTO roadmap.dr_orphan_lease_request
        (project_id, project_db_id, project_db_dsn,
         failover_time, cutoff_ts, request_status, requested_at)
  SELECT pdb.project_id,
         pdb.id,
         pdb.dsn,
         (:'failover_time')::timestamptz,
         cutoff.ts,
         'pending',
         now()
    FROM project.project_db pdb
   CROSS JOIN cutoff
   WHERE pdb.lifecycle_status = 'active'
   RETURNING id, project_id, project_db_id
)
INSERT INTO roadmap.governance_decision_log
  (entry_kind, actor_did, payload, prev_hash, this_hash, occurred_at)
SELECT
  'dr_lease_reconcile_enqueued',
  'did:hive:dr-reconciler',
  jsonb_build_object(
    'request_id',    enqueued.id,
    'project_id',    enqueued.project_id,
    'project_db_id', enqueued.project_db_id,
    'failover_time', :'failover_time'
  ),
  COALESCE((SELECT this_hash FROM roadmap.governance_decision_log ORDER BY entry_id DESC LIMIT 1),
           repeat('0', 64)),
  encode(digest(
    COALESCE((SELECT this_hash FROM roadmap.governance_decision_log ORDER BY entry_id DESC LIMIT 1),
             repeat('0', 64))
    || jsonb_build_object(
         'request_id',    enqueued.id,
         'project_id',    enqueued.project_id,
         'project_db_id', enqueued.project_db_id
       )::text,
    'sha256'), 'hex'),
  now()
  FROM enqueued;

-- NOTIFY the per-tenant reconcilers so they can consume their queue rows
-- without polling delay.
SELECT pg_notify('dr_orphan_lease_request', 'failover');

\echo 'Lease reconciliation enqueued for all active tenant DBs.'
SELECT
  (SELECT COUNT(*)
     FROM roadmap.dr_orphan_lease_request
    WHERE failover_time = (:'failover_time')::timestamptz)
   AS tenant_requests_enqueued;

COMMIT;

-- ============================================================
-- Tenant-side SQL (executed by per-tenant reconciler against each tenant DB).
-- This is the contract the reconciler daemon implements; it is reproduced
-- here as documentation. Do NOT run this block from hiveCentral — it
-- references tables that only exist inside a tenant DB.
-- ============================================================
--
-- BEGIN;
-- WITH cutoff AS (
--   SELECT $1::timestamptz - interval '60 seconds' AS ts   -- failover_time
-- ),
-- orphans AS (
--   UPDATE proposal.proposal_lease pl
--      SET status          = 'released',
--          released_at     = now(),
--          released_reason = 'dr_failover_orphan'
--     FROM cutoff
--    WHERE pl.status = 'active'
--      AND (pl.last_renewed_at IS NULL OR pl.last_renewed_at < cutoff.ts)  -- C3
--   RETURNING pl.lease_id, pl.proposal_id, pl.agent_identity
-- )
-- INSERT INTO dispatch.work_offer (proposal_id, role, status, source, created_at)
-- SELECT proposal_id, 'reissued_after_failover', 'open', 'dr-reissue', now()
--   FROM orphans
--  WHERE NOT EXISTS (
--    SELECT 1 FROM dispatch.work_offer wo
--     WHERE wo.proposal_id = orphans.proposal_id
--       AND wo.status IN ('open', 'claimed')
--  );
-- COMMIT;
-- -- The reconciler reports back to hiveCentral by UPDATE on
-- -- roadmap.dr_orphan_lease_request SET request_status='complete', completed_at=now(), ...
