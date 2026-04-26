# Control-Plane Disaster Recovery — `hiveCentral`

**Proposal:** P591 (was P530.0). **Parent:** P590.
**Status:** Design draft — Wave 1 prerequisite for P530.
**Date:** 2026-04-26.
**References:** `docs/multi-project-redesign.md` §11.3.

## 0. Why this exists

Tenant disaster recovery is per-DB and well understood (logical backup + restore, point-in-time recovery from WAL). **Control-plane DR is different.**

When `hiveCentral` goes dark:
- every project's dispatch stops (no work_offers, no leases)
- every workload-identity verification fails (orchestrator can't resolve `did:hive:spawn:*`)
- every cross-project lookup (workforce, model routes, grants) returns nothing — agencies fall back to last cached values, then die when caches expire
- the `governance.decision_log` chain stops being written; gap creates audit ambiguity
- new tenants cannot be provisioned

This document is the architectural commitment for what happens when that occurs and how we minimize it.

## 1. Targets

### v1 (single region, single PG instance + hot standby on a separate host)

| Target | Value |
|---|---|
| **RPO** (recovery point objective) | ≤ 60 seconds |
| **RTO** (recovery time objective) | ≤ 5 minutes |
| **Mean time to detect (MTTD)** | ≤ 60 seconds (heartbeat + monitoring) |
| **Mean time to decide (MTTDecide)** | Operator-driven; max 90 seconds before failover script runs |
| **Mean time to recover (MTTR)** | ≤ 5 minutes (= RTO) |

**Why operator-driven, not automatic:** a false-positive automatic failover is worse than 5 minutes of downtime. Network blip → split-brain risk. Manual decision with a clear runbook + monitoring dashboard is safer than auto-failover for v1's blast radius.

### v2 graduation (when applicable)

| Trigger | Target |
|---|---|
| Tenant requires multi-region data residency | Add regional `hiveCentral` peer; cross-region async replication; failover within region |
| Sustained > 1k dispatches/sec OR > 100 active agencies | Active-passive with read-replica offload of cross-DB lookups |

## 2. Topology

### v1 minimum viable DR

```
   Region A (production)
   ┌─────────────────────────────────────────────────────────┐
   │  Host A1 (primary)                                       │
   │  ┌─────────────────────────────────────────────────┐    │
   │  │ PostgreSQL primary                              │    │
   │  │   hiveCentral (rw)                              │    │
   │  │   agenthive (rw, tenant)                        │    │
   │  │   <other tenants> (rw)                          │    │
   │  └─────────────────────────────────────────────────┘    │
   │       │                                                  │
   │       │ streaming replication (synchronous_commit=on)    │
   │       ▼                                                  │
   │  Host A2 (hot standby, separate failure domain)          │
   │  ┌─────────────────────────────────────────────────┐    │
   │  │ PostgreSQL standby (read-only)                  │    │
   │  │   identical replica of all DBs                  │    │
   │  └─────────────────────────────────────────────────┘    │
   │                                                          │
   │  PgBouncer (in front of both, routes by pool target)     │
   │  ┌─────────────────────────────────────────────────┐    │
   │  │ pool: hivecentral_rw → A1 (default) | A2 (failover) │ │
   │  │ pool: hivecentral_ro → A2 (read replica)         │   │
   │  └─────────────────────────────────────────────────┘    │
   │                                                          │
   │  Off-host backup target                                  │
   │  ┌─────────────────────────────────────────────────┐    │
   │  │ S3-compatible object storage                    │    │
   │  │   continuous WAL archive                        │    │
   │  │   daily logical pg_dump (90-day retention)      │    │
   │  └─────────────────────────────────────────────────┘    │
   └─────────────────────────────────────────────────────────┘
```

### Failure domains, ranked

| Failure | Recovery path |
|---|---|
| Primary process crash | systemd restart; standby unaffected |
| Primary host hardware/network | Promote standby (this runbook) |
| Both hosts (datacenter outage) | Restore from off-host backup to fresh hardware (≤ 30 min worst case) |
| Logical corruption (bad migration) | PITR from WAL archive |
| Catastrophic (all backups gone) | Out of scope for v1; data declared unrecoverable |

## 3. Failover runbook

### Detection (T-0)

Monitoring is in place via:

1. **Postgres-side** — `pg_is_in_recovery()` check from a heartbeat process every 10s
2. **Service-side** — `agenthive-orchestrator`, `agenthive-copilot-agency`, etc. write a heartbeat row to `hiveCentral.core.service_heartbeat` every 30s. Lag > 60s on > 2 services = primary suspected dead.
3. **Network-side** — TCP health check from a separate host every 10s

When ≥ 2 of 3 signals indicate primary is unreachable for ≥ 60s, the on-call operator is paged.

### Operator decision (T+0 to T+90s)

Operator opens the **DR dashboard** (Grafana panel — to be built; placeholder URL `https://grafana.local/d/hivecentral-dr`) and verifies:

- [ ] Primary is genuinely unreachable (not just monitoring lag)
- [ ] Standby is healthy and caught up (`SELECT pg_last_wal_receive_lsn()` recent)
- [ ] No active in-progress migration on primary (DDL mid-flight increases risk)

If all three are true, operator runs the failover script. Otherwise: investigate first.

### Failover script (T+90s to T+5min)

`scripts/dr/hivecentral-failover.sh` — to be implemented under P591:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Pause dispatch (refuse new work offers + new workload tokens) on every running orchestrator
systemctl stop agenthive-orchestrator       # all instances; in v1, one
systemctl stop agenthive-copilot-agency
systemctl stop agenthive-claude-agency || true   # already paused for P501 hold
# a2a stays up so messages buffer, but agencies can't claim anything new

# 2. Promote standby (on Host A2)
ssh hostA2 "sudo -u postgres pg_ctl promote -D /var/lib/postgresql/16/main"

# 3. Verify standby is now primary
ssh hostA2 "sudo -u postgres psql -c 'SELECT pg_is_in_recovery();'"   # must be 'f'

# 4. Flip PgBouncer pool target
sed -i 's/hivecentral_rw = host=A1/hivecentral_rw = host=A2/' /etc/pgbouncer/pgbouncer.ini
systemctl reload pgbouncer

# 5. Run lease reconciliation pass on the new primary
psql -U admin -h pgbouncer -d hiveCentral -f /usr/local/share/agenthive/dr/lease-reconcile.sql

# 6. Verify catalog integrity (catalog hygiene + decision_log hash chain)
psql -U admin -h pgbouncer -d hiveCentral -f /usr/local/share/agenthive/dr/post-failover-verify.sql

# 7. Resume services
systemctl start agenthive-orchestrator
systemctl start agenthive-copilot-agency
systemctl start agenthive-a2a    # if it was stopped

# 8. Log the failover event in governance.decision_log
psql -U admin -h pgbouncer -d hiveCentral -c \
  "INSERT INTO governance.decision_log (entry_kind, actor_did, payload, prev_hash, this_hash) ..."
```

The script is idempotent — re-running mid-failure is safe.

### Lease reconciliation pass

```sql
-- /usr/local/share/agenthive/dr/lease-reconcile.sql
-- Released orphaned leases whose holders didn't see the failover.
-- Their next renew will fail anyway; we beat them to it.

BEGIN;

-- Mark the failover event time (passed by script env var)
SET LOCAL agenthive.failover_time = current_setting('agenthive.failover_time');

-- Orphan leases: last renew before failover_time - 60s
WITH orphans AS (
  UPDATE proposal.proposal_lease
  SET status = 'released',
      released_at = now(),
      released_reason = 'dr_failover_orphan'
  WHERE status = 'active'
    AND last_renewed_at < (current_setting('agenthive.failover_time')::timestamptz - interval '60 seconds')
  RETURNING lease_id, proposal_id, agent_did
)
INSERT INTO observability.proposal_lifecycle_event
  (project_id, proposal_display_id, from_state, to_state, from_maturity, to_maturity, triggered_by_did, context)
SELECT
  /* project lookup omitted in v1 stub */ 1,
  'P' || proposal_id::text,
  NULL, NULL, NULL, NULL,
  'did:hive:dr-reconciler',
  jsonb_build_object('orphan_lease_released', lease_id, 'agent', agent_did, 'reason', 'dr_failover')
FROM orphans;

-- Re-offer the work for orphaned leases
INSERT INTO orchestration.work_offer (proposal_id, role, posted_at, status)
SELECT proposal_id, 'reissued_after_failover', now(), 'open'
FROM (
  SELECT proposal_id FROM proposal.proposal_lease
  WHERE status = 'released' AND released_reason = 'dr_failover_orphan'
) o
WHERE NOT EXISTS (
  SELECT 1 FROM orchestration.work_offer wo
  WHERE wo.proposal_id = o.proposal_id AND wo.status = 'open'
);

COMMIT;
```

### Post-failover verification

```sql
-- /usr/local/share/agenthive/dr/post-failover-verify.sql

-- 1. Hash chain integrity (incremental: last 24h)
WITH chain AS (
  SELECT entry_id, prev_hash, this_hash,
         encode(digest(prev_hash || canonical_json_payload(...), 'sha256'), 'hex') AS recomputed
  FROM governance.decision_log
  WHERE occurred_at > now() - interval '24 hours'
  ORDER BY entry_id
)
SELECT entry_id FROM chain WHERE this_hash != recomputed;
-- Expected: 0 rows. Any rows = chain tampered.

-- 2. Catalog row counts vs. last known good (snapshot taken hourly to a backup table)
SELECT 'expected vs. actual rowcount divergence' AS check, * FROM compare_with_baseline();

-- 3. Active agencies should reconnect within 60s
SELECT agency_id, status, silence_seconds FROM v_agency_status WHERE silence_seconds > 60;
-- Any rows here after T+5min = the agency hasn't reconnected; investigate.
```

## 4. Active-lease handling during failover

Three cases for in-flight work:

### Case A — Holder reconnected fast (silence < 60s after failover)

- Lease is preserved on the new primary
- `last_renewed_at` is updated by the next normal renewal cycle
- Work continues uninterrupted from the holder's perspective

### Case B — Holder didn't reconnect within window (orphan)

- Lease released by the reconciliation pass (`released_reason='dr_failover_orphan'`)
- Work re-offered to the queue
- Original holder, when they eventually reconnect, will fail their next renew → terminate gracefully

### Case C — Holder ack'd a partial result before failover

- Partial state may have been written to tenant DB (separate failure domain — unaffected)
- Reconciliation only releases the lease; partial work is preserved in the tenant
- Next claimant picks up where the previous left off (idempotency required of all dispatch operations — this is enforced by the `(proposal_id, phase, role)` unique constraint)

## 5b. Per-tenant lease reconciliation (C1 fix)

Leases live inside each tenant DB (`<tenant>.proposal.proposal_lease`), not in
hiveCentral. hiveCentral only owns the *fan-out queue*: a row per tenant in
`roadmap.dr_orphan_lease_request` with `(project_db_dsn, failover_time, cutoff_ts)`.

The per-tenant reconciler daemon (one process per tenant DB, started by
systemd alongside the tenant) consumes its assigned rows and performs the
orphan UPDATE inside the tenant DB:

```sql
-- Tenant-side; runs inside <tenant> DB:
UPDATE proposal.proposal_lease pl
   SET status='released',
       released_at=now(),
       released_reason='dr_failover_orphan'
 WHERE pl.status='active'
   AND (pl.last_renewed_at IS NULL OR pl.last_renewed_at < $1::timestamptz);  -- C3 NULL-safe
```

After the UPDATE, the daemon UPDATEs its `dr_orphan_lease_request` row to
`request_status='complete'`. Check 4 of the post-failover verifier asserts
no row remains `pending` more than 5 minutes after `requested_at`.

**Why a queue-and-daemon, not FDW or dblink:** v1 deliberately has no FDW
between hiveCentral and tenant DBs (avoids cross-domain coupling and
blast-radius creep). The queue is the bounded-context API; the daemon is
the implementation.

## 5c. Tenant-DB DR coupling on shared instance (I3 fix)

In v1, hiveCentral and the tenant DBs share **one Postgres instance**.
Losing the instance loses both. This document's 5-minute control-plane RTO
claim is **specifically** about hiveCentral's structural durability after
the instance comes back — not about tenant data.

| Domain | RTO | RPO | Recovery path |
|---|---|---|---|
| hiveCentral (control plane) | ≤ 5 min | ≤ 60 s | Promote standby + lease reconcile (this doc) |
| Tenant DBs (project state, code artifacts) | ≤ 30 min | ≤ 24 h | Restore from off-host logical pg_dump (§8) |

When the v3 split lands and tenants move to separate physical instances
(post-v1), the tenant-RTO improves; v1 explicitly accepts the longer
tenant-restore window because (a) project state is mostly idempotent and
(b) the alternative (per-tenant streaming standbys) is an order of
magnitude more operational cost than v1 can absorb.

## 5d. Vault topology + DR (I4 fix)

The vault that holds orchestrator/identity signing keys is the **single
trust root** for workload-token verification. Its topology must be
specified or the §5 "tokens survive failover" claim doesn't hold.

**v1 vault topology:**

| Component | Where | DR |
|---|---|---|
| Primary vault (HashiCorp Vault, KV-v2 + Transit) | Same DC as hiveCentral primary, separate host | Continuous Raft replication to a vault standby in the same DC |
| Vault standby | Co-located with PG standby (separate host from PG) | Auto-takes-over on Vault Raft leader loss |
| Sealed root keys | Operator-held Shamir shards (3-of-5) | Off-host (paper) — restored only for vault re-init |

**Failover-time interaction:** vault is **independent** of PG. PG failover
does not touch vault. If both PG primary AND vault primary die in the same
event (both in DC1):

- PG standby (DC1 second host) promotes per this doc.
- Vault standby (DC1 third host) takes Raft leadership automatically.
- Workload-token verifiers re-fetch via the standby vault address (HA URL
  in `runtime_flag.vault_url` is a `vault.hivecentral.local` DNS that
  routes to the active node).

**Failure of vault HA itself** is rare but covered by a cached-public-key
fallback in MCP and PgBouncer auth hooks: each verifier caches the
orchestrator's public key for 5 minutes (configurable via
`runtime_flag.workload_verifier_cache_ttl_seconds`). If vault is briefly
unreachable during failover, cached keys serve. Beyond cache TTL, workload
verification fails closed (deny by default; operator must restore vault).

This is why §5's "tokens survive failover" works: vault HA is independent
of PG, and a 5-min cache covers the brief unreachable window.

## 5e. Operator decision SLA + escalation (I5 fix)

Real RTO = detection (60 s) + **operator decision** + script (≤ 4 min).
The operator decision was previously undefined. v1 commitment:

| Tier | SLA | Mechanism |
|---|---|---|
| Primary on-call (24×7) | 5 min decision | PagerDuty page on PG primary heartbeat fail > 60 s |
| Backup on-call | +10 min if primary doesn't ack | PagerDuty escalation policy `dr-failover-decision` |
| Engineering manager | +15 min if both on-call silent | PagerDuty escalation policy `dr-failover-decision` |

**Total worst-case operator-decision latency: 30 min.** Real RTO budget
under worst-case escalation: 60 s + 30 min + 4 min ≈ **35 min**.
Best-case (primary on-call awake and on console): 60 s + 30 s + 4 min
≈ **5 min** — matches the §1 target.

**Mandatory drill cadence:**

- Quarterly drill in business hours (primary on-call lives the script)
- Quarterly drill **after-hours** (backup on-call lives the script,
  primary deliberately doesn't ack — exercises the escalation path)

Drill outcomes recorded as `governance.decision_log` kind=`dr_drill` with
measured operator-decision latency in `payload.operator_decision_seconds`.

## 5f. Clock skew tolerance (I2 fix)

The 60-second cutoff in §5b assumes agency host clocks are within ±30 s of
the hiveCentral DB clock. NTP commonly drifts further on poorly configured
hosts. v1 mitigations:

1. **Pre-flight on script start:** `chronyc tracking` on hiveCentral and
   every reachable agency reports `Last offset` < 5 s. If any host
   exceeds ±5 s, the script aborts with `pre-flight-clock-skew` error and
   the operator either fixes NTP first or runs with `--widen-window`.
2. **Configurable cutoff:** `--widen-window=180` (default 60) on the
   failover script, mirrored by `runtime_flag.dr_lease_cutoff_seconds`.
   Setting to 180 s tolerates ±90 s clock drift.
3. **Drill instrumentation:** every drill logs `clock_skew_max_seconds`
   into `governance.decision_log.payload`. If the running max climbs
   above 30 s for 3 consecutive drills, that triggers a Tier-A proposal
   to widen the default cutoff.

## 5. Workload-token continuity

Workload tokens (`did:hive:spawn:<dispatch_id>:<spawn_serial>`) are signed by the orchestrator key. The signing key lives in **vault**, not in the DB.

This means: tokens issued before failover with `expires_at > now()` are still valid after failover. Verifiers (MCP, PgBouncer auth hook, tools) re-fetch the public key from `identity.principal_key` on the new primary and verify. As long as the signing key wasn't rotated mid-failover, no in-flight spawn loses authentication.

**Edge case:** if the failover overlaps with a scheduled key rotation, the rotation is delayed by 1 hour. Documented in the rotation runbook.

## 6. A2A message replay

`messaging.a2a_message` rows up to `last_acked_seq` per subscription are replicated to the standby (synchronous_commit=on means committed sequences are durable). On failover:

- Subscribers reconnect; LISTEN/NOTIFY drops on the dead primary, re-establishes on the new primary
- Subscribers resume from `last_acked_seq + 1`
- Sequences with no ack (in-flight when primary died) are replayed; subscribers MUST handle duplicates idempotently (this is already a v3 design constraint per §7)
- DLQ entries are replicated; no DLQ-side recovery needed

## 7. DR drills

| Cadence | What | Where | Logged |
|---|---|---|---|
| Monthly | Full failover drill (real promotion + real reconnect of services) | Staging | `governance.decision_log` kind=`dr_drill` |
| Quarterly | Backup-restore drill — restore a `tenant_backup` to a scratch DB, run smoke tests | Staging | `governance.decision_log` kind=`backup_restore_drill` |
| Annually | "Cold" DR — primary AND standby simulated dead; restore from off-host backup | Isolated env | `governance.decision_log` kind=`cold_dr_drill` |

Drill runbook is checked into `docs/dr/drill-runbook.md` (to be written under P591); drill results are reported in the next operator review.

## 8. Backup of the control plane itself

| Artifact | Cadence | Storage | Retention |
|---|---|---|---|
| WAL stream | Continuous | S3-compatible off-host bucket | 30 days |
| Logical `pg_dump` (custom format) of `hiveCentral` | Daily | S3-compatible off-host bucket | 90 days |
| Logical `pg_dump` of every tenant DB | Daily | S3-compatible off-host bucket | 90 days, plus tenant-specific retention from `project.tenant_lifecycle.backup_policy` |
| Catalog snapshot (rowcount, hash-chain head, top of every catalog) | Hourly | Same PG, separate backup schema | 7 days |

**Restore time from off-host backup:** ≤ 30 minutes for `hiveCentral` (assuming fresh hardware ready).

**Restore-test job:** weekly automated restore of the most recent logical dump to a scratch instance, verify smoke tests pass, log to `governance.decision_log` kind=`backup_verified`.

## 9. What is explicitly out of scope for v1

| Not v1 | When |
|---|---|
| Automatic failover | When operator decision time becomes the bottleneck (i.e. > 1 RTO event/quarter) |
| Multi-region | When a tenant has data-residency requiring it |
| Active-active control plane | Possibly never — dual-master Postgres is too risky for governance state |
| Standby in a different cloud / different provider | When risk model demands it (eg. provider-wide outage exposure) |

## 10. Acceptance criteria for P591

The authoritative AC list is in `roadmap_proposal.proposal_acceptance_criteria`
(WHERE proposal_id=591); this document mirrors. If they diverge, the DB wins.
Latest snapshot (post-skeptic-squad revision):

1. Topology diagram + DR scripts committed under `scripts/dr/`
2. `lease-reconcile.sql` + `post-failover-verify.sql` committed AND target the v3 tenant-DB layout (per-tenant fan-out queue, not `roadmap_workforce.*`)
3. One end-to-end failover drill in staging logged to `governance.decision_log` kind=`dr_drill` with RPO/RTO measurements
4. RPO measurement during drill ≤ 60 s
5. RTO measurement during drill ≤ 5 min
6. Lease reconciliation releases zero orphans on a clean drill
7. Lease reconciliation releases all orphans on a stuck-claim drill (deliberately killed mid-flight agent)
8. Hash-chain integrity check fully recomputes `this_hash = sha256(prev_hash || canonical_payload)` — not linkage-only
9. `catalog_snapshot_baseline` DDL committed AND hourly snapshot job scheduled, OR Check 5 explicitly removed and deferred (v1: deferred to P604/observability)
10. `failover.sh`: `psql -v` parameter binding everywhere (no heredoc interpolation); idempotent PgBouncer config edit; `pg_ctl promote -w`; reverse-order PgBouncer flip AFTER lease-reconcile
11. `lease-reconcile.sql` (and the documented per-tenant SQL contract): NULL-safe predicate `(last_renewed_at IS NULL OR last_renewed_at < cutoff.ts)`
12. Design doc explicitly answers: tenant-DB DR coupling on shared instance, vault topology + DR, operator-decision SLA + escalation policy, clock-skew tolerance
13. Backup restore-test job runs weekly without intervention
14. Runbook reviewed by at least one external operator (two-person ops principle)

## 11. Open questions for review

1. **Synchronous vs. asynchronous replication.** v1 calls for `synchronous_commit=on` (no data loss but primary blocks on standby ack). For a control plane this is correct. Cost: ~10% write latency. Acceptable for v1.
2. **Standby promotion: `pg_ctl promote` vs. `pg_promote()`.** Both work; `pg_ctl promote` is the script-friendly choice. Settled.
3. **PgBouncer pool target flip — atomic enough?** Reload is fast (< 1s); existing connections drain. Acceptable. If tighter is needed later, switch to a TCP-level proxy with health checks (HAProxy, Envoy).
4. **Off-host backup: S3 vs. local NAS?** v1 = S3 with versioning enabled. NAS in same datacenter doesn't satisfy "separate failure domain" requirement.
5. **Service heartbeat table ownership.** `core.service_heartbeat` lives in `hiveCentral`, but if `hiveCentral` is dead the heartbeat can't be written. Solution: services also publish heartbeat to systemd's `sd_notify` watchdog, which the on-call dashboard scrapes. Two paths; one independent of PG.
