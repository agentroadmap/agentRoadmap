# P307 Research: CLI state-machine commands use hardcoded PGPASSWORD=*** literal

**Researcher:** worker-4674
**Date:** 2026-04-20
**Phase:** DRAFT (design)

---

## Executive Summary

All 6 reported bugs in `src/apps/commands/state-machine.ts` are **confirmed real**. The root cause is a two-layer credential problem: (1) state-machine.ts shells out to psql with hardcoded sentinel values, and (2) the .env file contains `PG_PASSWORD=***` as a sentinel that pool.ts loads verbatim in CLI contexts.

---

## Bug Verification (Source Code Analysis)

### B1: PGPASSWORD=*** literal — CONFIRMED (two-layer root cause)

**Lines 88, 124, 140** all contain the literal string `PGPASSWORD=***` inside template literals:
```
const psql = `PGPASSWORD=*** psql -h 127.0.0.1 -U admin -d agenthive -t -c`;
```

The `pgPass` variable (lines 87, 122, 138) reads `process.env.PG_PASSWORD || ""` but is **never interpolated** into the command string.

**Layer 2 — pool.ts sentinel loading (line 44):**
The IIFE in pool.ts loads `.env` which contains `PG_PASSWORD=***` as a sentinel. The regex captures `***` and assigns it verbatim:
```typescript
process.env.PG_PASSWORD = match[1]; // match[1] = "***"
```

This means even if `pgPass` were interpolated, it would resolve to `***`.

**Why MCP server works:** The systemd service sources `/etc/agentroadmap/env` (via `EnvironmentFile=`), which contains the real password. The CLI runs in user shell context — no systemd env.

### B2: Wrong DB username — CONFIRMED

All 3 psql calls use `-U admin`. Verified from service startup script:
```bash
export PGUSER="${PGUSER:-admin}"
```
The `/etc/agentroadmap/env` file (sourced by systemd) overrides this. CLI context has no override.

**Valid DB users:** xiaomi, andy, claude (from .env: `XIAOMI_PG_USER=xiaomi`, `ANDY_PG_USER=andy`, `CLAUDE_PG_USER`).

**Also in pool.ts line 168:** Default user is `"admin"` — same bug, masked in MCP context by PGUSER env from systemd.

### B3: Dead pgPass variable — CONFIRMED

`pgPass` declared at lines 87, 122, 138. Never used in any command string. All three psql commands use the literal `***` instead.

### B4: Missing register subcommand — CONFIRMED

Line 8 documents `roadmap state-machine register` in help text. No `.command("register")` handler exists in the sm chain (lines 39-150). The registered commands are: start, stop, restart, status, agencies, offers.

### B5: Silent failures — CONFIRMED

The `run()` function (lines 20-25):
```typescript
function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 10_000 }).trim();
  } catch {
    return "";
  }
}
```
Catches ALL errors and returns empty string. No stderr, no error code, no diagnostics. The MCP handlers file (`state-machine-handlers.ts`) has a slightly better version that captures `e.stderr` — but the CLI version swallows everything.

### B6: execSync blocks event loop — CONFIRMED

All DB queries use `execSync` with 10s timeout. This blocks the Node.js event loop for the entire duration. The MCP handlers use `async query()` from pool.ts — non-blocking.

---

## Reference Implementation

`src/apps/mcp-server/tools/workforce/state-machine-handlers.ts` is the correct pattern:
- Imports `query` from `../../../../infra/postgres/pool.ts`
- Uses `await query(sql, params)` — async, no shell-out
- No PGPASSWORD, no username, no psql binary dependency

---

## Pool.ts Sentinel Issue (Deeper Analysis)

```
.env:     PG_PASSWORD=***        ← sentinel, not real password
pool.ts:  process.env.PG_PASSWORD = "***"  ← loads sentinel verbatim
systemd:  EnvironmentFile=/etc/agentroadmap/env  ← real password
```

The pool.ts IIFE at line 30-52 has a guard: `if (process.env.PG_PASSWORD) return;`. So if the user pre-exports the real password, pool.ts won't overwrite it. But the CLI code never uses pool.ts — it shells out to psql with the literal `***`.

**The `.env` sentinel is intentional** — it prevents the real password from being committed. But state-machine.ts was written to use the sentinel directly instead of the pool abstraction.

---

## Additional Findings

1. **pool.ts line 168 also defaults to `user: "admin"`** — same bug as B2, masked in MCP context by PGUSER from systemd env. If any other CLI code uses pool.ts without PGUSER set, it would connect as `admin` (which doesn't exist).

2. **The `run()` function is duplicated** — identical in both state-machine.ts and state-machine-handlers.ts. The handlers version is marginally better (captures stderr) but both use execSync.

3. **No `sm register` handler exists anywhere** — not just missing from state-machine.ts, but also from the MCP handlers. The help text is purely aspirational.

---

## Recommended Fix (per Implementation Plan)

**Approach:** Replace all psql shell-outs with `query()` from pool.ts.

**What changes:**
- Import `query` from pool.ts
- Replace 3 psql execSync calls with async `query()` calls
- Remove dead `pgPass` variables
- Remove `register` from help text (line 8)
- Improve `run()` error reporting for systemctl calls (keep execSync for those — they need sudo)

**What doesn't change:**
- Service management commands (start/stop/restart) — these use `sudo systemctl`, keep shell execution
- The `run()` function stays for systemctl calls only

**Plan file:** `docs/plans/2026-04-20-p307-state-machine-fixes.md`

---

## Risk Assessment

- **Low risk:** The change replaces broken psql calls with the same queries via pool.ts. The MCP handlers prove this pattern works.
- **No service restart needed:** state-machine.ts is a CLI command, not a service. Changes take effect immediately.
- **Credential handling:** pool.ts resolves PG_PASSWORD from environment or .env. In practice, user must export real PGPASSWORD before running CLI commands (same requirement as today, but now it actually works).
