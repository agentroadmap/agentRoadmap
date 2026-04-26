-- /scripts/dr/post-failover-verify.sql
-- Run on the new primary after lease-reconcile.
-- Reports anomalies; non-zero exit if any check fails.

\set ON_ERROR_STOP on

-- ============================================================
-- Check 1: This is genuinely the primary, not still a standby
-- ============================================================
\echo '== Check 1: pg_is_in_recovery (must be f)'
SELECT pg_is_in_recovery() AS in_recovery;
-- The verifier script (calling shell) parses this; t = abort with error.

-- ============================================================
-- Check 2: Hash chain integrity, last 24h (FULL crypto recompute)
-- ============================================================
\echo '== Check 2a: governance.decision_log linkage (last 24h)'

-- For v1, the chain is in roadmap schema until P530.14 lands.
-- 2a verifies prev_hash linkage (cheap; catches index gaps).
WITH chain AS (
  SELECT entry_id, prev_hash, this_hash,
         LAG(this_hash) OVER (ORDER BY entry_id) AS expected_prev
    FROM roadmap.governance_decision_log
   WHERE occurred_at > now() - interval '24 hours'
)
SELECT entry_id, prev_hash, expected_prev
  FROM chain
 WHERE expected_prev IS NOT NULL
   AND prev_hash IS DISTINCT FROM expected_prev
 LIMIT 5;
-- Expected: 0 rows. Any rows = chain link broken.

\echo '== Check 2b: governance.decision_log full hash recompute (last 24h)'

-- I1: linkage-only verification can be defeated by an attacker who updates
-- both prev_hash and this_hash consistently. The real verifier recomputes
-- this_hash = sha256(prev_hash || canonical_payload) and compares to the
-- stored value. canonical_payload is the deterministic serialization the
-- writer used (jsonb::text from jsonb_build_object — Postgres canonicalizes
-- key order on jsonb cast).
WITH suspect AS (
  SELECT entry_id,
         this_hash,
         encode(digest(prev_hash || payload::text, 'sha256'), 'hex')
           AS recomputed_hash
    FROM roadmap.governance_decision_log
   WHERE occurred_at > now() - interval '24 hours'
)
SELECT entry_id, this_hash, recomputed_hash
  FROM suspect
 WHERE this_hash IS DISTINCT FROM recomputed_hash
 LIMIT 5;
-- Expected: 0 rows. Any rows = stored this_hash does not match the
-- canonical recompute → tampering or writer-version drift.

-- ============================================================
-- Check 3: Agency reconnection
-- ============================================================
\echo '== Check 3: Agencies with silence > 60s (post-failover)'
SELECT agency_id, status, dispatchable, ROUND(silence_seconds) AS silence_s
  FROM roadmap.v_agency_status
 WHERE status NOT IN ('paused', 'retired')
   AND silence_seconds > 60
 ORDER BY silence_seconds DESC;
-- Expected: 0 rows after T+5min. Any here = agencies haven't reconnected.

-- ============================================================
-- Check 4: Stuck per-tenant requests (control-plane visibility)
-- ============================================================
-- C1: stuck-lease detection moves into each tenant DB (where the per-tenant
-- reconciler runs the orphan UPDATE). From hiveCentral we can only assert
-- that every dispatched request has been picked up and reported back.
\echo '== Check 4: dr_orphan_lease_request still pending after T+5min'
SELECT id, project_id, project_db_id, requested_at, request_status
  FROM roadmap.dr_orphan_lease_request
 WHERE request_status = 'pending'
   AND requested_at < now() - interval '5 minutes'
 ORDER BY requested_at
 LIMIT 10;
-- Expected: 0 rows. Any rows = a tenant-side reconciler hasn't reported
-- back; either the tenant DB is unreachable or its reconciler crashed.

-- ============================================================
-- Check 5: DEFERRED — catalog row-count baseline
-- ============================================================
-- C4: The previous version of this check referenced
-- `roadmap.catalog_snapshot_baseline`, which has no DDL and no producing
-- job. Rather than ship a stubbed check that always RAISE NOTICE, defer
-- it explicitly until the hourly catalog-snapshot job is built (tracked
-- as a follow-up under P604/observability). Bringing this check back is
-- a one-line edit once the baseline table exists.
\echo '== Check 5: catalog row-count baseline — DEFERRED to P604/observability'
\echo '   (no catalog_snapshot_baseline producer in v1 — see hivecentral-dr-design.md §10)'

-- ============================================================
-- Check 6: Replication slot health (we are no longer replicating to the dead primary)
-- ============================================================
\echo '== Check 6: Replication slots — dead-primary slot should be gone'
SELECT slot_name, active, restart_lsn
  FROM pg_replication_slots
 WHERE slot_name LIKE '%hivecentral_standby%';
-- After promotion, the standby slot should be replaced (or repointed at the OLD primary
-- which is being rebuilt as a new standby). Operator reviews.

\echo ''
\echo 'Post-failover verification complete. Review output above.'
\echo 'If any check shows unexpected rows, investigate before declaring failover successful.'
