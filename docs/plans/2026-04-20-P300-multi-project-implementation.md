# P300 Multi-Project Architecture — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Wire up the PoolManager and project-aware routing so AgentHive can serve multiple projects with separate databases, git roots, and worktree paths.

**Architecture:** Two-tier pool (metaPool for cross-project coordination + per-project pools). The pipeline-cron dispatches already set project_id on squad_dispatch INSERTs. Remaining work: PoolManager integration into dispatch flow, agent-spawner worktree resolution, and backward-compat verification.

**Tech Stack:** TypeScript, pg (PostgreSQL), Node.js

---

## Current State (Already Done)

| Item | Status |
|------|--------|
| PoolManager class in pool.ts | ✓ Implemented |
| projects table extended (db_name, git_root, etc.) | ✓ Migrations applied |
| proposal.project_id column (NOT NULL DEFAULT 1) | ✓ Applied |
| fn_claim_work_offer p_project_id parameter | ✓ Applied |
| pipeline-cron offer dispatch sets project_id | ✓ Done (line 1137-1141) |

## Remaining Work

| Item | Status |
|------|--------|
| PoolManager wired into pipeline-cron | ✗ Not started |
| Agent-spawner project-aware worktree root | ✗ Not started |
| Direct-spawn path sets project_id on squad_dispatch | ? Unknown |
| Cubic worktree_path fix | ✗ Not started |
| E2E backward compat verification | ✗ Not started |

---

### Task 1: Verify and fix squad_dispatch.project_id on direct-spawn path

**Objective:** Ensure the `processTransitionWithSpawnAgent` path also populates `project_id` on squad_dispatch.

**Files:**
- Read: `src/core/pipeline/pipeline-cron.ts` lines 1175-1220

**Step 1: Read the direct-spawn dispatch path**

```bash
grep -n -A30 'processTransitionWithSpawnAgent' /data/code/AgentHive/src/core/pipeline/pipeline-cron.ts | head -60
```

**Step 2: Check if squad_dispatch INSERT includes project_id**

Look for any INSERT into squad_dispatch that does NOT have `project_id` column. The offer-dispatch path (line 1137) already does it. The direct-spawn path may not.

**Step 3: Fix if needed**

If direct-spawn INSERT lacks project_id, add the same subquery pattern:

```sql
-- In the INSERT, add project_id column and value:
(SELECT COALESCE(p.project_id, 1) FROM roadmap_proposal.proposal p WHERE p.id = $1)
```

**Step 4: Verify**

```bash
grep -n 'INSERT.*squad_dispatch' /data/code/AgentHive/src/core/pipeline/pipeline-cron.ts
```

Expected: Both offer-dispatch and direct-spawn paths include `project_id`.

**Step 5: Commit**

```bash
git add src/core/pipeline/pipeline-cron.ts
git commit -m "fix: populate squad_dispatch.project_id on direct-spawn path"
```

---

### Task 2: Wire PoolManager into pipeline-cron query routing

**Objective:** Pipeline-cron needs to route proposal-specific queries to the correct project pool, while keeping meta queries (squad_dispatch, model_routes, host_model_policy) on the meta pool.

**Files:**
- Modify: `src/core/pipeline/pipeline-cron.ts` (imports + constructor + query routing)
- Read: `src/infra/postgres/pool.ts` (PoolManager API)

**Step 1: Add PoolManager import**

At the top of pipeline-cron.ts, add:

```typescript
import { getPool, query, getPoolManager, type PoolManager as PoolManagerType } from "../../infra/postgres/pool.ts";
```

**Step 2: Add PoolManager to PipelineCronDeps**

```typescript
// In PipelineCronDeps interface, add:
poolManager?: PoolManagerType;
```

**Step 3: Store PoolManager in PipelineCron constructor**

```typescript
private readonly poolManager: PoolManagerType | null = null;

constructor(deps: PipelineCronDeps = {}) {
  // ... existing code ...
  this.poolManager = deps.poolManager ?? null;
}
```

**Step 4: Add project-aware query helper**

```typescript
/**
 * Route a query to the correct pool based on proposal_id.
 * Falls back to meta pool if poolManager is not available (backward compat).
 */
private async queryByProposal<T>(
  proposalId: number,
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  if (!this.poolManager) {
    return this.queryFn<T>(text, params);
  }
  // Look up proposal's project_id
  const metaPool = this.poolManager.metaPool;
  const { rows } = await metaPool.query<{ project_id: number }>(
    'SELECT project_id FROM roadmap_proposal.proposal WHERE id = $1',
    [proposalId]
  );
  const projectId = rows[0]?.project_id ?? 1;
  const pool = this.poolManager.getPool(projectId);
  return pool.query<T>(text, params);
}
```

**Step 5: Initialize PoolManager at startup**

In the `start()` method (or wherever the service initializes), add:

```typescript
if (!this.poolManager) {
  const pm = await getPoolManager();
  this.poolManager = pm;
}
```

**Step 6: Commit**

```bash
git add src/core/pipeline/pipeline-cron.ts
git commit -m "feat: wire PoolManager into pipeline-cron for multi-project query routing"
```

---

### Task 3: Make agent-spawner worktree root project-aware

**Objective:** Replace hardcoded `WORKTREE_ROOT = "/data/code/worktree"` with dynamic resolution from project config.

**Files:**
- Modify: `src/core/orchestration/agent-spawner.ts` (lines 26, 381, 415, 727)

**Step 1: Add worktreeRoot parameter to loadEnvAgent and detectProvider**

Current signatures:
```typescript
async function loadEnvAgent(worktreeName: string)
async function detectProvider(worktreeName: string)
```

Change to:
```typescript
async function loadEnvAgent(worktreeName: string, worktreeRoot?: string)
async function detectProvider(worktreeName: string, worktreeRoot?: string)
```

Default to WORKTREE_ROOT when not provided (backward compat).

**Step 2: Update path construction**

```typescript
// Before:
const path = join(WORKTREE_ROOT, worktreeName, ".env.agent");

// After:
const root = worktreeRoot ?? WORKTREE_ROOT;
const path = join(root, worktreeName, ".env.agent");
```

**Step 3: Pass worktreeRoot through spawnAgent**

The `spawnAgent` function should accept an optional `worktreeRoot` in its request and pass it to `loadEnvAgent` and `detectProvider`.

Add to `SpawnAgentRequest`:
```typescript
worktreeRoot?: string;
```

Pass through in `spawnAgent`:
```typescript
const provider = await detectProvider(worktree, request.worktreeRoot);
const agentEnv = await loadEnvAgent(worktree, request.worktreeRoot);
```

**Step 4: Update cwd in spawnAgent**

```typescript
const root = request.worktreeRoot ?? WORKTREE_ROOT;
const cwd = join(root, worktree);
```

**Step 5: Update GITCONFIG_ROOT similarly**

```typescript
const GITCONFIG_BASE = request.gitconfigRoot ?? GITCONFIG_ROOT;
const GIT_CONFIG_GLOBAL: `${GITCONFIG_BASE}/${worktree}.gitconfig`,
```

**Step 6: Commit**

```bash
git add src/core/orchestration/agent-spawner.ts
git commit -m "feat: project-aware worktree root in agent-spawner"
```

---

### Task 4: Wire project-aware worktree root into pipeline-cron dispatch

**Objective:** When pipeline-cron dispatches an agent, resolve the project's git_root and pass it to the spawner.

**Files:**
- Modify: `src/core/pipeline/pipeline-cron.ts` (dispatch flow)

**Step 1: Add project lookup in dispatch flow**

In `processTransitionWithSpawnAgent` (or the offer-dispatch equivalent), before calling spawnAgent:

```typescript
// Look up project config
const { rows: projRows } = await this.queryFn<{ git_root: string }>(
  `SELECT p.git_root
     FROM roadmap_workforce.projects p
     JOIN roadmap_proposal.proposal prop ON prop.project_id = p.id
    WHERE prop.id = $1`,
  [proposalId]
);
const gitRoot = projRows[0]?.git_root ?? '/data/code/AgentHive';
const worktreeRoot = `${gitRoot}/../worktrees`;  // or a configurable relationship
```

**Step 2: Pass to SpawnAgentRequest**

```typescript
const request: SpawnAgentRequest = {
  // ... existing fields ...
  worktreeRoot,
};
```

**Step 3: Commit**

```bash
git add src/core/pipeline/pipeline-cron.ts
git commit -m "feat: resolve project git_root for worktree dispatch"
```

---

### Task 5: Verify backward compatibility — single-project mode

**Objective:** Confirm that all existing behavior works unchanged when only project_id=1 exists (the current live state).

**Files:**
- Read: `src/core/pipeline/pipeline-cron.ts`
- Read: `src/core/orchestration/agent-spawner.ts`
- Read: `src/infra/postgres/pool.ts`

**Step 1: Verify default project exists**

```sql
SELECT id, name, db_name, git_root, is_active FROM roadmap_workforce.projects;
```

Expected: At least one row with id=1, name='agenthive', db_name='agenthive'.

**Step 2: Verify all proposals have project_id=1**

```sql
SELECT project_id, COUNT(*) FROM roadmap_proposal.proposal GROUP BY project_id;
```

Expected: All proposals have project_id=1.

**Step 3: Verify PoolManager.metaPool for project_id=1**

```typescript
const pm = await getPoolManager();
const pool = pm.getPool(1);
// Should return the same pool as getPool() (meta pool)
```

**Step 4: Verify backward-compat code paths**

- `worktreeRoot ?? WORKTREE_ROOT` — when not provided, falls back to hardcoded
- `poolManager ?? null` — when not provided, uses legacy queryFn
- All existing squad_dispatch INSERTs with DEFAULT 1 continue to work

**Step 5: Run existing tests**

```bash
cd /data/code/AgentHive && npx vitest run 2>&1 | tail -20
```

**Step 6: Commit (if any fixes needed)**

---

### Task 6: Fix cubic worktree_path disconnect (if applicable)

**Objective:** Ensure dispatchAgent uses the cubic's worktree_path instead of calling selectExecutorWorktree(null).

**Files:**
- Read: `src/core/pipeline/pipeline-cron.ts` for cubic dispatch logic

**Step 1: Check if cubic_acquire returns worktree_path**

```bash
grep -n 'cubic_acquire\|cubicAcquire\|worktree_path' /data/code/AgentHive/src/core/pipeline/pipeline-cron.ts | head -20
```

**Step 2: If cubic dispatch uses selectExecutorWorktree(null), replace with cubic's worktree_path**

**Step 3: Commit**

```bash
git add src/core/pipeline/pipeline-cron.ts
git commit -m "fix: use cubic worktree_path instead of selectExecutorWorktree(null)"
```

---

## Verification Checklist

- [ ] PoolManager loaded at service startup
- [ ] pipeline-cron queries route to correct project pool for proposal queries
- [ ] pipeline-cron queries route to meta pool for squad_dispatch/model_routes
- [ ] agent-spawner resolves worktree root from project config
- [ ] squad_dispatch.project_id populated on ALL dispatch paths (offer + direct-spawn)
- [ ] All existing behavior unchanged with project_id=1 only
- [ ] Tests pass
- [ ] TypeScript compiles clean: `npx tsc --noEmit`
