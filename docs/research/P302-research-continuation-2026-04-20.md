# P302 Research Continuation — DRAFT Phase (2026-04-20)

**Researcher:** hermes-andy
**Proposal:** P302 — Multi-project architecture: one orchestrator, N projects, shared infra
**Phase:** DRAFT/new
**Task:** Continue research analysis for DRAFT phase

---

## 1. Current State Summary

| Item | Value |
|------|-------|
| Status | DRAFT |
| Maturity | new |
| Type | feature |
| AC count | 13 (3 waived, 10 pending) |
| Blocking deps | P289 (DEVELOP/new, unresolved) |
| Design reference | P300 (DEVELOP/new) |
| Architect verdict | HOLD — design STRONG |
| can_promote | FALSE (1 unresolved blocking dependency) |

## 2. Schema Readiness (DB Verified)

The multi-project schema migrations are **fully applied** despite P300 still being in DEVELOP:

| Component | Status | Evidence |
|-----------|--------|----------|
| projects table extended | DONE | db_name, git_root, discord_channel_id, db_host, db_port, db_user columns exist |
| proposal.project_id | DONE | NOT NULL DEFAULT 1, FK to projects |
| squad_dispatch.project_id | DONE | FK to projects |
| provider_registry table | DONE | 1 row exists (hermes/agency-xiaomi registered) |
| fn_claim_work_offer(p_project_id) | DONE | Parameter exists, DEFAULT NULL |

**Assessment:** Schema is production-ready for multi-project. The gap is purely application code (PoolManager, offer-provider filtering, agent-spawner git_root).

## 3. P289 Dependency Analysis (BLOCKING)

### What P289 provides
- provider_registry schema (DEPLOYED)
- Agency/worker identity separation
- OfferProvider heartbeat with provider_registry
- Worker self-registration flow

### Actual blocking status
P289 has all 7 ACs as "pending" but its schema migrations are applied. The remaining P289 work is:
- AC-2: Agency self-registration via OfferProvider upsert
- AC-3: Worker self-registration on spawn
- AC-4: squad_dispatch identity column population
- AC-5: detectProvider reads provider_registry
- AC-6: .env.agent file retirement
- AC-7: Integration test

**Critical insight:** P302 needs provider_registry schema (DONE) and fn_claim project_id parameter (DONE). P302 does NOT need P289's worker identity flow (AC-3/4/5/6). The blocking dependency is overstated — P302 can proceed with project scoping while P289 finishes worker identity in parallel.

### Risk assessment
- **Low risk:** Schema-level prereqs met, no conflict between P289 and P302 code paths
- **Medium risk:** If P289 changes fn_claim signature, P302's offer-provider calls may need updating
- **Mitigation:** Both proposals touch different code paths (P289 = worker identity, P302 = project scoping)

## 4. AC Quality Assessment

| AC | Description | Clarity | Testability | Notes |
|----|-------------|---------|-------------|-------|
| AC-1 | Orchestrator dispatches per project | Good | Medium | Core requirement, needs E2E test |
| AC-2 | Agencies join/leave projects | Good | High | WAIVED — provider_registry exists |
| AC-3 | Isolated git root per project | Good | High | Dir structure testable |
| AC-4 | Project registry connection metadata | Good | High | WAIVED — columns exist |
| AC-5 | Discord [PROJECT] prefix | Medium | Low | Visual only, defer automation |
| AC-6 | Idempotent project creation | Good | High | CRUD test |
| AC-7 | Cross-project deps blocked | Good | High | FK constraint test |
| AC-8 | Gate pipeline per-project | Good | Medium | Offer filtering test |
| AC-9 | Blast radius isolation | Good | High | Kill project_A DB, verify B |
| AC-10 | MCP tools accept project_id | Good | High | MCP call test |
| AC-11 | Project deletion lifecycle | Good | Medium | Complex cleanup, needs careful design |
| AC-12 | Connection budget v2 | Good | Medium | WAIVED — documented |
| AC-13 | E2E test suite | Good | High | Full pipeline test |

**AC quality: GOOD.** No duplicates (AC-9/AC-14 issue resolved). Clear, testable criteria. Three items waived where schema already satisfies the requirement.

## 5. Implementation Readiness

### What's ready
- Schema: All tables, columns, FKs, and functions deployed
- Design: 441-line P300 design doc with all 6 gate issues resolved
- Research: Three research passes completed
- Architect assessment: STRONG design, validated architecture

### What's not ready
- Application code: PoolManager, offer-provider project filter, agent-spawner git_root
- P289 completion: Worker identity flow not implemented
- E2E test: No test harness exists yet

### Implementation phases (validated)
| Phase | Effort | Content | Dependencies |
|-------|--------|---------|--------------|
| 1a (Migrations) | 2h | Extend projects, add proposal.project_id, backfill | NONE (done) |
| 1b (Code) | 4h | PoolManager, orchestrator project-aware startup | Phase 1a (done) |
| 2 (Routing) | 5h | fn_claim update, offer-provider, agent-spawner git_root | P289 schema (done) |
| 3 (Polish) | 4h | Discord prefix, MCP project_id, E2E test | Phase 2 |
| 4 (Migration) | 4h | Migrate existing AgentHive as project_id=1 | Phase 3 |
| **Total** | **~19h** | | |

## 6. Research Verdict

**P302 DRAFT is well-researched.** Three research passes, architect assessment, and schema verification confirm the design is sound and partially deployed.

### Recommendation: HOLD (same as architect)
P302 should NOT advance DRAFT→REVIEW until:

1. **P289 reaches COMPLETE or at minimum ACTIVE maturity** — even though schema prereqs are met, the blocking dependency must be formally resolved for can_promote to pass
2. **AC list is final** — current 13 ACs are clean, no action needed
3. **P300 design is formally approved** — reference document should be stable before P302 implementation begins

### Alternative: Partial unblock
If the team wants to proceed without waiting for P289 COMPLETE:
- Resolve the P289→P302 dependency (mark as "advisory" not "blocking")
- Accept risk that P289's fn_claim changes may require P302 code updates
- Begin Phase 1b (PoolManager) which has no P289 dependency

## 7. Files Referenced

- `/data/code/AgentHive/docs/design/P300-multi-project-architecture.md` — 441-line design doc
- `/data/code/AgentHive/docs/design/P302-architect-assessment-2026-04-20.md` — Architect HOLD
- `/data/code/AgentHive/docs/research/P302-research-findings.md` — Initial research
- `/data/code/AgentHive/docs/research/P302-research-hermes-andy-2026-04-20.md` — Second research pass
- MCP server: `http://127.0.0.1:6421/sse`
- DB: `agenthive@127.0.0.1:5432`
