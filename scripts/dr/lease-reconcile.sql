-- /scripts/dr/lease-reconcile.sql
-- Run on the new primary immediately after failover.
-- Releases leases whose holders didn't see the failover (silence > 60s before failover_time).
--
-- Required setting (passed via psql -v):
--   -v failover_time='2026-04-26T15:30:00Z'

\set ON_ERROR_STOP on
\set QUIET on

\if :{?failover_time}
\else
  \echo 'ERROR: -v failover_time=<ISO-8601> is required'
  \quit
\endif

BEGIN;

-- The cutoff: anyone whose last_renewed_at is older than failover_time - 60s
-- can't have seen the failover and won't successfully renew on the new primary.
WITH cutoff AS (
  SELECT (:'failover_time')::timestamptz - interval '60 seconds' AS ts
),
orphans AS (
  UPDATE roadmap_workforce.proposal_lease pl
     SET status = 'released',
         released_at = now(),
         released_reason = 'dr_failover_orphan'
    FROM cutoff
   WHERE pl.status = 'active'
     AND pl.last_renewed_at < cutoff.ts
  RETURNING pl.lease_id, pl.proposal_id, pl.agent_identity
)
INSERT INTO roadmap.governance_decision_log (entry_kind, actor_did, payload, prev_hash, this_hash, occurred_at)
SELECT
  'dr_lease_orphan_released',
  'did:hive:dr-reconciler',
  jsonb_build_object(
    'lease_id', lease_id,
    'proposal_id', proposal_id,
    'agent_identity', agent_identity,
    'failover_time', :'failover_time'
  ),
  COALESCE((SELECT this_hash FROM roadmap.governance_decision_log ORDER BY entry_id DESC LIMIT 1),
           repeat('0', 64)),
  encode(digest(
    COALESCE((SELECT this_hash FROM roadmap.governance_decision_log ORDER BY entry_id DESC LIMIT 1),
             repeat('0', 64))
    || jsonb_build_object('lease_id', lease_id, 'proposal_id', proposal_id)::text,
    'sha256'), 'hex'),
  now()
FROM orphans;

-- Re-offer the freed work
INSERT INTO roadmap_workforce.squad_dispatch (proposal_id, agent_identity, squad_name, dispatch_role, dispatch_status, created_at)
SELECT DISTINCT
  pl.proposal_id,
  '<reissued>',
  'dr-reissue-' || pl.proposal_id,
  'reissued_after_failover',
  'open',
  now()
  FROM roadmap_workforce.proposal_lease pl
 WHERE pl.released_reason = 'dr_failover_orphan'
   AND pl.released_at > now() - interval '5 minutes'
   AND NOT EXISTS (
     SELECT 1 FROM roadmap_workforce.squad_dispatch sd
      WHERE sd.proposal_id = pl.proposal_id
        AND sd.dispatch_status IN ('open', 'claimed')
   );

\echo 'Lease reconciliation complete.'
SELECT
  (SELECT COUNT(*) FROM roadmap_workforce.proposal_lease
    WHERE released_reason = 'dr_failover_orphan'
      AND released_at > now() - interval '5 minutes') AS orphans_released,
  (SELECT COUNT(*) FROM roadmap_workforce.squad_dispatch
    WHERE dispatch_role = 'reissued_after_failover'
      AND created_at > now() - interval '5 minutes') AS work_reissued;

COMMIT;
