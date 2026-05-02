# PIPELINE AUDIT: hiveCentral Migration + Umbrella Orchestration Alignment

**Date:** May 2, 2026  
**Scope:** 251 Non-Terminal Proposals in Development Pipeline  
**Analysis Period:** Current batch (158 DEVELOP, 3 REVIEW, 85 DRAFT; 98 obsolete, 150 new)  
**Status:** Active audit of architecture dependencies and sequencing

---

## EXECUTIVE SUMMARY

The 251-proposal pipeline is at a critical inflection point. **Seven foundation architecture proposals (P744–P747, P706, P798, P688)** must be finalized and merged before downstream adaptation can begin. The pipeline shows severe foundation lock, schema misalignment, and significant obsolete backlog.

### Key Metrics

- **Foundation Layer:** 8 architecture proposals → **0 merged** (BLOCKER)
- **Active Work:** 158 DEVELOP proposals depend on foundation decisions
- **Obsolete Backlog:** 98 marked obsolete (cleanup opportunity)
- **New Intake:** 150 new proposals (prioritize after foundation)

### Critical Path Summary

```
Week 1: P744–P747 (Umbrella) + P706 (vocab) → MERGE
Week 2: Codex-Claude handoff on schemas; identify migration gaps
Week 3: A/B/C workstreams (25 proposals) in parallel
Week 4: D-workstream + feature layer scoping
Week 5: Feature implementation + obsolete cleanup
```

### Risk Level

- **Foundation Lock:** 🔴 CRITICAL — P745 still DRAFT; 12+ proposals blocked
- **Schema Misalignment:** 🟡 HIGH — Control-plane/tenant split not finalized
- **Obsolete Drift:** 🟡 HIGH — 98 proposals stuck; safety review pending

---

## A. FOUNDATION LAYER: 7 Critical Architecture Proposals

| ID  | Title | Status | Maturity | Rework? | Blockers |
|-----|-------|--------|----------|---------|----------|
| **P744** | Umbrella A — Centralized Orchestrator | DEVELOP | new | Schema lock | P749–P754 |
| **P745** | Umbrella B — hiveCentral vNext data model | DEVELOP | new | ⚠️ DRAFT | P759–P768 |
| **P746** | Umbrella C — Agency Offline Detection | DEVELOP | new | Resilience | P761–P765 |
| **P747** | Umbrella D — Model Routing Restriction | DRAFT | new | Review | P767–P773 |
| **P706** | Unify state vocabulary (Hotfix→3-stage) | DEVELOP | new | Migrate | P774–P780 |
| **P798** | Multi-platform subscription model | DEVELOP | new | Split | P249 (pricing) |
| **P688** | AC2-verify: test architecture type | DEVELOP | new | ✅ Mark obsolete | None |

### Foundation Action Items

**Owner: Codex (Week 1)**

1. ✅ **P744 finalization:** Merge gate-pipeline + orchestrator; document simplified queue scanning
2. ✅ **P745 schema lock:** Finalize hiveCentral (control-plane) vs tenant DB split; document tables + ACLs
3. ✅ **P746 finalization:** Agency liveness + offline detection patterns
4. ✅ **P747 finalization:** Route eligibility filters (project/agency/role/budget)
5. ✅ **P706 finalization:** State vocabulary unification (drop Hotfix, 3-stage workflow)
6. ⚠️ **P688:** Mark as CANCELED (obsolete after testing architecture work)

**Gate:** All 5 umbrella proposals at MERGE status by EOW1

---

## B. CONTROL-PLANE PROPOSALS: 12 Depend on P745 Schema

| ID | Title | Status | Dependency | Effort |
|----|-------|--------|-----------|--------|
| **P820** | hiveCentral vNext control-plane model | DRAFT | P745 final | HIGH |
| **P788** | CLI operator domains (model, budget, route) | DEVELOP | P820 | MEDIUM |
| **P766** | Operator pause/resume/retire (liaison) | DEVELOP | P746 | MEDIUM |
| **P705** | Operator visibility dashboard (web) | DEVELOP | P820 | MEDIUM |
| **P659** | Operator-as-Gate-Agent write proxy | DEVELOP | P745 | HIGH |
| **P591** | Control-plane disaster recovery | DEVELOP | P745 + P758 | HIGH |
| **P589** | Operator auditing + compliance log | DEVELOP | P820 | MEDIUM |
| **P586** | Control-plane metrics + SLI dashboard | DEVELOP | P820 | MEDIUM |
| **P561** | Operator escalation matrix | DEVELOP | P605 | MEDIUM |
| **P507** | Audit trail for all operator actions | DEVELOP | P820 | MEDIUM |
| **P421** | Control-plane HA design | DEVELOP | P745 | HIGH |
| **P405** | Control-plane disaster recovery failover | DEVELOP | P745 | HIGH |

### Blocked Dependencies

- **P820 is the critical blocker.** Until hiveCentral schema is finalized (P745), P820 cannot define control-plane tables.
- **P788–P705:** Operator CLI/web surfaces depend on P820 schema stability.

### Control-Plane Action Items

**Owner: Claude (Week 2)**

1. 📋 Review P745 final schema; identify hiveCentral tables (roadmap_control vs roadmap_tenant split)
2. 📋 Design P820 schema (control-plane models, queries, ACLs)
3. 📋 Document migration path: operator tables from `agenthive` → `hiveCentral`

**Owner: Codex (Week 3+)**

4. ✅ Implement P820 after schema approved
5. ✅ Begin P788, P705, P659 scoping (but delay implementation until P820 locked)
6. ✅ Coordinate P591 disaster recovery design with P745 replication strategy

---

## C. TENANT-DB PROPOSALS: 6 Depend on P745 Tenant Schema

| ID | Title | Status | Dependency | New Tables |
|----|-------|--------|-----------|-----------|
| **P768** | Agency route policy schema + seed | DEVELOP | P745 tenant schema | `agency_route_policy` |
| **P767** | Project route policy schema + seed | DEVELOP | P745 tenant schema | `project_route_policy` |
| **P764** | Tenant-aware agency capacity | DEVELOP | P765 + P768 | Query via scope |
| **P760** | Project capacity config schema + seed | DEVELOP | P745 tenant schema | `project_capacity_config` |
| **P759** | Code rewire: getPool() → router | DEVELOP | P758 | N/A (high-risk refactor) |
| **P758** | Tenant-DB provisioning + registry | DEVELOP | P745 tenant schema | `hiveCentral.project` |
| **P601** | Tenant lifecycle control | DEVELOP | P758 | N/A (workflows) |

### Critical Dependency Chain

```
P745 (tenant schema) → P758 (provisioning) → P759 (getPool rewire) → P764
```

### Tenant-DB Action Items

**Owner: Claude (Week 2)**

1. 📋 Design tenant-DB schema (per-project tables, ACLs, isolation)
2. 📋 Identify all `getPool()` callers in codebase (input for P759)
3. 📋 Document provisioning flow (project creation → new tenant DB)

**Owner: Codex (Week 3+)**

4. ✅ Implement P758 (tenant provisioning) after schema lock
5. ✅ Implement P759 in phases:
   - **Phase 1 (low-risk):** Refactor isolated getPool() callers
   - **Phase 2 (high-risk):** Rewrite hot paths with staged rollout
6. ✅ Implement P760, P764, P768, P767 (schemas + policies)

---

## D. DISPATCH/ROUTING: 31 Depend on P744 Orchestrator

The umbrella introduces **unified queue scanner** + **role-aware dispatch**. Work divided into **A–D workstreams**.

### A-Workstream: Orchestrator Core (7 proposals)

| ID | Title | Status | Dependency | Schema |
|----|-------|--------|-----------|--------|
| **P754** | Decommission agenthive-gate-pipeline.service | DEVELOP | P752 | Drop old cron |
| **P753** | Retire transition_queue | DEVELOP | P744 + P751 | Migrate + drop |
| **P752** | Orchestrator wake-ups + offer reaper | DEVELOP | P744 | Maintenance cron |
| **P751** | Readiness scoring + role selection | DEVELOP | P748 | Query queue_role_profile |
| **P750** | Lease-based single-flight + recovery | DEVELOP | P748 | New lease tracking |
| **P749** | Queue context resolver | DEVELOP | P748 | Bind state + roles |
| **P748** | Queue-role profile schema | DEVELOP | P744 | `queue_role_profile` table |

### B-Workstream: Provisioning (6 proposals)

- **P760:** Project capacity config schema
- **P759:** Code rewire (getPool routing)
- **P758:** Tenant-DB provisioning + registry
- **P757/P756/P755:** All OBSOLETE (pre-P745 architecture)

### C-Workstream: Agency Resilience (6 proposals)

| ID | Title | Status | Dependency |
|----|-------|--------|-----------|
| **P766** | Operator liaison pause/resume/retire | DEVELOP | P765 + P746 |
| **P765** | Auto-recovery + scope-aware alerting | DEVELOP | P761 |
| **P764** | Tenant-aware agency capacity | DEVELOP | P768 + P761 |
| **P763** | Spawn-failure counter → TypeScript | DEVELOP | P761 |
| **P761** | Agency liveness state (TypeScript) | DEVELOP | P746 |
| **P762** | (DROPPED) Heartbeat cron | DRAFT | Obsolete |

### D-Workstream: Model Routing (7 proposals)

| ID | Title | Status | Dependency | New Tables |
|----|-------|--------|-----------|-----------|
| **P773** | Fallback chain (route throttle) | DEVELOP | P747 + P771 | N/A |
| **P772** | Route decision log audit | DEVELOP | P747 | `route_decision_log` |
| **P771** | Extend resolveModelRoute() (4 filters) | DEVELOP | P747 | N/A |
| **P770** | Per-(project, route) token-budget | DEVELOP | P767 | `model_route_token_budget` |
| **P769** | Queue-role route constraints | DEVELOP | P768 | N/A |
| **P768** | Agency route policy schema | DEVELOP | P745 tenant schema | `agency_route_policy` |
| **P767** | Project route policy schema | DEVELOP | P745 tenant schema | `project_route_policy` |

### Dispatch/Routing Action Items

**Owner: Codex (Weeks 3–4)**

1. ✅ **Week 3:** Implement A-workstream (P748–P754) in parallel
2. ✅ **Week 3:** Implement B-workstream (P758–P760) in parallel
3. ✅ **Week 3:** Implement C-workstream (P761–P766) in parallel
4. ✅ **Week 4:** Implement D-workstream (P767–P773) after routing finalized

---

## E. FEATURE LAYER: 30+ Proposals (Secondary Priority)

Feature work depends on **P745 schema lock** + **P706 state vocabulary finalization**. Recommend **design/scoping now** but **delay implementation** until foundations locked.

### Pricing & Cost (4 proposals)

| ID | Title | Status | Blocked By | Effort |
|----|-------|--------|-----------|--------|
| **P249** | Cost consolidation schema | DEVELOP | P745 model_metadata | HIGH |
| **P248** | Pricing structure + multi-tenant | DEVELOP | P249 | HIGH |
| **P246** | Cost column to execution trace | DEVELOP | P249 | MEDIUM |
| **P236** | Budget enforcement + tracking | DEVELOP | P249 + P760 | HIGH |

### Board & Workflow (8 proposals)

| ID | Title | Status | Blocked By | Effort |
|----|-------|--------|-----------|--------|
| **P776** | Web Board — Workflow filter + columns | DEVELOP | P706 + P775 | MEDIUM |
| **P777** | TUI Board — Workflow filter + redesign | REVIEW | P706 | MEDIUM |
| **P775** | Workflow-stages registry loader | DEVELOP | P706 | MEDIUM |
| **P774** | Workflow vocab migration | DEVELOP | P706 | HIGH |
| **P802** | Dashboard gap report | DEVELOP | P775 | LOW |
| **P238** | Board visualization (dispatch) | DEVELOP | P748 + P751 | MEDIUM |

### Governance (6 proposals)

- **P780:** CONVENTIONS.md + agentGuide.md updates (P706)
- **P779:** CI guard — flag legacy state literals (P706)
- **P778:** Gate-evaluator verdicts → obsolete_reason (P706 + P605)
- **P606:** Decision log consensus protocol (P605)
- **P181–P188:** Team/agent/governance (6 proposals, P605)

### Feature Layer Action Items

**Owner: Claude + Codex (Week 2–3)**

1. 📋 **Design/RFC:** Pricing schema (P249), board layout (P774–P776)
2. 📋 **Scoping:** Governance vocabulary (P778–P780)

**Owner: Codex (Week 4+)**

3. ✅ **Implement P774** (vocabulary migration) after P706 merged
4. ✅ **Implement P249** (pricing schema) after P745 locked
5. ✅ **Batch implement** (P248, P236, P776–P780) Weeks 4–5

---

## F. OBSOLETE PROPOSALS: 98 Candidates (Cleanup Opportunity)

| Count | Status | Action |
|-------|--------|--------|
| **4** | DEVELOP | Batch → CANCELED |
| **3** | DRAFT | Batch → CANCELED |
| **98** | Mixed | Safety review + transition |

### Obsolete Samples

- **P787:** Runtime endpoint resolution (done in P449/P431)
- **P762:** Heartbeat cron (replaced by P746 liaison)
- **P757–P755:** Old control-plane migration (superseded by P745)

### Cleanup Action Items

**Owner: Codex (Week 5)**

1. 📋 Sample review: 15 obsolete proposals; confirm no hidden dependencies
2. ✅ Batch transition: Mark 98 as CANCELED with `obsoleted_reason = "Superseded by P744–P747 architecture"`
3. 📋 Update CONVENTIONS.md §7 (proposal maturity states)

---

## DEPENDENCY GRAPH: Critical Path

```
┌─── P744 (Orchestrator) ──┐
│                            ├─ P748–P754 (A-workstream) 
│                            ├─ P759 (getPool rewire)
│
├─── P745 (hiveCentral Schema) ──┐
│                                ├─ P758–P760 (Provisioning)
│                                ├─ P768–P767 (Route policies)
│                                ├─ P820 (Control-plane model)
│                                ├─ P249 (Pricing schema)
│
├─── P746 (Agency Offline) ──┐
│                            ├─ P761–P765 (C-workstream)
│
├─── P747 (Model Routing) ──┐
│                          ├─ P767–P773 (D-workstream)
│
└─── P706 (State Vocabulary) ──┐
                              ├─ P774–P780 (Board/governance)

CRITICAL SEQUENCING:
P744 → merge (P748–P754)
P745 → merge (P758–P760, P768–P767, P820)
P746 → merge (P761–P765)
P747 → merge (P767–P773)
P706 → merge (P774–P780)
```

---

## SEQUENCING PLAN: 5-Week Roadmap

### Week 1: Foundation Architecture Lock

**Owner:** Codex  
**Duration:** 5 business days

**Milestones:**
- [ ] P744 design review + merge
- [ ] P745 schema finalization (control + tenant split)
- [ ] P746 design review + merge
- [ ] P747 design review + merge
- [ ] P706 vocabulary finalization + merge

**Gate:** 5 proposals at MERGE status

**Unlock:** 25+ downstream proposals

---

### Week 2: Schema Coordination & Handoff

**Owners:** Codex + Claude  
**Duration:** 5 business days

**Codex:**
- [ ] Document P744–P747 changes (simplified orchestration)
- [ ] Identify proposals that become obsolete post-P745
- [ ] Prepare code review docs

**Claude:**
- [ ] Review P745 + P820 schemas; flag control-plane gaps
- [ ] Design tenant-DB schema (tables, ACLs)
- [ ] Identify model_metadata changes (P249)

**Gate:** P745 schema approved + documented

**Unlock:** Adaptation work (A/B/C workstreams)

---

### Week 3: Parallel Implementation (A, B, C Workstreams)

**Owner:** Codex (parallel)  
**Duration:** 5 business days

**A-Workstream (P748–P754):** Orchestrator core
- [ ] P748 (queue-role schema)
- [ ] P749–P751 (queue context, role selection, readiness)
- [ ] P750, P752–P754 (lease, wake-ups, cleanup)

**B-Workstream (P758–P760):** Provisioning
- [ ] P758 (tenant-DB provisioning)
- [ ] P760 (project capacity)
- [ ] P759 audit (identify getPool callers)

**C-Workstream (P761–P765):** Agency resilience
- [ ] P761 (liveness state)
- [ ] P763 (spawn counter)
- [ ] P765–P766 (auto-recovery, operator surface)

**Gate:** All 16 proposals at REVIEW status

**Unlock:** D-workstream implementation

---

### Week 4: D-Workstream + Feature Scoping

**Owner:** Codex (routing) + Claude (features)  
**Duration:** 5 business days

**D-Workstream (P767–P773):** Model routing
- [ ] P768–P770 (route policies, budgets)
- [ ] P771–P772 (resolveModelRoute, audit)
- [ ] P773 (fallback chain)

**Feature Layer (Scoping):**
- [ ] P249 (pricing): RFC + schema
- [ ] P774–P776 (board): Scoping + design
- [ ] P788 (operators): Depends on P820
- [ ] P759 Phase 1 (getPool): Low-risk rewires

**Gate:** D-workstream at REVIEW; feature RFCs done

**Unlock:** Feature implementation

---

### Week 5: Feature Implementation + Cleanup

**Owner:** Codex + Claude  
**Duration:** 5 business days

**Feature Implementation:**
- [ ] P774 (state vocabulary migration)
- [ ] P249 (pricing schema implementation)
- [ ] P788–P705 (operator surfaces)
- [ ] P759 Phase 2 (high-risk rewires)

**Cleanup:**
- [ ] Review 98 obsolete proposals (sample 15)
- [ ] Batch transition to CANCELED
- [ ] Update CONVENTIONS.md §7

**Gate:** Feature proposals at DEVELOP/REVIEW; obsolete cleanup done

---

## RECOMMENDATIONS

### Codex (High Priority)

1. ✅ **Week 1:** Finalize + merge P744–P747 (umbrella architecture)
   - Any simplification vs old system that affects downstream?
   - Identify obsolete proposals that don't need rework

2. ✅ **Week 1:** Finalize + merge P706 (state vocabulary)
   - Gate: All board/workflow (P774–P780) must align

3. ✅ **Weeks 3–5:** Implement A/B/C/D workstreams (31 proposals)

4. 📋 **Week 5:** Coordinate obsolete cleanup (98 proposals → CANCELED)

### Claude (High Priority)

1. 📋 **Week 2:** Review P745 + P820 schemas
   - Control-plane tables (hiveCentral vs agenthive)
   - Tenant-DB schema (per-project isolation)

2. 📋 **Week 2:** Design tenant provisioning flow (P758)
   - Project creation → new tenant DB
   - getPool routing topology

3. 📋 **Week 4:** Coordinate feature layer
   - Pricing schema (P249): New table or new columns?
   - Board/governance: Dependencies on P706?

---

## SUCCESS CRITERIA

- [ ] **Week 1:** Foundation (P744–P747, P706) merged; 25+ proposals unblocked
- [ ] **Week 2:** Schema coordination complete; Codex–Claude handoff done
- [ ] **Week 3:** 16 A/B/C proposals at REVIEW status
- [ ] **Week 4:** D-workstream ready; feature RFCs approved
- [ ] **Week 5:** All 251 proposals have defined phases; obsolete cleanup done; 98 CANCELED

---

## RISK REGISTER

| Risk | Impact | Probability | Mitigation |
|--|--|--|--|
| P745 schema changes late | Cascading rework (12 proposals) | MEDIUM | Lock schema EOW1; freeze updates |
| P759 (getPool) high-risk | Production instability | HIGH | Phase 1 (safe), Phase 2 (staged) |
| P747 complexity underestimated | D-workstream slips | MEDIUM | Start design Week 2; parallel |
| Obsolete cleanup missed safety | Accidentally CANCELED live proposals | MEDIUM | Manual sample (15); audit trail |
| Feature layer assumes old schema | Rework post-P745 | MEDIUM | Delay implementation until locked |

---

**Prepared by:** Strategic Audit  
**Distribution:** Codex, Claude, Architecture Team  
**Review:** Weekly sync on progress vs sequencing plan  
**Next Steps:** Codex initiates Week 1 foundation sprint (P744–P747)
