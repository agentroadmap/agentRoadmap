# P307 Architect Design Review

**Proposal:** P307 — CLI state-machine commands use hardcoded PGPASSWORD=*** literal
**Phase:** DRAFT → DESIGN (gate decision)
**Reviewer:** architect agent
**Date:** 2026-04-20

---

## 1. Bug Verification Summary

All 6 original bugs + 2 additional bugs confirmed from source code inspection.

| Bug | File:Line | Status | Severity | Evidence |
|-----|-----------|--------|----------|----------|
| B1 | state-machine.ts:88,124,140 | REAL | CRITICAL | Lines contain literal string `PGPASSWORD=*** psql...`, not `${pgPass}` interpolation |
| B2 | state-machine.ts:88,124,140 | REAL | HIGH | All 3 psql calls use `-U admin`. No admin user exists in DB. Valid: xiaomi, andy, claude |
| B3 | state-machine.ts:87,122,138 | REAL | LOW | `pgPass` declared 3 times, never referenced in any template literal |
| B4 | state-machine.ts:8 | REAL | MEDIUM | JSDoc documents `sm register` but no `.command("register")` handler registered |
| B5 | state-machine.ts:20-25 | REAL | MEDIUM | `run()` catches ALL errors and returns `""`. No stderr, no diagnostics |
| B6 | state-machine.ts:13,22 | REAL | LOW | `execSync` blocks Node event loop for up to 10s per DB call |
| B7 | pool.ts:44 | REAL | CRITICAL | `process.env.PG_PASSWORD=***` — literal `***` instead of `match[1].trim()` |
| B8 | pool.ts:168,276 | REAL | MEDIUM | Default user is `"admin"` — same non-existent user as B2, but in pool.ts (affects ALL pool consumers) |
| B9 | pool.ts:266 | REAL | HIGH | `process.env.__PG_PASSWORD_FROM_CONFIG=dbConf...ord` — corrupted assignment, should be `dbConfig.password` |

**Total: 9 bugs confirmed, 0 false positives.**

---

## 2. Root Cause Analysis

### Two-layer password bug
1. **state-machine.ts** hardcodes `PGPASSWORD=***` as a literal string instead of using the `pgPass` variable
2. **pool.ts:44** sets `PG_PASSWORD=***` (literal) when loading from .env, so even consumers using the pool get the wrong password

### Corrupted code (B9)
pool.ts line 266 is truncated: `dbConf...ord` instead of `dbConfig.password`. This was corrupted at commit time (298b307, P300). The `initPoolFromConfig()` function cannot transfer passwords from config to env — it sets a broken value.

### Wrong default user (B8)
pool.ts defaults to `user: "admin"` at lines 168 and 276. No `admin` user exists. The MCP service works because it gets `PG_USER=xiaomi` from systemd environment. CLI commands that don't set `PG_USER` hit this default and fail.

---

## 3. Design Decision: Option B (pg Pool)

**Replace all psql shell-outs with `query()` from pool.ts.**

Rationale:
- Eliminates shell-based password passing (security: no /proc exposure)
- Eliminates psql binary dependency
- Provides proper async operations
- Has its own password resolution (once B7/B9 fixed)
- Consistent with rest of codebase

---

## 4. Implementation Scope

### Files to modify

| File | Changes |
|------|---------|
| `src/infra/postgres/pool.ts:44` | Fix `***` → `match[1].trim()` |
| `src/infra/postgres/pool.ts:168` | Fix default user `"admin"` → `"xiaomi"` |
| `src/infra/postgres/pool.ts:266` | Fix corrupted `dbConf...ord` → `dbConfig.password` |
| `src/infra/postgres/pool.ts:276` | Fix default user `"admin"` → `"xiaomi"` |
| `src/apps/commands/state-machine.ts` | Replace 3 psql shell-outs with `query()`, remove 3 dead pgPass vars, remove register from help, add stderr to run() |

### Out of scope
- `execSync` for systemctl commands (start/stop/restart) — these need sudo, not DB. Keeping shell-out is correct for systemctl.
- The `run()` function remains for systemctl operations. DB operations migrate to `query()`.

---

## 5. Gap Analysis vs. Existing Plan

The existing plan (`docs/plans/2026-04-20-p307-state-machine-fixes.md`) covers B1-B7 but misses:

| Gap | Fix |
|-----|-----|
| B8: pool.ts default user "admin" | Add Task 0: Fix pool.ts user defaults at lines 168, 276 |
| B9: pool.ts line 266 corrupted | Add to Task 0: Fix corrupted assignment |
| B5 fix is cosmetic | Plan's Task 7 still returns "". For DB commands (now using query()), errors surface via try/catch with console.error. For systemctl run(), empty string is acceptable — systemctl itself prints to stderr which execSync captures in err.stderr. Plan's error reporting for run() is sufficient. |
| AC gaps | Update ACs to cover pool.ts user defaults and line 266 |

---

## 6. Revised Task Order

### Task 0: Fix pool.ts — password loader, corrupted line, user defaults (NEW)
- Line 44: `process.env.PG_PASSWORD=***` → `process.env.PG_PASSWORD=match[1].trim()`
- Line 168: `?? "admin"` → `?? "xiaomi"`
- Line 266: `dbConf...ord` → `dbConfig.password`
- Line 276: `?? "admin"` → `?? "xiaomi"`

### Tasks 1-7: As in existing plan (reordered: status, agencies, offers, dead vars, help text, run() error reporting)

---

## 7. Acceptance Criteria Review

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| AC1 | state-machine.ts uses getPool() for all DB queries | CORRECT | Core fix |
| AC2 | PGPASSWORD=*** replaced with credential resolution | DEWAIVED | Raw byte verification confirmed literal. AC is correct. |
| AC3 | Register subcommand removed from help | CORRECT | |
| AC4 | pool.ts uses match[1].trim() not literal *** | CORRECT | |
| AC5 | run() reports errors to stderr | CORRECT | For systemctl commands only. DB commands use try/catch. |
| AC6 | execSync replaced with async pool.query() | CORRECT | For DB queries only. Systemctl keeps execSync. |
| AC7 | Dead pgPass declarations removed | CORRECT | |

### Proposed new ACs

| # | Criterion |
|---|-----------|
| AC8 | pool.ts default user changed from "admin" to "xiaomi" at lines 168 and 276 |
| AC9 | pool.ts line 266 fixed: `dbConf...ord` → `dbConfig.password` |
| AC10 | No psql shell-outs remain in state-machine.ts (grep verification) |

---

## 8. Risk Assessment

**Risk: LOW**

- CLI-only code paths. No service restart needed.
- pool.ts changes affect all pool consumers, but the fix is strictly correct (was broken before).
- User default change from "admin" to "xiaomi" is safe — "admin" never worked, all working consumers already set PG_USER explicitly.
- Line 266 fix is pure bugfix — the current code doesn't work at all.

---

## 9. Gate Decision: ADVANCE to REVIEW

**Recommendation: ADVANCE**

All bugs verified from source code. Plan is sound with minor gaps (B8, B9). Revised task order addresses all 9 bugs. Low risk, CLI-only scope.

**Conditions for DEVELOP:**
1. Add Task 0 (pool.ts fixes) to implementation plan
2. Add AC8, AC9, AC10 to acceptance criteria
3. Update existing plan document with revised task order
