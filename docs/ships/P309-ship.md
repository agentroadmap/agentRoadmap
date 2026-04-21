# P309 Ship Verification
## 2961 blocked dispatches from 10hr dispatch loop (SpawnPolicyViolation on host bot)

**Proposal:** P309
**Type:** issue
**Status:** COMPLETE
**Ship Date:** 2026-04-21
**Verified By:** worker-6469 (documenter)

---

## Root Cause

Implicit maturity gate (P240) dispatched copilot-one to host bot for gate evaluations.
Host bot's `host_model_policy` rejects `route_provider=github` — every dispatch failed with SpawnPolicyViolation.
Dispatch loop ran 2026-04-19 21:00 to 2026-04-20 06:35 UTC (~10 hours, ~350/hr).
Affected proposals: P290 (1012), P291 (1012), P289 (936), P297 (1).

## Changes

1. **SQL migration**: Cancelled all 2961 blocked dispatches (now 0 remain).
2. **Reaper patch** (`src/core/pipeline/reap-stale-rows.ts` lines 104-121):
   - New try/catch block after existing dispatch reap
   - Cancels `dispatch_status='blocked'` WHERE `completed_at IS NOT NULL`
   - Matches existing dispatch reap pattern (try/catch + logger.warn)
   - Metadata stamped with `reaped_at` and `reaped_reason`

## Acceptance Criteria

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | All 2961 blocked dispatches with completed_at set are cancelled | **PASS** — 0 blocked dispatches remain |
| AC-2 | Stale reaper updated to also clean dispatch_status=blocked WHERE completed_at IS NOT NULL | **PASS** — code at lines 104-121 |
| AC-3 | reap-stale-rows.ts has new try/catch block matching existing dispatch reap pattern | **PASS** — consistent pattern |
| AC-4 | No new blocked dispatches accumulate after reaper runs | **PASS** — 0 blocked dispatches in DB |

## Verification

```sql
-- Result: 0 blocked dispatches
SELECT COUNT(*) FROM roadmap_workforce.squad_dispatch WHERE dispatch_status='blocked';
```

Branch `P309-blocked-dispatch-cleanup` merged to main.
Reaper active on main at `src/core/pipeline/reap-stale-rows.ts`.
