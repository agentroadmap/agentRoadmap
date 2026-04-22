# P309 Design Review — Stale Blocked Dispatches Cleanup

**Reviewer:** hermes (architect)
**Date:** 2026-04-20
**Verdict:** APPROVE with fixes

---

## Coherence — PASS

Problem is well-scoped and verified:
- 2961 squad_dispatch rows with dispatch_status='blocked' from pre-P281 era
- All share the same error: SpawnPolicyViolation from "bot" host trying github provider
- 85% of dispatch history is dead data
- Root cause is clear: P269 stale reaper filters WHERE completed_at IS NULL, blocked rows have completed_at set

## Architecture — PASS

Two-part design is appropriately minimal:
1. One-time SQL migration to cancel existing blocked dispatches
2. reap-stale-rows.ts update to prevent recurrence

No new tables, functions, or infrastructure. Correct approach for a data hygiene issue.

## Risk Assessment — LOW

- Migration is a simple UPDATE with metadata tagging
- All 2961 rows have completed_at set (already terminal state)
- No active leases reference these dispatches
- Reap update is additive — does not modify existing reap logic
- Idempotent: re-running the UPDATE is safe (0 rows affected after first run)

## Issues Found

### 1. SQL Syntax Bug (BLOCKER)

The proposal summary uses double quotes for string literals:
```sql
UPDATE squad_dispatch SET dispatch_status="cancelled" WHERE dispatch_status="blocked"
```

This is invalid PostgreSQL — double quotes are for identifiers, single quotes for strings.
The design doc (`docs/design/P309-stale-blocked-dispatches-cleanup.md`) correctly uses single quotes.
Fix: Update proposal summary to match the design doc.

### 2. Migration Path Mismatch (MINOR)

Design doc says: `database/ddl/` (new migration)
Actual migrations live in: `scripts/migrations/`
Next migration number: 043

### 3. Missing Unit Tests (MODERATE)

`reapStaleRows()` has zero test coverage. The design mentions verifying in pipeline-cron.test.ts
but no tests exist for this function. Should add at least one test for the new reap block.

### 4. Reap Insertion Point (MINOR)

Design says "after existing dispatch reap" (lines 84-102). Insert at line 103, before the
sequence realignment block (line 104).

## Acceptance Criteria

AC1: SQL migration exists as scripts/migrations/043-p309-blocked-dispatch-cleanup.sql
AC2: Migration cancels all blocked dispatches (WHERE dispatch_status = 'blocked')
AC3: Post-migration: SELECT COUNT(*) FROM roadmap_workforce.squad_dispatch WHERE dispatch_status='blocked' returns 0
AC4: Cancelled rows have metadata tagged with P309 cleanup reason
AC5: reap-stale-rows.ts has new reap block that cancels blocked dispatches WHERE completed_at IS NOT NULL
AC6: New reap block is idempotent and accumulates into existing dispatches counter
AC7: Unit test covers the new reap block in tests/unit/pipeline-cron.test.ts or tests/unit/reap-stale-rows.test.ts
AC8: No regressions — existing reap logic for active/assigned dispatches unchanged
