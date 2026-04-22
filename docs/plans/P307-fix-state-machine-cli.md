# P307: Fix CLI state-machine commands (PGPASSWORD=*** literal)

**Goal:** Fix all 6 bugs in `src/apps/commands/state-machine.ts` — broken psql calls, dead code, missing register subcommand, silent failures, sync blocking.

**Architecture:** Replace shell-out-to-psql pattern with `getPool()` from `src/infra/postgres/pool.ts`. The pool already handles PG_PASSWORD, PG_USER, host, port, and connection management. This eliminates bugs 1-3 and 6 in one change.

**Tech Stack:** TypeScript, Commander.js (CLI), pg (node-postgres), pool.ts

---

## Current State (bugs verified 2026-04-20)

**File:** `/data/code/AgentHive/src/apps/commands/state-machine.ts` (151 lines)

| Bug | Location | Issue |
|-----|----------|-------|
| B1 | Lines 88, 124, 140 | `PGPASSWORD=***` is a **literal string**, not env interpolation. All psql calls fail auth. |
| B2 | Lines 88, 124, 140 | `-U admin` — no `admin` DB user exists. Valid: `xiaomi`, `andy`, `claude`. |
| B3 | Lines 87, 122, 138 | `pgPass` variable declared 3x, never used. Dead code. |
| B4 | Line 8 | `roadmap sm register` documented but no handler registered. |
| B5 | Lines 20-26 | `run()` catches all errors, returns `""`. No diagnostics. |
| B6 | Line 13 | `execSync` blocks Node event loop for up to 10s per query. |

**Reference implementation:** `scripts/bootstrap-state-machine.ts` already uses `query()` from pool.ts correctly (lines 14, 29-39, etc). The pattern to follow is established.

---

## Implementation Plan

### Task 0: Fix pool.ts bugs (root cause fixes)

**File:** `src/infra/postgres/pool.ts`

These 3 bugs in pool.ts directly cause state-machine.ts failures. Must be fixed first.

**Bug 0a — Line 44: literal `***` instead of regex match:**
```typescript
// BEFORE (broken):
process.env.PG_PASSWORD=***
// AFTER (correct):
process.env.PG_PASSWORD = match[1].trim();
```

**Bug 0b — Line 266: truncated variable name:**
```typescript
// BEFORE (broken — dbConf...ord is literal text, not a variable):
process.env.__PG_PASSWORD_FROM_CONFIG=dbConf...ord;
// AFTER (correct):
process.env.__PG_PASSWORD_FROM_CONFIG = dbConfig.password;
```

**Bug 0c — Lines 168, 276: wrong default user fallback:**
```typescript
// BEFORE:
config?.user ?? process.env.PG_USER ?? databaseUrlConfig.user ?? "admin"
// AFTER:
config?.user ?? process.env.PG_USER ?? databaseUrlConfig.user ?? "xiaomi"
```
Same fix at both locations (line 168 in `resolvePoolConfig()`, line 276 in `initPoolFromConfig()`).

### Task 1: Convert `status` command to use pool.query

**File:** `src/apps/commands/state-machine.ts:75-117`

**Changes:**
1. Add import: `import { getPool } from "../../infra/postgres/pool";`
2. Change `status` handler from sync to `async`
3. Replace 3 psql shell-outs with `pool.query()` calls
4. Remove dead `pgPass` variable (line 87)

**Before (line 86-91):**
```typescript
const pgPass = process.env.PG_PASSWORD || "";
const psql = `PGPASSWORD=*** psql -h 127.0.0.1 -U admin -d agenthive -t -c`;
// ...
const agencies = run(`${psql} "SELECT ..."`);
```

**After:**
```typescript
const pool = getPool();
// ...
const { rows: agencyRows } = await pool.query(
  `SELECT agent_identity || ' (' || agent_type || ', ' || status || ')' as line
   FROM roadmap_workforce.agent_registry ORDER BY agent_identity`
);
// format and print rows
```

Same pattern for the offers query (line 101) and active dispatches query (line 109).

### Task 2: Convert `agencies` command to use pool.query

**File:** `src/apps/commands/state-machine.ts:119-133`

Same approach: async handler, `pool.query()`, remove dead `pgPass`.

### Task 3: Convert `offers` command to use pool.query

**File:** `src/apps/commands/state-machine.ts:135-151`

Same approach.

### Task 4: Fix `run()` to report errors to stderr

**File:** `src/apps/commands/state-machine.ts:20-26`

**Before:**
```typescript
function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 10_000 }).trim();
  } catch {
    return "";
  }
}
```

**After:**
```typescript
function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 10_000 }).trim();
  } catch (e: any) {
    console.error(`[sm] command failed: ${cmd.split(" ")[0]}: ${e.message ?? e}`);
    return "";
  }
}
```

Note: `run()` is still used for `systemctl` commands (start/stop/restart/status). Keep it for those. The DB queries no longer use `run()` after tasks 1-3.

### Task 5: Handle `register` subcommand

**Option A — Implement it (preferred):**

The `register` command should register the current host as an agency. Use the `agency_register` MCP tool or direct SQL.

```typescript
sm.command("register")
  .description("Register this host as an agency in AgentHive")
  .requiredOption("--identity <identity>", "Agency identity (e.g. hermes/agency-xiaomi)")
  .option("--type <type>", "Agent type", "agency")
  .option("--capabilities <caps>", "Comma-separated capabilities")
  .action(async (opts: { identity: string; type: string; capabilities?: string }) => {
    const pool = getPool();
    try {
      const { rows } = await pool.query(
        `INSERT INTO roadmap_workforce.agent_registry (agent_identity, agent_type, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (agent_identity) DO UPDATE SET status = 'active', agent_type = $2
         RETURNING id`,
        [opts.identity, opts.type]
      );
      const agentId = rows[0].id;
      if (opts.capabilities) {
        const caps = opts.capabilities.split(",").map(c => c.trim());
        for (const cap of caps) {
          await pool.query(
            `INSERT INTO roadmap_workforce.agent_capability (agent_id, capability)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [agentId, cap]
          );
        }
      }
      console.log(`Registered: ${opts.identity} (id=${agentId})`);
      if (opts.capabilities) console.log(`Capabilities: ${opts.capabilities}`);
    } catch (e: any) {
      console.error(`[sm] register failed: ${e.message}`);
      process.exit(1);
    }
  });
```

**Option B — Remove from help text:**
Delete line 8 from the JSDoc if register is out of scope.

Recommendation: Option A — implement it. The SQL is straightforward and the capability already exists in MCP.

### Task 6: Add proper error handling for systemctl commands

Currently `run()` silently swallows `sudo systemctl` failures. After task 4, errors go to stderr. Additionally, the `start`/`stop`/`restart` handlers should check the exit code:

```typescript
function run(cmd: string, throwOnError = false): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 10_000 }).trim();
  } catch (e: any) {
    console.error(`[sm] command failed: ${cmd.split(" ")[0]}: ${e.message ?? e}`);
    if (throwOnError) throw e;
    return "";
  }
}
```

Then in start/stop handlers, use `throwOnError = true` so systemctl failures propagate.

---

## Files Changed

| File | Change |
|------|--------|
| `src/infra/postgres/pool.ts` | Task 0 — Fix 3 root-cause bugs (literal `***`, truncated var, wrong default user) |
| `src/apps/commands/state-machine.ts` | Tasks 1-6 — Main fix file (6 bugs) |

No new files needed. No dependency changes.

---

## Verification

1. **Build check:** `npx tsc --noEmit src/apps/commands/state-machine.ts` (type errors)
2. **Runtime check:** `roadmap sm status` should show real DB data instead of `(none)` / empty
3. **Runtime check:** `roadmap sm agencies` should list registered agencies
4. **Runtime check:** `roadmap sm offers` should list open offers
5. **Runtime check:** `roadmap sm register --identity test/agency --type agency --capabilities code,review` should succeed
6. **Error check:** With invalid DB creds, should print error to stderr (not silent)
7. **No event loop block:** status command should not freeze the process

---

## Acceptance Criteria Mapping

| AC | Task | Description |
|----|------|-------------|
| AC-1 | Tasks 1-3 | state-machine.ts uses getPool() from pool.ts for all DB queries |
| AC-2 | Tasks 1-3 | state-machine.ts eliminates psql shell-outs entirely — PGPASSWORD/username no longer relevant |
| AC-3 | Task 5 | Register subcommand implemented (not removed) with --identity, --type, --capabilities |
| AC-4 | Task 0a | pool.ts line 44 uses match[1].trim() not literal *** for PG_PASSWORD loading |
| AC-5 | Tasks 4, 6 | run() reports errors to stderr via console.error |
| AC-6 | Tasks 1-3 | execSync replaced with async pool.query() for all DB queries |
| AC-7 | Tasks 1-3 | Dead pgPass variable declarations removed |
| AC-8 | Task 0c | pool.ts default user changed from admin to xiaomi (lines 168, 276) |
| AC-9 | Task 0b | pool.ts line 266 fixed: dbConf...ord replaced with dbConfig.password |
| AC-10 | Tasks 1-3 | No psql shell-outs remain (grep verification: grep -c psql state-machine.ts = 0) |
| AC-11 | Task 0a | pool.ts loadPGPassword() skips sentinel value ***

---

## Design Notes

- **Why pool.query, not psql?** The pool.ts infrastructure already handles credentials, connection pooling, search_path, and timeout. Shelling out to psql is a dependency on the psql binary being installed, in PATH, and having the right version. Pool.query eliminates all of that.
- **Why not MCP tools?** The CLI commands are meant to work when the MCP server may not be running (e.g., `roadmap sm start` starts the MCP-dependent services). Direct pool access is appropriate here.
- **Why keep `run()` for systemctl?** systemctl is a system binary that can't be replaced with a library call. Keeping execSync for systemctl is fine — these are fast commands (~100ms) and error reporting is now added.
- **`register` uses ON CONFLICT DO UPDATE:** This makes it idempotent — safe to run multiple times. Same pattern used by agency_register MCP tool.

### Edge Case: pool.ts default user fallback (FIXED in Task 0c)

pool.ts lines 168 and 276 previously defaulted to `?? "admin"`. Task 0c changes both to `?? "xiaomi"`. This means even in stripped environments (cron, systemd ExecStartPre), the pool connects as a valid user instead of failing with authentication error.

---

## Architecture Review (2026-04-20)

**Reviewer:** hermes-andy (architect agent), worker-4688 (architect)
**Verdict:** APPROVED — ready for development

### Confirmed design decisions:

1. **pool.query over psql** — Correct. Eliminates 4 bugs at once (B1-B3, B6). No binary dependency, no PATH issues, no credential interpolation bugs.

2. **Keep run() for systemctl** — Correct. systemctl requires sudo, runs fast (~100ms), and has no Node.js library equivalent. execSync is appropriate here.

3. **Implement register, don't remove** — Correct. The register subcommand is documented in help text and genuinely needed. Implementation is simple (2 SQL statements with ON CONFLICT).

4. **Error reporting via console.error** — Correct. CLI convention is stderr for errors, stdout for data. No need for a logging framework.

### Risk assessment:

| Risk | Severity | Mitigation |
|------|----------|------------|
| pool.ts fails if PG_PASSWORD not set | Low | pool.ts already loads from .env files automatically. The CLI runs in the user's shell with env loaded. |
| Register ON CONFLICT may not handle agent_type changes | Low | The DO UPDATE SET includes agent_type=$2, so re-registration with different type works. |
| Existing callers of `run()` for systemctl | None | Only state-machine.ts uses run(). No other importers. |
| Async status handler | Low | Commander.js supports async actions. The handler already uses `async` (line 77). |

### What implementor should watch for:

1. Import path: `getPool` from `"../../infra/postgres/pool"` — verify relative path from `src/apps/commands/` to `src/infra/postgres/`.
2. The `query()` helper from pool.ts is also available (line 288) and may be simpler than `getPool().query()` for one-shot use.
3. Ensure `console.error()` output goes to stderr, not stdout — use `process.stderr.write()` if needed for guaranteed behavior.
