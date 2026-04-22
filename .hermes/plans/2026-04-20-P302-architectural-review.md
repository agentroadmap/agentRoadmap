# P302 Architectural Design Review

**Proposal:** P302 — Multi-project architecture: one orchestrator, N projects, shared infra
**Phase:** DRAFT → design
**Reviewer:** hermes-andy (architect)
**Date:** 2026-04-20
**Squad:** architect, researcher

---

## 1. Executive Summary

P302 is a feature proposal for multi-project AgentHive support. It delegates detailed architecture to P300 (component), which contains comprehensive design decisions. Both proposals are in DRAFT.

**Core concept:** One orchestrator, one Postgres instance, N independent projects. Each project gets its own database, git root, and proposal space. Agencies opt into specific projects via provider_registry. Shared infrastructure (orchestrator, gateway, model routing) stays centralized.

**Current state:** Mixed progress. DB migration exists (010_multi_project_architecture.sql). P300 AC items 1, 2, 4 claim DONE. But core TypeScript code (PoolManager, orchestrator project-aware dispatch) is NOT implemented. P289 dependency exists but P289 is still DEVELOP/new.

---

## 2. Relationship: P302 vs P300

| Proposal | Type | Role |
|----------|------|------|
| P302 | feature | Requirements + acceptance criteria (what to build) |
| P300 | component | Architecture decisions + design (how to build it) |

P302's `design` field says "See P300 for detailed architecture decisions." This is a valid feature/component split, but **P302 still needs its own AC** — currently missing. P300's alternatives field contains AC for P300 itself (research deliverables), not implementation AC for P302.

---

## 3. Status of P300's "DONE" Claims

P300 section 10 marks several AC as DONE:

| AC | Claim | Verified? |
|----|-------|-----------|
| AC-1: projects extended with db_name, git_root, etc. | DONE (migrations applied 2026-04-20) | YES — migration 010_multi_project_architecture.sql exists |
| AC-2: proposal.project_id column exists, NOT NULL DEFAULT 1 | DONE | YES — in same migration |
| AC-4: fn_claim_work_offer filters by project | DONE (p_project_id added) | YES — CREATE OR REPLACE FUNCTION in migration |

**These are genuinely done** at the DB migration level. The SQL is correct and backward-compatible.

**However**, the corresponding TypeScript code is NOT done:
- No PoolManager class exists in `src/infra/postgres/pool.ts`
- No `project_id` references in orchestrator code
- `dispatchAgent` still calls `selectExecutorWorktree(null)`
- MCP tools don't accept `project_id` parameter

**Assessment:** Schema work is done. Code work is not started. P302 is in design phase — this is expected.

---

## 4. Design Quality Assessment

### Strengths (from P300 design doc)

- **Two-tier pool architecture** is correct. metaPool for cross-project coordination (squad_dispatch, proposal_lease, agent_registry, provider_registry) + per-project pools for project-specific data.
- **Lazy pool creation** prevents connection storms at startup.
- **One DB per project** beats schema-per-project for isolation. No search_path confusion, cleaner grants, independent backup/restore.
- **Backward compat** via project_id=1 default is non-breaking. Existing proposals get project_id=1 automatically.
- **Failure isolation** per-project DB means one project's outage doesn't cascade to others.
- **Connection budget math** is sound: 8 connections per DB × 10 projects = 88 total, safe under max_connections=100.

### Concerns

1. **Project creation is entirely manual** (SQL + migration replay). No db_create.sh yet. This limits adoption until Phase 3 automation.
2. **No cross-project dependencies** is documented but means P282 (federation) must solve this later. Acceptable for v1.
3. **Discord routing deferred** — shared channel with [PROJECT] prefix is minimal. Fine for v1.
4. **Credential model unchanged** — shared `/home/xiaomi` creds. Per-project creds deferred to P282. Fine for now but is a security boundary limitation.
5. **`claude` user connection limit** (20) is not addressed in the connection budget. If `claude` user connects to each project DB, 10 projects × 1 connection = 10, leaving only 10 for everything else. Needs documentation.

---

## 5. Blocking Issues (Must Fix Before REVIEW)

### 5.1 P302 has NO acceptance criteria

**Status: BLOCKING**

P302's `alternatives` field is null, `design` field only references P300. The `list_criteria` MCP tool errors out. As a feature proposal, P302 MUST have its own AC defining what "done" means for the implementation.

**Resolution:** Populate P302 AC (see Section 8 below).

### 5.2 P289 dependency exists but P289 is incomplete

**Status: BLOCKING**

Dependency P302 → P289 (blocks) was correctly added. But P289 is at DEVELOP/new. The provider_registry table is needed for agency project scoping in fn_claim_work_offer.

**Resolution:** P289 must reach COMPLETE before P302 implementation begins. Document this in P302 AC.

### 5.3 Scope ambiguity between P300 and P302

**Status: BLOCKING**

P302's title says "one orchestrator, N projects, shared infra" — suggests implementation. But design field defers to P300. Is P302 the implementation proposal or just requirements?

**Resolution:** P302 is the implementation proposal. P300 is the design component. P302 AC should cover implementation deliverables (code changes, migrations, tests), while P300 AC covers design decisions (which DB strategy, which pool architecture, etc.).

---

## 6. Non-Blocking Issues (Should Fix)

### 6.1 `claude` user connection limit not in budget

The connection budget analysis assumes `max_connections=100` for the Postgres instance. But the `claude` user has a 20-connection limit. If gate-pipeline (running as `claude`) creates per-project pools, 10 projects × 1 connection each = 10, leaving only 10 for everything else.

**Recommendation:** Add to P302 AC that connection limits per user must be documented and tested.

### 6.2 cubic-worktree disconnect not fixed

P300 section 9.6 documents the bug: `dispatchAgent()` calls `selectExecutorWorktree(null)` ignoring `cubic_acquire`'s `worktree_path`. The fix is designed but not implemented.

**Recommendation:** This should be a prerequisite fix (separate PR or part of P302 Phase 1b).

### 6.3 MCP project_id parameter scope

P300 section 7.3 says MCP tools need optional `project_id`. This touches:
- `mcp_proposal` (create, list, get)
- `mcp_agent` (cubic_acquire)
- `mcp_project` (new CRUD actions)

This is substantial cross-cutting work not reflected in P302 AC.

**Recommendation:** Add MCP project_id support to P302 AC (Phase 3).

---

## 7. Dependency Graph

```
P281 (Resource hierarchy)     [COMPLETE]
  └── P289 (Provider registry) [DEVELOP/new] ← BLOCKER
        └── P300 (Component design) [DRAFT/mature]
              └── P302 (Feature implementation) [DRAFT/new]
```

P289 must reach COMPLETE before P302 can begin TypeScript implementation. The DB migration (Phase 1a) can proceed independently since it only adds columns and updates functions.

---

## 8. Proposed Acceptance Criteria for P302

These AC define what "done" means for the P302 implementation:

1. `roadmap_workforce.projects` extended with `db_name`, `git_root`, `discord_channel_id`, `db_host`, `db_port`, `db_user` — **DONE** (migration 010)
2. `roadmap_proposal.proposal.project_id` column exists, NOT NULL DEFAULT 1 — **DONE** (migration 010)
3. PoolManager in `src/infra/postgres/pool.ts` with metaPool + per-project pools (lazy creation, cap at 10, idle reaping at 5min)
4. `fn_claim_work_offer` filters offers by agency's project subscriptions via provider_registry — **DONE** (migration 010)
5. `squad_dispatch.project_id` populated from proposal's project_id on all new dispatches (handleStateChange + dispatchImplicitGate INSERTs use subquery)
6. Worktree paths use project's `git_root` instead of hardcoded WORKTREE_ROOT
7. `dispatchAgent` uses `cubic_acquire`'s `worktree_path` instead of null (fixes cubic-worktree disconnect)
8. Backward compat: single-project mode unchanged (project_id=1, all existing data preserved)
9. Connection budget: per-pool max=3, total for 10 projects ≤ 88 connections under default Postgres limits
10. E2E test: two projects run independently with separate DBs, git roots, and offer pipelines
11. P289 (provider_registry) must be COMPLETE before TypeScript implementation begins
12. Project onboarding procedure documented (manual SQL for Phase 1-2; automated db_create.sh in Phase 3)
13. MCP tools accept optional `project_id` parameter (mcp_proposal create/list/get, mcp_agent cubic_acquire)
14. `claude` user connection limits documented and tested against budget

---

## 9. Implementation Sequence (Recommended)

Phase 1a (DB, unblocked): Migration 010 already exists. Verify applied.
Phase 1b (Code, blocked on P289): PoolManager, orchestrator project-aware dispatch
Phase 2 (Routing): agent-spawner git_root, offer-provider project filter
Phase 3 (Polish): Discord [PROJECT] prefix, MCP project_id, E2E test, db_create.sh

---

## 10. Gate Decision

**Decision: HOLD — Request Changes**

P302 is not ready for REVIEW because:
1. No acceptance criteria defined (blocking) — must add AC before advancing
2. Scope ambiguity between P300 and P302 must be resolved
3. P289 dependency exists but is incomplete (expected — document it in AC)

The design (in P300) is solid. The DB migration (010) is correct. The requirements document (P302) needs AC populated before gate review can proceed.

**Next step:** Populate P302 AC (Section 8 above), clarify P302/P300 scope relationship, then re-advance to REVIEW.
