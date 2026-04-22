# P300 Skeptic-Beta Review — DEVELOP Phase

**Agent:** hermes-andy (skeptic-beta)
**Date:** 2026-04-20 13:05 UTC
**Proposal:** P300 — Multi-project architecture: one orchestrator, N projects, shared infra
**Phase:** DEVELOP (build)

---

## 1. Executive Summary

P300 has solid DB migrations (AC-1, AC-2, AC-4 done) and a well-implemented PoolManager class. However, **the core wiring between PoolManager and the orchestrator is incomplete**, creating a critical gap: the orchestrator creates open offers with project_id derived from a subquery that will break when proposals move to per-project databases.

**Bottom line:** The two-tier pool architecture (metaPool + projectPool) is correct in design but the implementation treats it as if proposals and squad_dispatch live in the same DB. They don't — that's the whole point of the design.

---

## 2. Critical Issues

### 2.1 ISSUE: squad_dispatch.project_id subquery is a cross-DB trap

**Files:** `scripts/orchestrator.ts` lines 614, 896; `src/core/pipeline/pipeline-cron.ts` line 1136

All three INSERT statements use:
```sql
INSERT INTO roadmap_workforce.squad_dispatch
  (proposal_id, project_id, ...)
VALUES ($1,
  (SELECT COALESCE(project_id, 1) FROM roadmap_proposal.proposal WHERE id = $1),
  ...)
```

This subquery reads from `roadmap_proposal.proposal` — but the design (section 7.1) says proposals live in per-project DBs, not in the meta DB where squad_dispatch lives.

**When this breaks:** The moment a project gets its own DB (project_id ≠ 1), the INSERT into squad_dispatch (meta pool) will query `roadmap_proposal.proposal` on the agenthive DB — where that proposal doesn't exist. Result: NULL project_id or query failure.

**Fix:** The orchestrator must look up the proposal's project_id from the correct project pool BEFORE writing to squad_dispatch. Two options:
- (a) Read proposal from project pool, pass project_id as a parameter to the INSERT
- (b) Denormalize: store project_id in a meta-project table so cross-DB lookups aren't needed

Option (a) is simpler and requires PoolManager integration first.

### 2.2 ISSUE: PoolManager defined but not wired into orchestrator

**File:** `scripts/orchestrator.ts`

PoolManager is fully implemented in `pool.ts` (init, getPool, loadProjects, reapIdlePools, drainPool) but the orchestrator still uses the singleton `query()` function from pool.ts, which connects to a single DB. There's no `import { PoolManager }` in orchestrator.ts.

**Impact:** Even if migrations are applied, the orchestrator can only talk to one database. Multi-project dispatch is impossible without this wiring.

**Fix:** 
1. Import and initialize PoolManager in orchestrator startup
2. Replace `query()` calls with pool-aware queries: `poolManager.getPool(projectId).query(...)`
3. Table routing: proposal queries → project pool; squad_dispatch queries → meta pool

### 2.3 ISSUE: Cubic worktree fix NOT applied (AC-7)

**File:** `scripts/orchestrator.ts` line 489

Still shows:
```typescript
const worktree = await selectExecutorWorktree(null);
```

The design (section 9.6) correctly identifies this as a prerequisite. `data.worktree_path` from `cubic_acquire` is available but ignored. For multi-project, this is fatal — different projects have different worktree roots, and the wrong worktree means wrong git repo.

**Fix:**
```typescript
const worktree = data.worktree_path ?? await selectExecutorWorktree(null);
```

---

## 3. Significant Issues

### 3.1 ISSUE: selectExecutorWorktree is project-unaware

**File:** `scripts/orchestrator.ts` line 337

Even after fixing the call site, `selectExecutorWorktree()` itself uses a hardcoded worktree root. It needs to accept a project config and search the project's worktree directory, not the global one.

### 3.2 ISSUE: agent-spawner.ts not modified for project-aware paths (AC-6)

The spawner still uses hardcoded WORKTREE_ROOT for git operations. Each project has a different `git_root` — the spawner needs to read the project config and use `git_root + '/worktrees/'` as the worktree base.

### 3.3 ISSUE: Gate-pipeline service not using PoolManager

The `agenthive-gate-pipeline` service runs `PipelineCron` and `OfferProvider`. These components also write to squad_dispatch and read from proposals. If only the orchestrator uses PoolManager, the gate pipeline will break when proposals move to per-project DBs.

**Scope creep risk:** This touches a second service. Should be documented as a follow-up if not in P300 scope.

### 3.4 ISSUE: MCP server not project-aware

All MCP proposal tools query a single DB. When a user calls `mcp_proposal(action: "list")`, they'll only see proposals from the default project. MCP needs the PoolManager + optional project_id parameter to route queries correctly.

---

## 4. Design Concerns

### 4.1 CONCERN: Transaction boundary across two databases

When the orchestrator dispatches an offer:
1. Read proposal from project pool (to get project_id, title, etc.)
2. Insert into squad_dispatch on meta pool
3. Notify on meta pool

If step 2 fails after step 1, there's no rollback to the project pool (already read-only, OK). But if steps are reversed in other flows, cross-DB transactions become an issue. PostgreSQL doesn't support distributed transactions natively without two-phase commit.

**Assessment:** Current flow is read-then-write (safe). But future flows that write to both DBs will need explicit 2PC or saga patterns.

### 4.2 CONCERN: Connection budget underestimates multi-service reality

The design calculates 88 connections for 10 projects (3 per pool × services). But:
- Orchestrator: 3 meta + 3 per project
- Gate-pipeline: 3 meta + 3 per project
- MCP service: 3 meta + 3 per project (if made project-aware)
- CLI tools: 2 ad-hoc

That's 11 meta + 11 per project. For 10 projects: 11 + (10 × 11) = 121. Exceeds default max_connections=100.

**Mitigation:** Either reduce per-pool max to 2, or gate pipeline doesn't need per-project pools (it only works on squad_dispatch which is in meta).

### 4.3 CONCERN: Backward compat validation missing

The design says "existing proposals get project_id=1" and "single-project mode works unchanged." But there's no test verifying this. A migration that adds NOT NULL to a column used by active queries can cause brief errors during deploy.

**Recommendation:** Apply migration in a maintenance window or verify with a canary query first.

---

## 5. Positive Observations

1. **PoolManager class is well-designed:** Lazy creation, idle reaping, cap enforcement, health check, drain on deactivation. Solid implementation.

2. **fn_claim_work_offer update is correct:** The project scoping via provider_registry + optional p_project_id parameter is clean and backward-compatible.

3. **Migration SQL is well-structured:** Uses IF NOT EXISTS, COALESCE for safety, proper NOT NULL after backfill. Good defensive coding.

4. **Design resolved all gate issues from DRAFT→REVIEW:** The 6 issues raised by the skeptic-alpha gate were addressed in the design doc (section 9). Shows good iteration.

---

## 6. Recommended Implementation Order (Revised)

Given the issues above:

```
Priority 1 (unblocks everything):
  → Fix AC-7: cubic worktree path (5 min, line 489)
  → Wire PoolManager into orchestrator startup
  → Fix squad_dispatch INSERT to not cross-DB query proposals

Priority 2 (enables multi-project):
  → Make orchestrator table-aware: proposals→projectPool, squad_dispatch→metaPool
  → Modify selectExecutorWorktree for project-aware paths
  → Modify agent-spawner for project git_root

Priority 3 (other services):
  → Gate-pipeline project awareness (or document as deferred)
  → MCP project_id parameter (or document as deferred)
```

---

## 7. Verdict

**CONDITIONAL PROCEED.** The architecture is sound and the PoolManager code is good. But the critical wiring (PoolManager → orchestrator) is missing, and the squad_dispatch.project_id subquery is a latent cross-DB bug.

Do NOT advance to MERGE until:
1. AC-7 cubic worktree fix is applied
2. PoolManager is imported and used in orchestrator
3. squad_dispatch INSERTs use project_id from a source that works across DBs
4. At least one E2E test passes with the default project (backward compat)

---

## 8. Files for Issue Tracking

| Issue | Severity | File | Line(s) |
|-------|----------|------|---------|
| Cross-DB subquery in dispatch INSERT | Critical | orchestrator.ts | 614, 896 |
| Cross-DB subquery in pipeline-cron INSERT | Critical | pipeline-cron.ts | 1136 |
| PoolManager not imported/used | Critical | orchestrator.ts | — |
| Cubic worktree not fixed | Critical | orchestrator.ts | 489 |
| selectExecutorWorktree project-unaware | Significant | orchestrator.ts | 337 |
| agent-spawner project paths | Significant | agent-spawner.ts | — |
| Connection budget underestimates | Design | — | — |
