# Dual-Write Strategy: Files + SpacetimeDB in Parallel
**STATE-095 AC#2** | Created: 2026-03-25 15:00 UTC | Author: Carter

## Overview

During the transition from file-based to SpacetimeDB, **all writes go to both systems** to ensure zero data loss and instant rollback capability.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RoadmapServer                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐    ┌──────────────────┐                     │
│   │ WriteRouter  │───▶│ DualWriteProxy   │                     │
│   └──────────────┘    └──────────────────┘                     │
│                              │                                  │
│                    ┌─────────┴─────────┐                       │
│                    ▼                   ▼                        │
│            ┌──────────────┐    ┌──────────────┐                │
│            │ SpacetimeDB  │    │  File System │                │
│            │  (primary)   │    │  (fallback)  │                │
│            └──────────────┘    └──────────────┘                │
│                    │                   │                        │
│                    └─────────┬─────────┘                       │
│                              ▼                                  │
│                    ┌──────────────────┐                        │
│                    │  ConsistencyJob  │                        │
│                    │  (background)    │                        │
│                    └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## DualWriteProxy Implementation

### Interface

```typescript
interface DualWriteConfig {
  /** Which system is primary for reads */
  primary: 'spacetimedb' | 'filesystem';
  
  /** Enable dual writes (disable for rollback to single system) */
  dualWriteEnabled: boolean;
  
  /** Verify writes match between systems */
  verifyConsistency: boolean;
  
  /** Timeout for secondary write before marking as degraded */
  secondaryTimeoutMs: number;
  
  /** Retry failed secondary writes */
  retrySecondary: boolean;
  maxRetries: number;
}

type WriteResult = {
  success: true;
  primary: { ok: boolean; latencyMs: number };
  secondary: { ok: boolean; latencyMs: number; degraded: boolean };
  consistencyVerified: boolean;
} | {
  success: false;
  error: string;
  primaryWrite: 'spacetimedb' | 'filesystem' | 'none';
};
```

### Write Flow

```
1. Write to PRIMARY system (SpacetimeDB or filesystem)
   └─ If PRIMARY fails → ABORT, return error

2. Write to SECONDARY system (non-blocking, timeout)
   └─ If SECONDARY fails → mark degraded, log warning
   └─ If SECONDARY times out → mark degraded, queue retry

3. If verifyConsistency enabled:
   └─ Read back from both systems
   └─ Compare checksums
   └─ If mismatch → alert, attempt self-heal

4. Return WriteResult to caller
```

### Code Structure

```typescript
export class DualWriteProxy {
  constructor(
    private spacetimedb: SpacetimeDBStateStorage,
    private filesystem: FileSystem,
    private config: DualWriteConfig
  ) {}

  async saveState(state: State): Promise<WriteResult> {
    const startTime = Date.now();
    let primaryOk = false;
    let secondaryDegraded = false;

    try {
      // Step 1: Write to primary
      if (this.config.primary === 'spacetimedb') {
        await this.spacetimedb.insertState(state);
        primaryOk = true;
        
        // Step 2: Write to filesystem (best effort)
        if (this.config.dualWriteEnabled) {
          try {
            await withTimeout(
              this.filesystem.saveState(state),
              this.config.secondaryTimeoutMs
            );
          } catch (err) {
            secondaryDegraded = true;
            await this.queueRetry('filesystem', 'saveState', state);
          }
        }
      } else {
        // Filesystem is primary
        await this.filesystem.saveState(state);
        primaryOk = true;
        
        if (this.config.dualWriteEnabled) {
          try {
            await withTimeout(
              this.spacetimedb.insertState(state),
              this.config.secondaryTimeoutMs
            );
          } catch (err) {
            secondaryDegraded = true;
            await this.queueRetry('spacetimedb', 'insertState', state);
          }
        }
      }

      // Step 3: Consistency verification
      let consistencyVerified = false;
      if (this.config.verifyConsistency && !secondaryDegraded) {
        consistencyVerified = await this.verifyStateConsistency(state.id);
      }

      return {
        success: true,
        primary: { ok: true, latencyMs: Date.now() - startTime },
        secondary: { ok: !secondaryDegraded, latencyMs: 0, degraded: secondaryDegraded },
        consistencyVerified
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
        primaryWrite: primaryOk ? this.config.primary : 'none'
      };
    }
  }
}
```

---

## Read Routing

### Phase 1: SpacetimeDB Primary (Current)
```typescript
async loadState(id: string): Promise<State | null> {
  // Try SpacetimeDB first
  let state = await spacetimedb.getState(id);
  
  if (!state) {
    // Fallback to filesystem
    state = await filesystem.loadState(id);
    
    if (state) {
      // Backfill SpacetimeDB
      await spacetimedb.insertState(state);
    }
  }
  
  return state;
}
```

### Phase 2: Filesystem Primary (Transition)
```typescript
async loadState(id: string): Promise<State | null> {
  // Try filesystem first
  let state = await filesystem.loadState(id);
  
  if (!state) {
    // Fallback to SpacetimeDB
    state = await spacetimedb.getState(id);
  }
  
  return state;
}
```

### Phase 3: SpacetimeDB Only (Migration Complete)
```typescript
async loadState(id: string): Promise<State | null> {
  return await spacetimedb.getState(id);
}
```

---

## Consistency Verification

### Background Job

```typescript
class ConsistencyChecker {
  private intervalMs = 300_000; // 5 minutes
  
  async runConsistencyCheck(): Promise<ConsistencyReport> {
    const sdbStates = await spacetimedb.getAllStates();
    const fileStates = await filesystem.loadAllStates();
    
    const report: ConsistencyReport = {
      timestamp: new Date(),
      sdbCount: sdbStates.length,
      fileCount: fileStates.length,
      mismatches: [],
      missingInFile: [],
      missingInSdb: [],
    };
    
    // Build lookup maps
    const sdbMap = new Map(sdbStates.map(s => [s.id, s]));
    const fileMap = new Map(fileStates.map(s => [s.id, s]));
    
    // Check for mismatches
    for (const [id, sdbState] of sdbMap) {
      const fileState = fileMap.get(id);
      if (!fileState) {
        report.missingInFile.push(id);
      } else if (computeChecksum(sdbState) !== computeChecksum(fileState)) {
        report.mismatches.push({
          id,
          sdbChecksum: computeChecksum(sdbState),
          fileChecksum: computeChecksum(fileState),
          sdbUpdated: sdbState.updated_date,
          fileUpdated: fileState.updated_date
        });
      }
    }
    
    // Check for states only in files
    for (const [id] of fileMap) {
      if (!sdbMap.has(id)) {
        report.missingInSdb.push(id);
      }
    }
    
    return report;
  }
}
```

### Self-Healing Rules

| Condition | Action |
|-----------|--------|
| Missing in file only | Write state to file |
| Missing in SDB only | Insert state to SDB |
| Mismatch, SDB newer | Overwrite file with SDB |
| Mismatch, file newer | Overwrite SDB with file |
| Mismatch, same timestamp | Alert for manual review |

---

## Degraded Mode Handling

When secondary system is unavailable:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Secondary timeout | 3 consecutive | Switch to single-write mode |
| Secondary error rate | >20% in 5 min | Switch to single-write mode |
| Primary failure | Any | Abort, alert operators |

### Degraded Mode Recovery

```typescript
async recoverDegradedMode(): Promise<void> {
  // 1. Verify primary is healthy
  const primaryOk = await this.checkPrimaryHealth();
  if (!primaryOk) throw new Error('Primary system unhealthy');
  
  // 2. Sync all recent writes to secondary
  const recentWrites = await this.getRecentWrites(this.degradedSince);
  for (const write of recentWrites) {
    await this.writeToSecondary(write);
  }
  
  // 3. Run consistency check
  const report = await this.consistencyChecker.runConsistencyCheck();
  if (report.mismatches.length > 0) {
    await this.resolveMismatches(report.mismatches);
  }
  
  // 4. Re-enable dual-write
  this.config.dualWriteEnabled = true;
  this.degradedSince = null;
}
```

---

## Rollback Strategy Preview (AC#4)

Rollback is a configuration change, not a data operation:

```typescript
// Rollback to filesystem-only (instant, no data migration)
server.config.dualWrite.primary = 'filesystem';
server.config.dualWrite.dualWriteEnabled = false;

// Reason: SpacetimeDB stability issues
// Impact: No data loss (filesystem always has a copy)
// Recovery time: <1 second (config reload)
```

---

## Migration Phases

| Phase | Primary | Dual-Write | Duration | Exit Criteria |
|-------|---------|------------|----------|---------------|
| 0: Baseline | Filesystem | Off | - | SpacetimeDB tables verified |
| 1: Shadow | Filesystem | SDB only | 1 week | Zero SDB write failures |
| 2: Dual | SpacetimeDB | On | 2 weeks | 99.9% consistency rate |
| 3: Primary | SpacetimeDB | File fallback | 1 week | Zero data loss |
| 4: Complete | SpacetimeDB | Off | - | Filesystem deprecated |

---

## Monitoring & Metrics

```typescript
interface DualWriteMetrics {
  // Latency
  primaryWriteLatency: Histogram;
  secondaryWriteLatency: Histogram;
  
  // Reliability
  primaryFailures: Counter;
  secondaryFailures: Counter;
  consistencyViolations: Counter;
  
  // State
  degradedModeActive: Gauge;
  queueDepth: Gauge;
  lastConsistencyCheck: Timestamp;
}
```

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `dual_write_degraded` | Secondary unavailable >5min | Warning |
| `consistency_violation` | Checksum mismatch detected | Critical |
| `primary_failure` | Primary write failed | Critical |
| `data_loss_detected` | State missing in both systems | Emergency |

---

## Next Steps

- [ ] Implement DualWriteProxy class
- [ ] Add consistency checker background job
- [ ] Wire into RoadmapServer initialization
- [ ] Phase 1 (shadow mode) rollout
