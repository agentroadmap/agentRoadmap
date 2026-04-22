# Skeptic-Beta Review: P300 DEVELOP/new

**Reviewer:** hermes-andy (skeptic-beta)
**Date:** 2026-04-20
**Verdict:** HOLD — 4 issues found (2 blocking, 2 non-blocking)

## Code Archaeology

Inspected actual codebase against all 5 pending ACs:

| File | Lines | Status |
|------|-------|--------|
| pool.ts | 518 | PoolManager class at lines 308-518 |
| orchestrator.ts | 1421 | PoolManager.init() at line 1223 |
| agent-spawner.ts | 885 | Zero project_id/git_root refs |
| 010_multi_project_architecture.sql | 156 | Migration applied |

## AC Status (verified from code, not self-report)

| AC | Claimed | Actual | Evidence |
|---|---|---|---|
| AC-3 PoolManager | pending | PARTIAL | Class exists, initialized at orchestrator.ts:1223, but orchestrator still uses `pool` (metaPool alias) for ALL queries including roadmap_proposal.proposal. No code path calls poolManager.getPool(projectId) or queryProject(). PoolManager is initialized then ignored. |
| AC-5 squad_dispatch.project_id | pending | PASS | INSERTs at lines 617-621 and 901-905 both include subquery: (SELECT COALESCE(project_id, 1) FROM roadmap_proposal.proposal WHERE id = $1) |
| AC-6 git_root per project | pending | NOT DONE | agent-spawner.ts has zero references to git_root or project_id. Orchestrator uses hardcoded WORKTREE_ROOT env var. No code reads projects.git_root. |
| AC-7 cubic worktree fix | pending | PASS | orchestrator.ts:489 — const worktree = data.worktree_path ?? await selectExecutorWorktree(null) |
| AC-11 default fallback | pending | PARTIAL | fn_claim_work_offer agency_projects CTE has fallback logic (lines 96-102): when no provider_registry entries exist, selects ALL projects. But does NOT default to project_id=1 specifically. |

## Blocking Issues

### B1: PoolManager initialized but not integrated (AC-3)

The orchestrator bootstraps PoolManager at line 1223 and aliases metaPool as `pool`. But all subsequent queries use the same `pool` variable:
- Proposal reads: lines 542, 839, 1037
- Proposal lease: line 842
- Workflows: lines 1269, 1295
- Transition queue: line 963

When a second project DB is created, proposal data will live in that DB, but the orchestrator will still read from metaPool/agenthive — getting empty results. The integration work is: find every query to `roadmap_proposal.*` and route it through `poolManager.getPool(projectId)`. But projectId must come from somewhere — currently not passed to most query sites.

**Key design question unresolved:** Does proposal data stay in metaPool (centralized, like squad_dispatch) or move to per-project DBs? The design doc says per-project, but this creates a chicken-and-egg problem: the orchestrator needs proposal.project_id to know which pool to use, but if the proposal is in a per-project pool, it can't read it without already knowing the pool.

**Recommendation:** Keep proposal data in metaPool alongside squad_dispatch. Proposals are coordination data, not project-specific work products. This eliminates the routing complexity entirely.

### B2: AC-6 git_root not wired (AC-6)

The design says worktree paths use `project.git_root`. Reality:
- agent-spawner.ts reads `WORKTREE_ROOT` env (hardcoded `/data/code/worktree`)
- orchestrator.ts line 26: `const WORKTREE_ROOT = process.env.AGENTHIVE_WORKTREE_ROOT ?? "/data/code/worktree"`
- `selectExecutorWorktree()` scans filesystem under WORKTREE_ROOT
- No code reads `projects.git_root` from DB
- No code passes project context to spawner

Until this is wired, all projects share the same worktree root — defeating the isolation goal.

## Non-Blocking Issues

### N1: Password env var mismatch

PoolManager reads `process.env.PG_PASSWORD` (line 413) but the system uses `PGPASSWORD`. Project pool connections will fail with auth errors when a second project DB is created.

### N2: AC-11 fallback allows all projects, not project_id=1

The agency_projects CTE fallback (when no provider_registry entries) returns ALL project IDs, not just project_id=1. Per the AC spec, unregistered agencies should only see project_id=1 offers.

## Recommendation

Priority order for remaining work:
1. Fix N1 (PG_PASSWORD → PGPASSWORD) — one-line fix
2. Fix N2 (AC-11 fallback) — add WHERE id = 1 to fallback CTE
3. Fix B2 (git_root wiring) — add project_id to dispatchAgent/selectExecutorWorktree
4. Resolve B1 design question — proposal data location (metaPool vs per-project)

~4-6 hours of coding remain.
