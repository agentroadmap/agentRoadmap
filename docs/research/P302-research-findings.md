# P302 Research Findings — Multi-Project Architecture (Feature)

**Researcher:** hermes-andy  
**Date:** 2026-04-20  
**Phase:** DRAFT → design  
**Proposal:** P302 (Feature)

---

## 1. Proposal Summary

P302 is a FEATURE proposal defining requirements for multi-project support in AgentHive. It references P300 (Component) for detailed architecture decisions. P302 defines the "what" — P300 defines the "how".

## 2. Current State Assessment

| Item | Status | Notes |
|------|--------|-------|
| P302 status | DRAFT/new | 13 AC defined, design documented |
| P302 AC | 13 items | Adopted from P300 + additions (AC-11 deletion lifecycle, AC-12 connection budget v2, AC-13 E2E test) |
| P302 deps | P289 (blocks) | P289 is DEVELOP/new — not done |
| P300 design | DEVELOP/active | Comprehensive 441-line design doc |
| P300 review | HOLD (6 issues) | All 6 issues addressed in section 9 of design doc |
| Architect assessment | HOLD | Design STRONG, blocked on P289 |
| Existing review | request_changes | From hermes-andy — AC consolidation needed |

## 3. Dependency Analysis

### 3.1 P289 (BLOCKS P302)
- **Status:** DEVELOP/new  
- **Title:** Pull-Based Work Dispatch & Provider Registration  
- **What it provides:** provider_registry table, offer/claim/lease pipeline  
- **Why P302 needs it:** Multi-project agency scoping relies on provider_registry for project subscriptions  
- **Risk:** P289 not complete = P302 cannot implement agency scoping  

### 3.2 P300 (Design Reference)
- **Status:** DEVELOP/active  
- **Relationship:** P300 provides architecture decisions, P302 provides implementation requirements  
- **Current gap:** P300 should be reviewed/approved before P302 advances to DEVELOP  

### 3.3 P281 (Indirect)
- **Cubic-worktree disconnect:** Must be fixed before P302 implementation  
- **Status:** Referenced in P300 design as prerequisite  

## 4. Architecture Research (from P300 Design)

### 4.1 Core Decisions (Verified Sound)

| Decision | Approach | Rationale |
|----------|----------|-----------|
| DB isolation | One DB per project | Cleaner than schema-per-project. Follows Postgres conventions. |
| Project registry | Extend existing `projects` table | `roadmap_workforce.projects` exists; extending beats creating. |
| Connection pooling | PoolManager with meta + per-project pools | Lazy creation, cap at 10, idle reaping at 5min. |
| Agency scoping | Via provider_registry | Reuses P289 registry. Natural join point. |
| Credentials | Shared /home/xiaomi for now | P282 federation handles per-project. YAGNI applies. |
| Discord routing | [PROJECT] prefix, shared channel | Pragmatic phase 1. Per-project channels when count > 3. |

### 4.2 Table Routing Architecture

```
metaPool (agenthive DB):
  - squad_dispatch, proposal_lease
  - host_model_policy, model_routes
  - agent_registry, provider_registry
  - projects (registry)

projectPool (per-project DB):
  - proposal, proposal_event
  - proposal_dependencies
  - workforce data
  - efficiency data
```

**Why squad_dispatch stays central:** The offer/claim/lease pipeline is inherently cross-project coordination. Keeping it centralized avoids multi-DB polling.

### 4.3 Connection Budget (v2)

```
Per-DB connections:
  orchestrator pool:  max 3
  gate-pipeline pool: max 3
  CLI tools:          max 2
  Per-DB total:       max 8

10 projects: 8 + (10 × 8) = 88 connections
Postgres default max_connections = 100 → safe margin

claude user global limit: 20 connections
Pool max reduced to 2 per service when claude user is active
```

## 5. Acceptance Criteria (Current — 13 items)

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | Orchestrator dispatches proposals per project context | pending |
| AC-2 | Agencies join/leave projects via provider_registry | pending |
| AC-3 | Each project has isolated git root and worktree directory | pending |
| AC-4 | Project registry stores connection metadata | pending |
| AC-5 | Discord gateway routes with [PROJECT] prefix | pending |
| AC-6 | New project creation is idempotent | pending |
| AC-7 | Cross-project proposals blocked by default | pending |
| AC-8 | Gate pipeline operates per-project | pending |
| AC-9 | Blast radius isolation (project_A DB down, project_B unaffected) | pending |
| AC-10 | MCP tools accept optional project_id | pending |
| AC-11 | Project deletion lifecycle (cancel proposals, release leases, expire cubics, archive DB) | pending |
| AC-12 | Connection budget v2: 6N+10, claude limit enforced | pending |
| AC-13 | E2E test: create project B, register agency, dispatch, verify isolation | pending |

## 6. Identified Gaps & Risks

### 6.1 P289 Dependency Not Met
**Severity:** BLOCKING  
**Impact:** P289 (provider_registry) is DEVELOP/new — not complete. P302 cannot implement agency scoping without it.  
**Action:** Wait for P289 to reach COMPLETE, or implement with mock/placeholder.

### 6.2 P300 Not Approved
**Severity:** WARNING  
**Impact:** P300 is DEVELOP/active. Design decisions may change during review.  
**Action:** P300 should advance to DEVELOP before P302 begins implementation.

### 6.3 Cubic-Worktree Disconnect
**Severity:** PREREQUISITE  
**Impact:** `dispatchAgent()` ignores cubic's `worktree_path`. Multi-project needs cubic to supply worktree path.  
**Resolution:** P300 design section 9.6 documents this fix.

### 6.4 AC Consolidation with P300
**Severity:** REVIEW  
**Impact:** Existing review notes AC overlap between P300 and P302. P302's AC-2/4/6/9 duplicate P300 items. Should be cleaned.  
**Action:** Remove duplicate AC, keep P302 AC unique to feature requirements.

### 6.5 Pool Bootstrap Gap
**Severity:** DESIGN  
**Impact:** How does the orchestrator know about projects at startup? The current singleton `getPool()` has no project awareness.  
**Resolution:** P300 design section 9.2 addresses this with two-tier PoolManager.

## 7. Implementation Phases (from P300, validated)

| Phase | Scope | Effort |
|-------|-------|--------|
| 1a (Migrations) | Extend projects table, add proposal.project_id, backfill | ~2h |
| 1b (Code) | PoolManager in pool.ts, orchestrator project-aware startup | ~4h |
| 2 (Routing) | fn_claim update, offer-provider project filter, agent-spawner git_root | ~5h |
| 3 (Polish) | Discord [PROJECT] prefix, MCP project_id param, E2E test | ~4h |
| 4 (Migration) | Migrate existing AgentHive as project_id=1, backward compat | ~4h |
| **Total** | | **~19h** |

## 8. Research Verdict

**P302 is NOT ready for DRAFT→REVIEW advancement.** Blocking items:

1. P289 dependency incomplete (DEVELOP/new)
2. AC consolidation with P300 needed (existing review)
3. P300 design not yet approved (design may change)

**Recommended next steps:**
1. Wait for P289 to reach COMPLETE or ACTIVE maturity
2. Clean up AC overlap with P300 per existing review
3. Wait for P300 to advance past REVIEW
4. Then advance P302 DRAFT→REVIEW with confidence

## 9. Files Referenced

- `docs/design/P300-multi-project-architecture.md` — Architecture decisions (441 lines)
- `docs/design/P300-multi-project-review.md` — Architectural review with 6 issues (all resolved)
- `docs/design/P302-architect-assessment.md` — Architect HOLD assessment
- MCP server: `http://127.0.0.1:6421/sse`
- Related migrations: `039-p281-claim-renew-reap-functions.sql`, `041-p289-agency-worker-separation.sql`
- Related code: `src/infra/postgres/pool.ts`, `src/core/pipeline/offer-provider.ts`, `src/core/orchestration/agent-spawner.ts`
