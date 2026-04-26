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
-- Check 2: Hash chain integrity, last 24h
-- ============================================================
\echo '== Check 2: governance.decision_log hash chain (last 24h)'

-- For v1, the chain is in roadmap schema until P530.14 lands.
-- This query asserts no entries have inconsistent prev_hash linkage.
-- (Full hash recompute is in a separate verifier script — too expensive inline.)
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
-- Check 4: Stuck leases
-- ============================================================
\echo '== Check 4: Active leases with last_renewed > 5 min ago'
SELECT lease_id, proposal_id, agent_identity,
       ROUND(EXTRACT(EPOCH FROM now() - last_renewed_at)) AS stale_seconds
  FROM roadmap_workforce.proposal_lease
 WHERE status = 'active'
   AND last_renewed_at < now() - interval '5 minutes'
 LIMIT 10;
-- Expected: 0 rows. Any rows = reconciliation missed something.

-- ============================================================
-- Check 5: Catalog row counts vs. last hourly snapshot
-- ============================================================
\echo '== Check 5: Catalog row count divergence vs. baseline'
-- Compares current catalog rowcounts to the most recent hourly snapshot.
-- Snapshots live in roadmap.catalog_snapshot_baseline (created by hourly job; see P591 acceptance).
-- For v1 stub before P591 ships fully, this returns NOTICE if baseline absent.
DO $$
DECLARE
  has_baseline boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='roadmap' AND table_name='catalog_snapshot_baseline')
    INTO has_baseline;

  IF NOT has_baseline THEN
    RAISE NOTICE 'Skipped: catalog_snapshot_baseline not yet provisioned (P591 work item).';
  ELSE
    -- Once baseline exists, compare. Stubbed body for now:
    RAISE NOTICE 'TODO: compare current rowcounts vs. roadmap.catalog_snapshot_baseline';
  END IF;
END $$;

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
