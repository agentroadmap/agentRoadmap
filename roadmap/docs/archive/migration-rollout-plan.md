# Phased Rollout Plan with Success Metrics
**STATE-095 AC#7** | Created: 2026-03-25 15:24 UTC | Author: Carter

## Overview

4-week rollout from file-based to SpacetimeDB-primary architecture, with measurable success criteria at each phase.

```
Week 1          Week 2          Week 3          Week 4
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│   PHASE 1  │  │   PHASE 2  │  │   PHASE 3  │  │   PHASE 4  │
│   STABILIZE│─▶│   EXPAND   │─▶│     FLIP   │─▶│   CUTOVER  │
│            │  │            │  │            │  │            │
│ SDB Verify │  │ Dual-Write │  │ SDB Primary│  │ File Deprec│
└────────────┘  └────────────┘  └────────────┘  └────────────┘
   Read-only       Shadow         Primary        File Fallback
   + Verify        + Expand       + File Fallback Removed
```

---

## Phase 1: STABILIZE (Week 1)

**Goal:** Verify SpacetimeDB is reliable for all read operations.

| Day | Action | Owner |
|-----|--------|-------|
| 1-2 | Run consistency checks (5min interval) | System |
| 3 | Load test: 1000 concurrent reads | Carter |
| 4 | Verify all 100 states present + checksums match | Carter |
| 5 | Shadow reads: compare SDB vs file results | System |
| 6-7 | Fix any discrepancies, document findings | Carter |

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| State count match | 100% | `states.count() === filesystem.count()` |
| Checksum match | 100% | All state checksums identical |
| Read latency (p95) | <50ms | Histogram query |
| Read errors | 0 | Error counter |
| Consistency violations | 0 | Consistency checker |

### Exit Criteria
- [ ] 7 consecutive days with 0 consistency violations
- [ ] Read latency p95 <50ms
- [ ] All 100 states verified

### Rollback Trigger
- Any consistency violation >1%
- Read errors >0.1% of requests
- SpacetimeDB crash/restart loop

---

## Phase 2: EXPAND (Week 2)

**Goal:** Enable dual-write, migrate workflow components.

| Day | Action | Owner |
|-----|--------|-------|
| 1 | Enable dual-write for state edits | Carter |
| 2 | Deploy claims table + reducers | Carter |
| 3 | Deploy transition reducers | Carter |
| 4 | Migrate messaging to SDB (already done) | System |
| 5 | Deploy merge reducers | Carter |
| 6 | Add MCP tools for SDB operations | Carter |
| 7 | Verify all write paths working | Carter |

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Dual-write consistency | >99.9% | Consistency checker |
| Write latency (p95) | <100ms | Histogram query |
| Secondary write failures | <0.1% | Error counter |
| Degraded mode triggers | 0 | Degraded counter |
| Claim operations working | 100% | Integration tests |
| Transition validation | 100% | Integration tests |

### Exit Criteria
- [ ] Dual-write consistency >99.9% for 7 days
- [ ] All workflow reducers passing integration tests
- [ ] Zero degraded mode triggers

### Rollback Trigger
- Dual-write consistency <99% for >1 hour
- Any data loss (state in SDB but not in files)
- Workflow reducer failures >1%

---

## Phase 3: FLIP (Week 3)

**Goal:** SpacetimeDB becomes primary for reads, files become fallback.

| Day | Action | Owner |
|-----|--------|-------|
| 1 | Switch read primary to SpacetimeDB | Carter |
| 2 | Enable backfill: missing states auto-synced to files | System |
| 3 | Board UI subscription to SDB | Carter |
| 4 | MCP state tools via SDB | Carter |
| 5 | Cron jobs recreated (pub/sub model) | Carter |
| 6 | Monitor all operations via SDB | System |
| 7 | Performance optimization pass | Carter |

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Read primary: SDB | 100% of reads | Read routing logs |
| File fallback hits | <1% | Fallback counter |
| Board UI latency | <100ms | UI load time |
| Cron job execution | 100% success | Cron logs |
| MCP tool latency | <200ms | MCP metrics |
| Agent claiming | 100% | Integration tests |

### Exit Criteria
- [ ] File fallback hits <1% for 7 days
- [ ] Board UI rendering correctly from SDB
- [ ] All cron jobs migrated and running
- [ ] MCP tools working via SDB

### Rollback Trigger
- Fallback hits >5% (SDB not serving most reads)
- Board UI rendering incorrectly
- Cron job failures >5%

---

## Phase 4: CUTOVER (Week 4)

**Goal:** Filesystem becomes archival only, SpacetimeDB is source of truth.

| Day | Action | Owner |
|-----|--------|-------|
| 1 | Archive all state files to `roadmap/archive/` | Carter |
| 2 | Remove file-based write paths | Carter |
| 3 | Disable dual-write (SDB-only writes) | Carter |
| 4 | Clean up file-based claim locks | Carter |
| 5 | Update CLI to SDB-only mode | Carter |
| 6 | Final consistency verification | System |
| 7 | Document completion, celebrate 🎉 | Carter |

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| SDB-only writes | 100% | Write routing logs |
| File write attempts | 0 | Error counter |
| State count maintained | 100 | `states.count()` |
| Zero data loss | Verified | Consistency check |
| CLI operations | 100% | Integration tests |
| All cron jobs | Running | Cron status |

### Exit Criteria
- [ ] 100% writes to SDB
- [ ] Zero file-based write attempts
- [ ] All states accounted for
- [ ] CLI fully functional

### Rollback Trigger (Final)
- Data loss detected
- Critical workflow failure
- SpacetimeDB unavailable >1 hour

---

## Success Metrics Dashboard

### Real-Time Metrics

```typescript
interface MigrationMetrics {
  // Data integrity
  stateCount: { sdb: number; files: number; match: boolean };
  consistencyRate: number;           // % of matching checksums
  lastConsistencyCheck: Date;
  
  // Performance
  readLatency: { p50: number; p95: number; p99: number };
  writeLatency: { p50: number; p95: number; p99: number };
  
  // Reliability
  readErrors: number;
  writeErrors: number;
  degradedModeActive: boolean;
  fallbackHits: number;
  
  // Workflows
  activeClaims: number;
  transitionsToday: number;
  mergeConflicts: number;
  
  // Phase progress
  currentPhase: 1 | 2 | 3 | 4;
  phaseStartDate: Date;
  phaseExitCriteria: { met: number; total: number };
}
```

### Daily Report Template

```
📊 Migration Status - Day X of Phase Y

Data Integrity: ✅ 100% (100/100 states matched)
Performance: ✅ p95 read=32ms, write=89ms
Reliability: ✅ 0 errors, 0 degraded mode
Workflows: ✅ 3 claims active, 12 transitions today

Phase Y Exit Criteria: 5/7 met
- [x] Consistency >99.9%
- [x] Latency <100ms
- [ ] Zero fallback hits (6/7 days)
- [x] All tests passing
- [ ] Board UI verified
- [ ] Cron jobs migrated
- [ ] MCP tools working

Rollback Readiness: ✅ Config change <1s
```

---

## Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SDB data corruption | Low | Critical | Dual-write, checksums, instant rollback |
| Performance regression | Medium | High | Load testing, phased rollout |
| Merge conflicts during migration | Medium | Low | Migration window, freeze non-essential changes |
| Agent confusion (two systems) | Low | Medium | Clear documentation, CLI warnings |
| Cron job failures | Medium | High | Test in Phase 3, monitor closely |

---

## Communication Plan

| Phase | Stakeholders | Communication |
|-------|--------------|---------------|
| Phase 1 | Internal (agents) | Daily status in #migration |
| Phase 2 | Internal | Daily status + blockers |
| Phase 3 | All users | Announcement + testing request |
| Phase 4 | All users | Completion announcement |

---

## Rollback Decision Tree

```
Issue Detected
     │
     ▼
┌─────────────────┐     Yes     ┌──────────────┐
│ Data loss?      │────────────▶│ INSTANT      │
└─────────────────┘             │ ROLLBACK     │
         │ No                   └──────────────┘
         ▼
┌─────────────────┐     Yes     ┌──────────────┐
│ SDB unavailable?│────────────▶│ ROLLBACK     │
└─────────────────┘             │ (config)     │
         │ No                   └──────────────┘
         ▼
┌─────────────────┐     Yes     ┌──────────────┐
│ Performance     │────────────▶│ INVESTIGATE  │
│ degraded?       │             │ 1h timeout   │
└─────────────────┘             └──────────────┘
         │ No                          │
         ▼                        ┌────▼─────┐
┌─────────────────┐               │ Still bad?│
│ Consistency     │──────────────▶│ Yes→Rollbk│
│ violation?      │               └──────────┘
└─────────────────┘
```

---

## Checklist: AC#7 Complete

- [x] 4-phase plan defined (Stabilize → Expand → Flip → Cutover)
- [x] 4-week timeline with daily actions
- [x] Success metrics per phase (quantitative)
- [x] Exit criteria per phase
- [x] Rollback triggers per phase
- [x] Risk matrix
- [x] Communication plan
- [x] Real-time metrics dashboard spec
- [x] Rollback decision tree

---

## STATE-095 Summary

All 7 Acceptance Criteria complete:

| AC | Status | Document |
|----|--------|----------|
| #1 Audit file ops | ✅ | migration-audit-file-ops.md |
| #2 Dual-write strategy | ✅ | migration-dual-write-strategy.md |
| #3 Field mapping | ✅ | migration-field-mapping.md |
| #4 Rollback strategy | ✅ | migration-rollback-strategy.md |
| #5 Security review | ✅ | migration-security-review.md |
| #6 Workflow migration | ✅ | migration-workflow-mapping.md |
| #7 Phased rollout plan | ✅ | migration-rollout-plan.md |

**STATE-095: Full Platform Migration Strategy — READY FOR EXECUTION**
