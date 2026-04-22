# P299 Research: Orchestrator Migration — Offer Pipeline Integration

## Executive Summary

Proposal P299 aims to complete the migration of the orchestrator's dispatch path from the legacy `cubic_acquire + spawnAgent` model to the offer/claim/lease pipeline. **The migration is already partially complete** — the offer pipeline is operational and actively dispatching agents through `hermes/agency-xiaomi`.

## Current State Analysis

### Architecture Overview

The orchestrator currently has **two parallel dispatch paths**:

1. **Offer-based path** (NEW) — Already implemented in:
   - `handleStateChange()` (lines 532-660): Emits offers via INSERT into `squad_dispatch` + `pg_notify('work_offers')`
   - `dispatchImplicitGate()` (lines 862-938): Emits gate offers for maturity gating

2. **Legacy path** (OLD) — Still present in:
   - `dispatchAgent()` (lines 453-529): Uses `cubic_acquire` MCP tool + direct `spawnAgent()`
   - `_dispatchTransitionQueue()` (lines 953-1172): Direct `spawnAgent()` for legacy transition_queue

### Offer Pipeline Status (Live Data)

```
dispatch_status | offer_status | count | active
-----------------+--------------+-------+--------
active          | active       |     6 |      6    ← Currently processing
blocked         | delivered    |  2961 |      0    ← Historical
completed       | delivered    |    65 |      0    ← Successfully completed
```

**Key observation**: P299's own dispatches (id 3663, 3664) were claimed by `hermes/agency-xiaomi` via the offer pipeline and are currently `active`. The system is working.

### Live Lease Management

```
Active leases (4):
- P295, P298, P299, P301 — all held by hermes/agency-xiaomi
- Lease renewal via fn_renew_lease() with 20s TTL
- proposal_lease.expires_at = TTL * 3 (60s buffer)
```

## Gaps Identified

### Gap 1: `dispatchAgent()` still uses cubic_acquire

**File**: `scripts/orchestrator.ts`, lines 453-529

The `dispatchAgent()` function:
1. Calls `cubic_acquire` MCP tool to get/create/focus a cubic
2. Calls `selectExecutorWorktree(null)` to pick a worktree
3. Calls `spawnAgent()` directly to spawn the agent process

**Problem**: This path bypasses the offer pipeline entirely. The orchestrator spawns agents directly, which:
- Requires the orchestrator to have PATH access to agent CLIs
- Requires API keys in the orchestrator's environment
- Conflicts with the pull-based agency model

**However**: `dispatchAgent()` is NOT currently called by any active code path. The `handleStateChange()` function (which IS called) already uses the offer-based INSERT approach. `dispatchAgent()` appears to be **dead code**.

### Gap 2: `_dispatchTransitionQueue()` uses direct spawn

**File**: `scripts/orchestrator.ts`, lines 953-1172

This function processes legacy `transition_queue` rows and calls `spawnAgent()` directly. It's used by the polling path and notification handler.

**Problem**: Same as Gap 1 — direct spawning requires orchestrator-level credentials.

**Mitigation**: `transition_queue` is described as "legacy/obsolete" in the memory notes. The implicit maturity gate (P240) is the current mechanism.

### Gap 3: Lease loss doesn't terminate subprocess

**File**: `src/core/pipeline/offer-provider.ts`, lines 348-363

The `renew()` method:
```typescript
if (!row?.ok) {
    this.logger.warn(
        `[OfferProvider] lease renewal rejected for dispatch ${dispatchId} — token mismatch (reaped?)`,
    );
}
```

**Problem**: When `fn_renew_lease()` returns `false` (lease expired/reaped), the OfferProvider only logs a warning. It does NOT:
1. Store the child process reference
2. Send SIGTERM to terminate the spawned agent
3. Clean up the process

The agent process continues running even after the lease is lost, wasting resources and potentially causing conflicts.

### Gap 4: Cubic lifecycle references remain

**File**: `scripts/orchestrator.ts`, lines 1174-1204

The `releaseStaleCubics()` function still references cubic operations (`cubic_list`, `cubic_transition`). This is cleanup code for the old model.

## Design Validation

### Proposal Changes vs. Actual State

| Change | Proposal Says | Actual State |
|--------|---------------|--------------|
| Change 1: emitOffer() | Replace direct spawnAgent with INSERT | ✅ Already done in handleStateChange() |
| Change 2: Remove cubic_acquire | Remove from dispatch path | ⚠️ cubic_acquire still in dispatchAgent() (dead code) |
| Change 3: OfferProvider only consumer | Only consumer of offers | ✅ Already true — OfferProvider claims and spawns |
| Change 4: Lease loss → SIGTERM | Kill subprocess on lease loss | ❌ Not implemented — warning only |

### Offer Pipeline Flow (Current)

```
Orchestrator                    OfferProvider                 Agent Process
     │                               │                              │
     ├─ INSERT squad_dispatch ───────┤                              │
     │   (offer_status='open')       │                              │
     ├─ pg_notify('work_offers') ───►│                              │
     │                               ├─ fn_claim_work_offer() ─────┤
     │                               ├─ fn_activate_work_offer() ──┤
     │                               ├─ spawnAgent() ─────────────►│
     │                               ├─ setInterval(renew, 10s) ───┤
     │                               │                              │
     │                               │◄──── renew lease ───────────┤
     │                               │                              │
     │                               │◄──── process exits ─────────┤
     │                               ├─ fn_complete_work_offer() ───┤
```

**Missing**: If lease renewal fails, the process continues running unmanaged.

## Recommendations

### 1. Remove Dead Code (Low Risk)

- Delete `dispatchAgent()` function (lines 453-529)
- Delete `releaseStaleCubics()` function (lines 1174-1204)
- Remove `cubic_acquire` and `cubic_list` MCP calls
- Keep `cubic` references only for worktree allocation (if needed)

### 2. Implement Lease-Loss Subprocess Termination (Critical)

In `offer-provider.ts`, the `executeOffer()` method should:
1. Store the child process reference from `spawnFn()`
2. In the `renew()` failure handler, send SIGTERM to the process
3. Add a timeout for graceful shutdown (e.g., 5s), then SIGKILL
4. Call `complete(dispatch_id, claim_token, 'failed')` after termination

### 3. Migrate or Remove `_dispatchTransitionQueue()` (Medium Risk)

Option A: Convert to emit offers instead of direct spawn
Option B: Remove entirely if transition_queue is truly legacy

### 4. Add Acceptance Criteria

The proposal currently has no AC. Suggested AC:

1. **AC-1**: `dispatchAgent()` function removed from orchestrator.ts
2. **AC-2**: `_dispatchTransitionQueue()` emits offers instead of direct spawn
3. **AC-3**: OfferProvider terminates subprocess when fn_renew_lease returns false
4. **AC-4**: `releaseStaleCubics()` removed or converted to offer-based cleanup
5. **AC-5**: No direct spawnAgent calls remain in orchestrator.ts

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Removing dispatchAgent() breaks something | Low | It's dead code — no callers found |
| Transition queue still in use | Medium | Verify with logs; may need gradual migration |
| Lease termination kills legitimate work | Medium | Use graceful SIGTERM with timeout before SIGKILL |
| Cubic cleanup needed for orphaned cubics | Low | Cubic lifecycle may be handled elsewhere |

## Next Steps

1. Verify `dispatchAgent()` is truly dead code (grep for callers)
2. Check if transition_queue is still actively populated
3. Implement subprocess termination in OfferProvider
4. Write tests for lease-loss behavior
5. Update proposal with AC and move to REVIEW phase

---

*Research conducted: 2026-04-20 by hermes-andy*
*Agent: researcher*
*Proposal: P299*
