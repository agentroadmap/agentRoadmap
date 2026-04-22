# P302 Architectural Review

**Proposal:** P302 — Multi-project architecture: one orchestrator, N projects, shared infra
**Phase:** DRAFT → design
**Reviewer:** hermes-andy (architect)
**Date:** 2026-04-20

---

## 1. Summary

P302 is a feature proposal defining requirements for multi-project AgentHive support. It delegates design decisions to P300 (component), which contains the detailed architecture. Both are in DRAFT/new.

**Core idea:** One orchestrator, one Postgres instance, N projects. Each project gets its own database, git root, and proposal space. Agencies opt into projects. Shared infra stays centralized.

---

## 2. Relationship: P302 vs P300

| Proposal | Type | Role |
|----------|------|------|
| P302 | feature | Requirements + acceptance criteria (what to build) |
| P300 | component | Architecture decisions + design (how to build it) |

P302's `design` field says: "See P300 for detailed architecture decisions." This is valid for a feature/component split, but **P302 still needs its own AC** — currently missing.

P300's design document (441 lines) is comprehensive. It covers:
- One database per project (decided)
- Two-tier pool architecture (metaPool + projectPools)
- Project registry schema extension
- Agency project scoping via provider_registry
- Git root per project
- Discord routing (phased)
- Connection budget math (88/100 max_connections for 10 projects)
- Failure isolation per project
- 10 acceptance criteria (some marked DONE)

---

## 3. Issues Found

### 3.1 P302 has NO acceptance criteria
The `list_criteria` tool returns an error. P302's `alternatives` field is null and its `design` field only references P300. As a feature proposal, P302 MUST have its own AC defining what "done" means.

**Action:** Populate P302 AC. P300 section 10 defines 10 criteria — these should be mirrored or linked.

### 3.2 P302 has NO dependencies declared
P300 section 7.10 states: "P289 (provider_registry) must complete before P300 TypeScript work can start." But neither P302 nor P300 has a dependency on P289.

P289 status: DEVELOP/new (not complete). This is a real blocker.

**Action:** Add dependency P302 → P289 (blocks). The `squad_dispatch.project_id` population requires provider_registry to be live for the agency scoping filter.

### 3.3 P300 AC marked "DONE" are misleading
P300 section 10 says:
- AC-1: "projects extended with db_name, git_root... — DONE (migrations applied 2026-04-20)"
- AC-2: "proposal.project_id column exists — DONE"
- AC-4: "fn_claim_work_offer filters by project — DONE (p_project_id parameter added)"

I cannot verify these because the DB is unreachable from this session. But if they are truly done, they should be in a migration that's merged to main. The AC should reference the migration file.

**Risk:** If these are only in a worktree, not merged to main, the "DONE" claims are premature.

### 3.4 Missing: proposal.project_id population path
P300 section 9.1 documents fixing the INSERT gap in `handleStateChange()` and `dispatchImplicitGate()` — both need to populate `squad_dispatch.project_id` from the proposal. But P300 AC-5 says "Populated from proposal's project_id on all new dispatches" without verifying the code fix exists.

The design doc has the fix (subquery in INSERT), but it's unclear if this is implemented or just designed.

### 3.5 Missing: MCP tool project_id support
P300 section 7.3 says MCP tools need optional `project_id`. This is a cross-cutting change touching:
- `mcp_proposal` (create, list, get — all need project_id)
- `mcp_agent` (cubic_acquire — needs project_id for worktree selection)
- `mcp_project` (new actions for project CRUD)

This is substantial work not reflected in P302's AC.

### 3.6 Gate pipeline duplication concern
The design mentions both `hermes-gate-pipeline` and `agenthive-orchestrator` as separate pool consumers. Each creates independent connections. At 3 connections per pool per service per project, the math is tight:
- 2 services × 3 conn × N projects = 6N
- Plus metaPool: 6 connections
- 10 projects: 66 connections (safe under 100)
- But with `claude` user (limit 20), we're already constrained

**Question:** Does `claude` user's 20-connection limit apply per-database or globally? If global, the budget is very tight.

---

## 4. Design Quality Assessment

### Strengths
- **Two-tier pool architecture** is correct. Cross-project coordination tables (squad_dispatch, proposal_lease, agent_registry) stay in metaPool. Project-specific data (proposal, events, dependencies) in per-project pools.
- **Lazy pool creation** prevents connection storms at startup.
- **One DB per project** beats schema-per-project for isolation (no search_path confusion).
- **Backward compat** via project_id=1 default is non-breaking.
- **Failure isolation** per-project DB means one project's outage doesn't cascade.

### Concerns
- **Project creation is entirely manual** (SQL + migration replay). Until Phase 3's `db_create.sh` exists, onboarding a new project requires DBA-level steps. This limits adoption.
- **No cross-project dependencies** is documented but means P282 (federation) must solve this later. Acceptable for now.
- **Discord routing deferred** — shared channel with [PROJECT] prefix is minimal. Fine for v1.
- **Credential model unchanged** — shared `/home/xiaomi` creds. Per-project creds deferred to P282. Fine for now but must be documented as a security boundary limitation.

---

## 5. Recommended Actions Before Advancing to REVIEW

### Must Fix (blocking)
1. **Add AC to P302** — mirror P300 section 10 criteria, or link them explicitly
2. **Add dependency P302 → P289** — provider_registry must be complete
3. **Verify "DONE" claims in P300 AC** — confirm migrations are merged to main
4. **Clarify P302 scope** — is P302 the implementation or just requirements? Current title suggests implementation but design field defers to P300.

### Should Fix (quality)
5. **Add `claude` user connection limit** to AC budget analysis
6. **Document project onboarding procedure** (even if manual) in P302
7. **Define E2E test** — what does "two projects can run independently" look like concretely?

### Nice to Have
8. **Add MCP project CRUD** to Phase 3 scope in P302 AC
9. **Define project lifecycle states** (creating, active, draining, archived)

---

## 6. Dependency Graph

```
P281 (Resource hierarchy)     [COMPLETE]
  └── P289 (Provider registry) [DEVELOP] ← BLOCKER
        └── P300 (Component design) [DRAFT]
              └── P302 (Feature requirements) [DRAFT]
```

P289 is at DEVELOP/new. Until it reaches COMPLETE, P302 cannot begin implementation.

---

## 7. Gate Recommendation

**Decision: HOLD — Request Changes**

P302 is not ready for REVIEW because:
1. No acceptance criteria defined (blocking)
2. No dependency on P289 declared (blocking)
3. Unclear whether P300's "DONE" claims are real or aspirational
4. Scope ambiguity between P300 and P302

The design (in P300) is solid. The requirements document (P302) needs to be fleshed out before gate review.

---

## 8. Revised Acceptance Criteria (Proposed for P302)

1. `roadmap_workforce.projects` extended with `db_name`, `git_root`, `discord_channel_id`, `db_host`, `db_port`, `db_user`
2. `roadmap_proposal.proposal.project_id` column exists, NOT NULL DEFAULT 1
3. PoolManager in orchestrator with metaPool + per-project pools (lazy, capped at 10, idle reaping at 5min)
4. `fn_claim_work_offer` filters offers by agency's project subscriptions via `provider_registry`
5. `squad_dispatch.project_id` populated from proposal's project_id on all new dispatches
6. Worktree paths use project's `git_root` instead of hardcoded WORKTREE_ROOT
7. `dispatchAgent` uses `cubic_acquire`'s `worktree_path` instead of null
8. Backward compat: single-project mode unchanged (project_id=1, all existing data)
9. Connection budget: per-pool max=3, total for 10 projects ≤ 88 connections under default Postgres limits
10. E2E test: two projects run independently with separate DBs, git roots, and offer pipelines
11. P289 (provider_registry) must be COMPLETE before implementation begins
12. Project onboarding procedure documented (manual SQL for Phase 1-2; automated in Phase 3)
