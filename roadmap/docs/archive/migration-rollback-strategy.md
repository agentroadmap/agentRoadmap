# Rollback Strategy: DB Migration Failure Recovery
**STATE-095 AC#4** | Created: 2026-03-25 15:10 UTC | Author: Carter

## Core Principle

**Rollback is a config change, not a data operation.** The dual-write strategy ensures filesystem always has a complete copy. If Postgres fails, we switch reads back to files instantly.

---

## Rollback Triggers

| Trigger | Severity | Action |
|---------|----------|--------|
| Postgres crash/restart loop | Critical | Immediate rollback |
| Data loss detected (state missing in Postgres) | Critical | Immediate rollback |
| Consistency violations >5% | High | Investigate, rollback if not resolved in 1h |
| Performance degradation >3x | Medium | Investigate, consider rollback |
| Bug causing incorrect state reads | Critical | Immediate rollback + fix |
| Postgres storage full | High | Rollback,扩容后重试 |

---

## Rollback Procedure

### Step 1: Switch Primary to Filesystem (< 1 second)

```typescript
// Option A: Environment variable (zero-downtime)
process.env.MIGRATION_PRIMARY = 'filesystem';

// Option B: Config reload
server.config.set('migration.primary', 'filesystem');
server.config.set('migration.dualWrite', false);
server.reload();

// Option C: Feature flag
featureFlags.disable('postgres-primary');
```

### Step 2: Verify Reads Working

```bash
# CLI command
roadmap state list          # Should show all states
roadmap state get STATE-095 # Should return full state
roadmap overview            # Should render correctly
```

### Step 3: Stop Postgres Writes

```typescript
// DualWriteProxy automatically stops Postgres writes when primary = filesystem
// No action needed if dualWrite is disabled
```

### Step 4: Notify

```typescript
emitEvent('migration.rollback', {
  reason: triggerReason,
  timestamp: Date.now(),
  statesAtRisk: [], // States written to Postgres but not yet synced to files
});
```

---

## Rollback Scenarios

### Scenario A: Postgres Crash (Most Common)

```
1. Server detects Postgres connection failure
2. Config switches to filesystem primary automatically
3. All reads served from files (zero data loss)
4. Dual-write queue buffers writes for Postgres recovery
5. When Postgres recovers → sync queue → resume dual-write
```

**Recovery time:** <1 second
**Data loss:** Zero (dual-write ensured file copy)

### Scenario B: Data Corruption in Postgres

```
1. Consistency checker detects mismatch
2. Operator reviews corruption report
3. If file is authoritative → rollback to filesystem
4. Postgres table dropped and rebuilt from files
5. Resume dual-write
```

**Recovery time:** 5-15 minutes (rebuild Postgres)
**Data loss:** Zero (files are source of truth)

### Scenario C: Application Bug (State Reads Incorrect)

```
1. Bug detected in Postgres query logic
2. Immediate rollback to filesystem reads
3. Fix bug in Postgres query code
4. Test fix with shadow reads (compare results)
5. Re-enable Postgres reads when verified
```

**Recovery time:** <1 second (rollback), hours-days (fix)
**Data loss:** Zero (files unaffected)

---

## Rollback Verification Checklist

```typescript
interface RollbackVerification {
  // Data completeness
  stateCount: {
    filesystem: number;
    postgres: number;
    match: boolean;
  };
  
  // Recent states present
  recentlyModifiedStates: {
    last24h: string[];
    allPresentInFiles: boolean;
  };
  
  // Read operations working
  readTests: {
    listStates: boolean;
    getState: boolean;
    getByStatus: boolean;
    getReadyWork: boolean;
  };
  
  // Write operations working
  writeTests: {
    createState: boolean;
    updateState: boolean;
    deleteState: boolean;
  };
  
  // Git operations working
  gitTests: {
    status: boolean;
    add: boolean;
    commit: boolean;
  };
}
```

---

## State Classification for Rollback

| State Location | Risk Level | Rollback Action |
|---------------|------------|-----------------|
| Both Postgres + files | None | Switch reads to files |
| Postgres only (new state) | Low | Write to files during rollback |
| Files only | None | Normal operation |
| Neither | Critical | Data loss investigation |

### New State Safety

During dual-write phase, any state written to Postgres is also written to files. If a write to files fails:
1. Postgres write is rolled back (atomic dual-write)
2. Error returned to caller
3. State is NOT considered saved

This ensures we never have "Postgres only" states during the migration window.

---

## Rollback vs Forward Fix

| Situation | Recommendation |
|-----------|----------------|
| Postgres crash | Rollback (instant) |
| Data corruption | Rollback, rebuild Postgres |
| Performance issue | Rollback, optimize, retry |
| Minor bug | Forward fix (slower than rollback) |
| Schema migration bug | Rollback, fix schema, replay |
| Network partition | Auto-rollback with retry queue |

---

## Post-Rollback Actions

1. **Root cause analysis:** Why did rollback happen?
2. **Fix the issue:** In Postgres code, not the fallback
3. **Test thoroughly:** Unit + integration + load tests
4. **Re-attempt migration:** Start from Phase 1 (Shadow)
5. **Update rollback docs:** Add learnings

---

## Emergency Commands

```bash
# Instant rollback
roadmap config set migration.primary filesystem
roadmap config set migration.dualWrite false

# Check system state
roadmap status --migration
roadmap migration verify

# Sync any Postgres-only states to files
roadmap migration sync --direction sdb-to-files

# Rebuild Postgres from files (after fixing issue)
roadmap migration rebuild
```

---

## Metrics for Rollback Readiness

| Metric | Target | Current |
|--------|--------|---------|
| Dual-write consistency rate | >99.9% | TBD |
| File backup age | <1 min | Real-time (dual-write) |
| Rollback execution time | <1s | <1s (config change) |
| Data loss on rollback | Zero | Zero (dual-write) |

---

## Next Steps

- [ ] Implement emergency CLI commands
- [ ] Add rollback verification tests
- [ ] Document operator runbook
- [ ] AC#6: Workflow migration
