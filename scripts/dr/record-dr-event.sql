-- /scripts/dr/record-dr-event.sql
-- Record a DR-failover-completed event in governance.decision_log with
-- properly parameter-bound variables (no shell-string interpolation).
--
-- Required psql -v variables:
--   -v failover_time='2026-04-26T15:30:00Z'
--   -v old_primary='hostA1'
--   -v new_primary='hostA2'
--   -v log_path='/var/log/agenthive/dr-failover-...log'
--
-- I1: this_hash is computed as sha256(prev_hash || canonical_payload), where
-- canonical_payload is the deterministic jsonb canonicalized via
-- jsonb_build_object(...)::text — same input the verifier recomputes.

\set ON_ERROR_STOP on

\if :{?failover_time}
\else
  \echo 'ERROR: -v failover_time=<ISO-8601> is required'
  \quit
\endif
\if :{?old_primary}
\else
  \echo 'ERROR: -v old_primary=<host> is required'
  \quit
\endif
\if :{?new_primary}
\else
  \echo 'ERROR: -v new_primary=<host> is required'
  \quit
\endif
\if :{?log_path}
\else
  \echo 'ERROR: -v log_path=<path> is required'
  \quit
\endif

WITH last_chain AS (
  SELECT this_hash
    FROM roadmap.governance_decision_log
   ORDER BY entry_id DESC
   LIMIT 1
),
prev AS (
  SELECT COALESCE((SELECT this_hash FROM last_chain), repeat('0', 64)) AS prev_hash
),
payload AS (
  SELECT jsonb_build_object(
           'failover_time', :'failover_time',
           'old_primary',   :'old_primary',
           'new_primary',   :'new_primary',
           'log_path',      :'log_path'
         ) AS body
)
INSERT INTO roadmap.governance_decision_log
  (entry_kind, actor_did, payload, prev_hash, this_hash, occurred_at)
SELECT
  'dr_failover_completed',
  'did:hive:dr-operator',
  payload.body,
  prev.prev_hash,
  encode(digest(prev.prev_hash || payload.body::text, 'sha256'), 'hex'),
  now()
FROM prev, payload;

\echo 'DR event recorded in governance.decision_log'
