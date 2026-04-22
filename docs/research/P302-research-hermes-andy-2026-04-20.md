# P302 Research Analysis — hermes-andy (2026-04-20)

**Proposal:** P302 — Multi-project architecture: one orchestrator, N projects, shared infra
**Phase:** DRAFT/new
**Role:** researcher
**Agent:** hermes-andy

---

## 1. Current State

| Item | Value |
|------|-------|
| Status | DRAFT |
| Maturity | new |
| Type | feature |
| Acceptance Criteria | 14 items (all pending) |
| Dependencies | P289 (blocks), P300 (design reference) |
| Architect Verdict | HOLD — design STRONG |
| Existing Research | P302-research-findings.md (hermes-andy, earlier today) |

## 2. Schema Readiness (DB Verified)

The P300 design migrations are **partially applied** — several "implementation" items are already done despite P300 still being in DEVELOP:

| Component | Status | Evidence |
|-----------|--------|----------|
| projects table extended | DONE | db_name, git_root, discord_channel_id, db_host, db_port, db_user columns exist |
| proposal.project_id | DONE | NOT NULL DEFAULT 1, FK to projects |
| provider_registry table | DONE | 8 columns including agency_id, project_id, capabilities |
| fn_claim_work_offer(project_id) | DONE | p_project_id parameter exists (DEFAULT NULL) |
| fn_activate_work_offer(worker) | DONE | p_worker_identity parameter exists |

**Gap:** The orchestrator code (pool.ts, offer-provider, agent-spawner) has NOT been updated to use these schema changes. PoolManager doesn't exist yet. The schema is ready; the application code needs wiring.

## 3. Dependency Analysis

### P289 — Pull-Based Work Dispatch (BLOCKING)

P289 status: DEVELOP/new. But its schema migrations are applied (provider_registry exists, fn_claim has project_id). The remaining P289 work is:
- AC-2: Agency self-registration via MCP
- AC-3: OfferProvider heartbeat with provider_registry
- AC-4: Worker registration flow
- AC-5-7: Coordinator variant, lease renewal, monitoring

**Assessment:** P289's blocking nature is overstated. The schema pieces P302 needs (provider_registry, project_id on claims) are already deployed. P302 can proceed with implementation while P289 finishes its remaining AC in parallel, as long as the provider_registry schema stays stable.

### P300 — Design Component

P300 is DEVELOP/new. Its design decisions are validated by the architect. The design doc (441 lines) covers all architecture questions. P300 does NOT need to reach COMPLETE for P302 to advance — P302 references P300's design, P300's AC are documentation-focused.

### Cubic-Worktree Disconnect

P300 AC-7 claims this is verified fixed. Need confirmation from code review that dispatchAgent uses cubic_acquire worktree_path.

## 4. Acceptance Criteria Analysis

| AC | Description | Clarity | Testability | Issue |
|----|-------------|---------|-------------|-------|
| AC-1 | Orchestrator dispatches per project | Good | Medium | Need E2E test definition |
| AC-2 | Agencies join/leave projects | Good | High | provider_registry exists |
| AC-3 | Isolated git root per project | Good | High | Dir structure testable |
| AC-4 | Project registry connection metadata | Good | High | Columns exist |
| AC-5 | Discord [PROJECT] prefix | Medium | Low | Visual only, hard to automate |
| AC-6 | Idempotent project creation | Good | High | CRUD test |
| AC-7 | Cross-project deps blocked | Good | High | FK constraint test |
| AC-8 | Gate pipeline per-project | Good | Medium | Offer filtering test |
| AC-9 | Blast radius isolation | Good | High | Kill project_A DB, verify B |
| AC-10 | MCP tools accept project_id | Good | High | MCP call test |
| AC-11 | Project deletion lifecycle | Good | Medium | Complex cleanup test |
| AC-12 | Connection budget v2 | Good | Medium | Pool max config test |
| AC-13 | E2E test suite | Good | High | Full pipeline test |
| AC-14 | Blast radius isolation | DUPLICATE | DUPLICATE | **Identical to AC-9** |

**Issue: AC-9 and AC-14 are identical.** AC-14 should be removed or differentiated.

## 5. Identified Issues

### 5.1 Duplicate AC-9/AC-14
AC-9 and AC-14 both state: "Blast radius isolation: if project_A DB is down, project_B proposals still dispatch and complete normally." AC-14 must be removed or replaced with a unique criterion.

### 5.2 Schema-Code Gap
The DB schema is ahead of the application code. Migrations exist but TypeScript code hasn't been updated. This means:
- PoolManager doesn't exist yet (pool.ts still uses singleton getPool())
- OfferProvider doesn't filter by project_id
- Agent spawner doesn't use project git_root
- MCP tools don't accept project_id parameter

### 5.3 P289 Parallel Risk
If P302 proceeds while P289 is still in DEVELOP, there's a risk that P289's final changes could conflict with P302's code. Mitigation: both proposals touch different code paths (P289 = worker identity flow, P302 = project scoping).

### 5.4 Connection Budget with claude User
AC-12 mentions "Pool max reduced to 2 per service when claude user is active." The current claude connection limit is 20 (from memory). With 10 projects × 2 services × 2 conns = 40 + metaPool(6) + overhead(4) = 50. This exceeds the 20 limit. Need to verify the actual constraint or adjust pool sizing.

## 6. Research Verdict

**P302 is NOT ready for DRAFT→REVIEW advancement.** Blocking items:

1. **AC cleanup required:** Remove duplicate AC-14 or differentiate from AC-9
2. **Connection budget math:** Verify claude user 20-conn limit against AC-12 formula
3. **P289 dependency:** Schema pieces are deployed but P289 is not COMPLETE. Risk is manageable but must be acknowledged.

**Recommended next steps:**
1. Clean up AC: remove AC-14 duplicate, add clarity to AC-5
2. Verify connection budget math with actual Postgres max_connections and claude user limits
3. Confirm cubic-worktree disconnect fix in code
4. Set maturity to 'active' to signal this is being worked on
5. When AC cleanup is done, advance DRAFT→REVIEW

**NOT blocking but worth noting:**
- P300 design doesn't need to reach COMPLETE — it's a reference document
- Schema-code gap is normal: schema-first migration pattern
- P289 parallel risk is manageable with proper branch isolation

## 7. Files Referenced

- `/data/code/AgentHive/docs/design/P300-multi-project-architecture.md` — 441-line design doc
- `/data/code/AgentHive/docs/design/P302-architect-assessment.md` — HOLD verdict, STRONG design
- `/data/code/AgentHive/docs/research/P302-research-findings.md` — Earlier research pass
- `/data/code/AgentHive/docs/plans/2026-04-20-P300-multi-project-implementation.md` — Implementation plan
- MCP server: `http://127.0.0.1:6421/sse`
- DB: `agenthive@127.0.0.1:5432`
