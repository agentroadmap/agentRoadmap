# Pillar Research: P190 — Pipeline Health Monitor Anomaly Detection

**Agent**: worker-8918 (pillar-researcher)
**Date**: 2026-04-21
**Phase**: ship

---

## Executive Summary

P190 addresses a critical observability gap: the gate pipeline was stuck in a retry loop for 2+ hours undetected. **The HealthMonitor implementation is complete (430 lines) and SQL-verified, but it is NOT integrated into the orchestrator.** The anomaly detection code is dormant — it will not run until wired into the orchestrator entry point.

---

## What P190 Required

| # | Requirement | Threshold |
|---|-------------|-----------|
| 1 | Repeated failure detection | Same transition fails 3x |
| 2 | System-wide stall detection | ALL transitions fail for 10 min |
| 3 | Queue depth monitoring | Queue grows without completion growth |
| 4 | Agent spawn failure tracking | >50% failure rate over 15 min |
| 5 | Discord notification | Alerts in home channel feed |

---

## What Was Built

### `src/core/pipeline/health-monitor.ts` (430 lines)

`HealthMonitor` class — periodic timer (60s default) running 4 checks in parallel:

| Check | Query Target | Condition | Alert Level |
|-------|-------------|-----------|-------------|
| Repeated failure | `transition_queue` | `attempt_count >= 3`, pending, has error | warning |
| System stall | `transition_queue` | All recent completions are failures + pending stuck | CRITICAL |
| Queue depth | `transition_queue` | Pending +5 with <2 completions over 5+ snapshots | warning |
| Spawn failure | `squad_dispatch` | >50% `dispatch_status = 'failed'` in 15 min | CRITICAL |

Alert channels:
- Discord via `discordSend()` → `pg_notify('discord_send')` → discord-bridge
- `notification_queue` table for persistent audit trail
- 10-minute cooldown per alert type prevents storms

### Documentation

`docs/features/P190-health-monitor-anomaly-detection.md` — comprehensive feature doc (128 lines), written by documenter (worker-8859).

---

## SQL Verification

Verified all column assumptions against actual DDL:

### `roadmap.transition_queue` — ALL COLUMNS EXIST

| Column Used | Exists | Type |
|-------------|--------|------|
| `id` | ✅ | bigint |
| `proposal_id` | ✅ | bigint |
| `from_stage` | ✅ | text |
| `to_stage` | ✅ | text |
| `status` | ✅ | text |
| `attempt_count` | ✅ | integer |
| `max_attempts` | ✅ | integer |
| `processing_at` | ✅ | timestamptz |
| `completed_at` | ✅ | timestamptz |
| `last_error` | ✅ | text |

### `roadmap_workforce.squad_dispatch` — ALL COLUMNS EXIST

| Column Used | Exists | Type |
|-------------|--------|------|
| `dispatch_status` | ✅ | text |
| `created_at` | ✅ | timestamptz |

### `discordSend()` — EXISTS

`src/infra/discord/notify.ts` — publishes to `pg_notify('discord_send')`, picked up by discord-bridge.

---

## Integration Status: NOT WIRED

Grep confirms `HealthMonitor` is referenced ONLY in its own file. No import found in:

- `src/core/orchestration/orchestrator.ts`
- `scripts/orchestrator.ts`
- `scripts/orchestrator-dynamic.ts`
- `scripts/orchestrator-refined.ts`
- `scripts/orchestrator-unlimited.ts`
- `scripts/orchestrator-with-skeptic.ts`

**The class is defined but never instantiated or started.**

Required integration pattern:
```
import { HealthMonitor } from "../core/pipeline/health-monitor.ts";
const monitor = new HealthMonitor();
monitor.start();
// ... on SIGTERM/SIGINT: monitor.stop();
```

---

## AC Assessment

No acceptance criteria were formally registered in `proposal_acceptance_criteria`. Assessing against the 5 requirements in the proposal summary:

| Criterion | Implementation | Status |
|-----------|---------------|--------|
| Repeated failure detection | `checkRepeatedFailures()` — queries `transition_queue` | ✅ IMPLEMENTED |
| System-wide stall detection | `checkSystemStall()` — window-based all-fail check | ✅ IMPLEMENTED |
| Queue depth monitoring | `checkQueueDepth()` — trend over 5+ snapshots | ✅ IMPLEMENTED |
| Agent spawn failure tracking | `checkSpawnFailureRate()` — `squad_dispatch` query | ✅ IMPLEMENTED |
| Discord notification | `discordSend()` + `notification_queue` | ✅ IMPLEMENTED |
| **Integrated into orchestrator** | **NOT DONE** | ❌ GAP |
| **Tests** | **NOT DONE** | ❌ GAP |

---

## Code Quality Assessment

Strengths:
- Clean separation of concerns — 4 independent checks run in parallel
- Error isolation — Discord/DB failures don't crash the monitor
- Alert cooldown prevents storm (10 min per alert type)
- Bounded history for queue depth (30 snapshots max)
- Zero LLM cost — pure SQL queries
- Dependency injection via `HealthMonitorDeps` — testable

No issues found in the SQL queries or TypeScript types.

---

## Verdict

**IMPLEMENTATION COMPLETE, INTEGRATION PENDING**

The HealthMonitor code is well-structured, SQL-verified, and ready for integration. All 5 anomaly detection requirements are implemented. The only gap is wiring it into the orchestrator entry point.

---

## Recommendations

### 1. Wire HealthMonitor into orchestrator (blocking)
Import, instantiate, and start HealthMonitor in `scripts/orchestrator.ts`. Add graceful shutdown on SIGTERM/SIGINT. Estimated: 10 lines of code.

### 2. Add integration test (recommended)
Create `tests/integration/health-monitor.test.ts` with:
- Mock query function returning synthetic failure data
- Verify alert calls made for each threshold breach
- Verify cooldown prevents duplicate alerts

### 3. End-to-end Discord alert verification (recommended)
After integration, manually trigger a repeated failure and verify the alert appears in the Discord home channel.

### 4. Register formal AC (optional)
The proposal has no acceptance criteria in `proposal_acceptance_criteria`. The 5 requirements are well-documented in the summary, but formal AC registration would improve gate traceability.

---

*Generated by worker-8918 (pillar-researcher) — P190 ship phase*
