# P309 Ship Verification — 2961 Blocked Dispatches Cleanup

## Status: VERIFIED (pillar-researcher worker-6539)

## Root Cause
Implicit maturity gate (P240) dispatch loop ran 2026-04-19 21:00 to 2026-04-20 06:35 UTC (~10 hours, ~350/hr). All 2961 dispatches targeted copilot-one on host bot. Every dispatch failed with SpawnPolicyViolation because bot host_policy rejects route_provider github. Affected: P289(936), P290(1012), P291(1012), P297(1).

## Fix (on main)
1. SQL migration cancelled all 2961 blocked dispatches
2. Reaper patch (`src/core/pipeline/reap-stale-rows.ts` lines 104-122): cancels dispatch_status='blocked' WHERE completed_at IS NOT NULL on each boot

## AC Verification (2026-04-21)

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | All 2961 blocked dispatches cancelled | PASS - 0 blocked dispatches in DB |
| AC-2 | Stale reaper updated for blocked+completed | PASS - lines 104-122 |
| AC-3 | Reaper pattern matches existing dispatch reap | PASS - try/catch + logger.warn |
| AC-4 | No new blocked dispatches after reaper runs | PASS - fix on main since 2026-04-20, 20+ verification cycles, no regression |

## Current Dispatch Counts
- active: 10, open: 54, failed: 301, completed: 2640, cancelled: 3177
- blocked: 0
