> **Type:** reference  
> **MCP-tracked:** P517  
> **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P517

# Tenant Host Migration Runbook

This runbook defines the operational pattern for moving one AgentHive tenant
database from the shared Postgres host to a dedicated Postgres host. It is a
tenant-scoped cutover pattern: hiveCentral/control-plane state remains in place,
and only the selected tenant DSN changes.

## When To Use

Move a tenant only when measured load justifies host isolation. Selection must be
based on metrics, not speculation.

| Signal | Threshold | Source |
| --- | --- | --- |
| Tenant DB size | >50 GB | `pg_database_size()` |
| Write pressure | sustained replication lag >100 ms | logical replication stats |
| CPU attribution | tenant workload >30% shared host CPU | host metrics + `pg_stat_statements` |
| Operator request | tenant has explicit isolation/SLA need | proposal discussion |

Assume the new Postgres host is in the same region as the app tier. Cross-region
failover and active-active routing are out of scope for P517.

## Pre-Cutover Gates

1. Confirm the tenant has an approved migration proposal and rollback owner.
2. Provision the new Postgres host and create the target tenant database.
3. Apply the same tenant schema version as the source database.
4. Verify backup automation is healthy on the new host before application
   cutover. Do not cut over into a host with no working backup path.
5. Create logical replication from source tenant DB to target tenant DB.
6. Verify table counts, identity sequences, extension list, and DDL version.
7. Define a tenant-specific write-pause target:

| Tenant tier | Target pause window |
| --- | --- |
| Tier 1 critical/high-QPS tenant | <30 seconds |
| Tier 2 medium tenant | <90 seconds |
| Tier 3 low/test tenant | <5 minutes |

## Write Pause

Use an explicit per-tenant pause table rather than a schemaless JSONB flag.

```sql
CREATE TABLE IF NOT EXISTS roadmap_project.tenant_paused_writes (
  project_slug TEXT PRIMARY KEY,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  paused_by TEXT NOT NULL
);
```

Application write paths with known `project_slug` must refuse writes while a row
exists for that tenant. Reads may continue unless the migration owner chooses a
full maintenance window.

## Cutover Steps

1. Announce the tenant-scoped write pause.
2. Insert the tenant pause row.
3. Drain in-flight transactions:

```sql
SELECT pid, usename, xact_start, query
  FROM pg_stat_activity
 WHERE datname = :'tenant_db'
   AND state IN ('active', 'idle in transaction')
 ORDER BY xact_start;
```

4. If any transaction exceeds replication lag + 5 seconds, terminate it and log
   the incident:

```sql
SELECT pg_terminate_backend(:pid);
```

5. Wait for logical replication lag to reach zero or the approved threshold.
6. Flip the tenant DSN in the vault/config registry.
7. Evict the tenant connection pool cache, for example `evictProject(slug)`.
8. Open a new connection and confirm it resolves to the dedicated host.
9. Run tenant smoke tests against the new host.
10. Remove the tenant pause row.

## Post-Cutover Verification

Run these checks immediately after writes resume:

```sql
SELECT current_database(), inet_server_addr(), inet_server_port();
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema');
SELECT sequence_schema, sequence_name, data_type
  FROM information_schema.sequences
 ORDER BY sequence_schema, sequence_name;
```

Check replication slots on the old host and remove tenant slots after the DSN
flip is verified:

```sql
SELECT slot_name, active, restart_lsn
  FROM pg_replication_slots
 WHERE slot_name LIKE 'tenant_%';

SELECT pg_drop_replication_slot(:slot_name);
```

The old production database should not remain as the retention mechanism. Take a
separate backup snapshot, keep it for 7 days, then remove the old DB after
verification.

## Rollback

Rollback is the same pattern in reverse:

1. Pause tenant writes.
2. Replicate from the dedicated host back to the shared host.
3. Verify lag, counts, sequences, and schema version.
4. Flip the tenant DSN back to the shared host.
5. Evict the tenant pool cache.
6. Run smoke tests.
7. Drop replication slots on the source host after verification.

Rollback should also be considered for cost optimization if a dedicated host is
over-provisioned after observed usage stabilizes.

## Evidence To Record

Add a P517 proposal discussion with:

1. Tenant slug and selected-host rationale.
2. Pre-cutover backup verification result.
3. Pause start/end timestamps and measured write-pause duration.
4. Replication lag at cutover.
5. Pool eviction confirmation.
6. Smoke-test output.
7. Backup snapshot location and retention expiry.
8. Replication slot cleanup result.
