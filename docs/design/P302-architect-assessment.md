# P302 Architect Assessment — DRAFT Review (2026-04-20)

**Reviewer:** hermes-architect
**Proposal:** P302 — Multi-project architecture: one orchestrator, N projects, shared infra
**Phase:** DRAFT
**Verdict:** HOLD

---

## Design Quality: STRONG

The P302/P300 pair follows the right separation:
- P300 = architecture decisions (one DB per project, PoolManager, agency scoping)
- P302 = feature requirements + acceptance criteria

The 10 refined AC from P300 are well-scoped and testable.

## Dependency Analysis

### Blocking
1. **P289** (DEVELOP/new) — agency/worker separation must COMPLETE before P302 can advance. provider_registry schema exists (migration 041 applied) but P289 itself is still in DEVELOP.
2. **P300** (DEVELOP/new) — design component needs formal approval before P302 implementation begins.

### Prerequisite (implicit)
- Cubic-worktree disconnect fix — P300 section 9.6 documents this but it lives in P281 (conceptual, no proposal found in DB). This must be verified as resolved.

## Key Architectural Decisions Validated

| Decision | Verdict | Notes |
|----------|---------|-------|
| One DB per project | ✅ Correct | Cleaner than schema-per-project. Cross-project dblink for rare queries. |
| Two-tier pool (metaPool + projectPool) | ✅ Correct | squad_dispatch/proposal_lease stay in agenthive DB for cross-project coordination. |
| Connection budget | ✅ Safe | 88 connections for 10 projects (8 per DB × 10 + meta). Under default max_connections=100. |
| Agency scoping via provider_registry | ✅ Correct | Reuses existing P289 registry. Natural join point. |
| Backward compat (project_id=1) | ✅ Correct | Migration must verify projects(id=1) exists before ALTER TABLE. |
| Shared creds for now | ✅ YAGNI | Per-project creds belong in P282 federation. |
| Discord prefix not channels | ✅ Pragmatic | Phase 1: shared channel with [PROJECT] prefix. |

## Recommendations

1. **Split AC-3 (PoolManager) into subtasks:** PoolManager with metaPool + projectPools + idle reaping + health checks is substantial. Break into:
   - (a) PoolManager class + metaPool
   - (b) Lazy project pool creation + cap
   - (c) Idle reaping (5min threshold)
   - (d) Health checks on acquire

2. **Add AC for blast radius isolation:** Verify that a project DB failure does not block other projects. This is the core value proposition of one-DB-per-project and should be explicitly tested (simulate project_A DB down, verify project_B dispatches still work).

3. **Document worktree migration path:** Section 7.6 says default project keeps existing paths. Confirm: `/data/code/worktree/` stays for project 1, new projects use `/data/code/projects/<name>/worktrees/`.

4. **P289 is the critical path:** Everything else is ready. Focus on completing P289 before advancing P302.

5. **Connection limit threshold:** If projects grow beyond 12, introduce PgBouncer. Document this in operational runbook.

## Verdict: HOLD

P302 should NOT advance to REVIEW until:
1. P289 reaches COMPLETE
2. P300 is reviewed and approved (or merged into P302 as design doc)
3. Cubic-worktree disconnect is confirmed fixed

The proposal itself is well-structured. No splitting needed. The work is appropriately scoped for a single feature proposal with ~19h implementation estimate across 4 phases.

## Implementation Phases (Validated)

| Phase | Effort | Content | Dependencies |
|-------|--------|---------|-------------|
| 1a (Migrations) | 2h | Extend projects table, add proposal.project_id, backfill | None |
| 1b (Code) | 4h | PoolManager, orchestrator project-aware startup | Phase 1a deployed |
| 2 (Routing) | 5h | fn_claim update, offer-provider, agent-spawner git_root | P289 complete |
| 3 (Polish) | 4h | Discord prefix, MCP project_id, E2E test | Phase 2 |
| 4 (Migration) | 4h | Migrate existing AgentHive as project_id=1 | Phase 3 |

**Total: ~19 hours**
