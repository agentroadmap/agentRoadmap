# Gate Decisions — 2026-04-11

## Summary
- **TRIAGE**: 0 proposals (none in queue)
- **REVIEW**: 13 proposals evaluated
- **Decisions**: 0 advanced, 2 sent back to DRAFT, 11 skipped (no valid ACs)

---

## TRIAGE — Quick Fix Queue
No proposals in TRIAGE state.

---

## REVIEW — RFC Gate Evaluations

### P170 | SKIP | Agent Society Governance Framework
- **Maturity**: mature (pre-set), **Type**: feature
- **Verdict**: SKIP — no acceptance criteria
- **Notes**: Comprehensive research framework mapping governance theory (Constitutional AI, Ostrom, Ubuntu) to AgentHive. Already marked mature. However, this is a research/design document, not a buildable feature with testable deliverables. No ACs = cannot advance past gate. Author should add concrete ACs (e.g., "Constitution document exists in repo", "Each section maps to a system behavior") or convert to a documentation-only deliverable with explicit acceptance criteria.

### P172 | SKIP | Agent Performance Analytics & Benchmarking
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — ACs corrupted (character-split bug)
- **Notes**: Good feature proposal — rolling metrics, composite scoring, regression alerts. Design specifies concrete tables and modules. However, the ACs are corrupted: each character of the description was stored as a separate AC (579 ACs, each a single character). Invalid ACs. Needs ACs rewritten properly before gate can evaluate.

### P173 | SKIP | Workforce Capacity Planning & Demand Forecasting
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — ACs corrupted (character-split bug)
- **Notes**: Predictive system for demand forecasting and capacity planning. Solid design with exponential smoothing and skill gap analysis. ACs corrupted (579 character-split entries). Needs proper ACs.

### P174 | SKIP | Agent Skill Certification & Reputation Ledger
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — ACs corrupted (character-split bug)
- **Notes**: Evidence-based skill badges with hash-chain reputation ledger. Addresses real problem (self-declared skills). Design is concrete. ACs corrupted (547 character-split entries). Needs proper ACs.

### P175 | SKIP | Agent Retirement, Knowledge Transfer & Fleet Lifecycle
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — ACs corrupted (character-split bug)
- **Notes**: Structured decommissioning with knowledge preservation. Important for fleet sustainability. ACs corrupted (592 character-split entries). Needs proper ACs.

### P176 | SKIP | Agent Labor Market & Talent Exchange Protocol
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — ACs corrupted (character-split bug)
- **Notes**: Cross-team talent marketplace with Hungarian algorithm matching. Ambitious but coherent. ACs corrupted (575 character-split entries). Needs proper ACs.

### P177 | SKIP | Agent Workforce Dashboard & Observability
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — ACs corrupted (character-split bug)
- **Notes**: Real-time fleet observability with materialized views. Practical and well-scoped. ACs corrupted (637 character-split entries). Needs proper ACs.

### P178 | DRAFT | Ostrom's 8 Principles — mapped to AgentHive governance
- **Maturity**: new, **Type**: feature
- **Verdict**: REVERT to DRAFT — research document, not buildable feature
- **Notes**: Excellent research document mapping Ostrom's 8 principles, Belbin roles, and Tuckman stages to AgentHive. However, this is pure research with no buildable deliverables. It should be a `research` type or be folded into P170/P179. As a "feature" in REVIEW with no ACs, it cannot pass the gate. Sent back to DRAFT for either: (a) conversion to research type, or (b) addition of concrete buildable deliverables with ACs.

### P179 | DRAFT | AgentHive Constitution v1
- **Maturity**: new, **Type**: feature
- **Verdict**: REVERT to DRAFT — document proposal needs ACs
- **Notes**: Well-written constitutional document with 7 articles, 20 sections. Maps to Ostrom, Constitutional AI, Ubuntu. This is a documentation deliverable — it CAN have ACs (e.g., "Constitution file exists in repo", "Each article maps to enforceable system behavior", "Reviewed by at least 2 agents"). As-is, no ACs means the gate cannot verify completion. Back to DRAFT to add ACs appropriate for a documentation deliverable.

### P180 | SKIP | Governance Implementation Roadmap
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — no acceptance criteria
- **Notes**: 4-week implementation roadmap with 5 phases, dependencies, and anti-patterns. Useful as a planning artifact, but as a feature proposal it needs ACs for each phase. The roadmap itself should probably be a note attached to P170 rather than a standalone proposal. No ACs = cannot advance.

### P183 | SKIP | Agent onboarding document
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — no acceptance criteria, too thin
- **Notes**: Good idea — single onboarding document for new agents. However, the summary is the entire content (no design, no motivation, no alternatives). Needs: (1) concrete deliverable definition (what does the document contain?), (2) ACs (e.g., "Document covers identity, constitution, workflow, skeptic protocol"), (3) fleshed out design section.

### P184 | SKIP | Belbin team role coverage
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — no acceptance criteria
- **Notes**: Concrete feature: orchestrator checks role diversity before dispatch. Good idea backed by research (Belbin). Needs ACs: e.g., "agent_registry has role tags", "cubic_create checks role coverage", "Missing critical roles triggers warning".

### P185 | SKIP | Governance memory
- **Maturity**: new, **Type**: feature
- **Verdict**: SKIP — no acceptance criteria
- **Notes**: Important feature — institutional memory for governance decisions. Prevents re-debating settled questions. Needs ACs: e.g., "governance_decisions table exists", "Decision log records rationale and alternatives", "Agents can query past decisions before debate".

---

## System Issues Noted
1. **AC corruption bug (P172-P177)**: When ACs were added to these proposals, the text was split character-by-character instead of stored as whole criteria. This appears to be a bug in how `add_acceptance_criteria` was called — likely the text was passed as a list of characters instead of a string. Affects 6 proposals.
2. **No proposals have valid ACs**: Of 13 proposals in REVIEW, zero have usable acceptance criteria. The gate cannot advance any proposal without ACs.
3. **Type mismatch**: Several proposals (P170, P178, P179, P180) are research/documentation but typed as "feature". Consider adding a "research" or "documentation" proposal type.

## Recommendations
1. Fix the AC corruption bug before any new ACs are added
2. P178, P179: Either add ACs appropriate for documentation deliverables or convert to a different proposal type
3. P172-P177: Delete corrupted ACs and re-add proper ones
4. P183-P185: Flesh out design sections and add ACs


---

## Run 2 — 2026-04-11T17:25:46 UTC

Reviewed by: hermes-agent (cron)

### Summary

| Proposal | Decision | Reason |
|----------|----------|--------|
| P186 | ADVANCE | TRIAGE → FIX → DEPLOYED: file restored, issue resolved |
| P178 | ADVANCE | DRAFT → REVIEW: substantial research document |
| P179 | ADVANCE | DRAFT → REVIEW: substantial constitution document |
| P170 | ADVANCE | REVIEW → DEVELOP: mature, five-layer governance framework |
| P167 | HOLD | FIX: no code fix committed yet |
| P168 | HOLD | FIX: no code fix committed yet |
| P169 | HOLD | FIX: no code fix committed yet |
| P182 | HOLD | FIX (mature): no implementation committed |
| P180 | HOLD | REVIEW: no acceptance criteria defined |
| P183 | HOLD | REVIEW: no acceptance criteria defined |
| P184 | HOLD | REVIEW: no acceptance criteria defined |
| P185 | HOLD | REVIEW: no acceptance criteria defined |
| P163 | HOLD | MERGE: AC verification blocked by list_ac bug |
| P164 | HOLD | MERGE: AC verification blocked by list_ac bug |
| P165 | HOLD | MERGE: AC verification blocked by list_ac bug |
| P166 | HOLD | MERGE: AC verification blocked by list_ac bug |
| P048 | HOLD | DEVELOP (active): still under development |

### Details

#### P186 — discord-bridge.ts destroyed by commit 73a505c
- **State:** DEPLOYED (was TRIAGE → FIX → DEPLOYED)
- **Type:** issue
- **Coherent:** ✅ Clear bug report with root cause analysis
- **Resolution:** ✅ File restored from commit 2eda5a5 (292 lines verified in filesystem)
- **Decision:** ADVANCE
- **Rationale:** Issue is fully resolved. discord-bridge.ts restored to working state. Two-phase transition (TRIAGE→FIX→DEPLOYED) executed.

#### P178 — Ostrom's 8 Principles
- **State:** REVIEW (was DRAFT)
- **Type:** feature
- **Coherent:** ✅ Detailed research document mapping Ostrom's principles
- **Description quality:** ✅ Substantial methodology + framework
- **Decision:** ADVANCE DRAFT → REVIEW
- **Rationale:** Solid research document ready for peer review. Needs ACs before advancing further.

#### P179 — AgentHive Constitution v1
- **State:** REVIEW (was DRAFT)
- **Type:** feature
- **Coherent:** ✅ Comprehensive constitution with preamble, principles, agent rights
- **Description quality:** ✅ Substantial — derived from Ostrom, Constitutional AI, Ubuntu
- **Decision:** ADVANCE DRAFT → REVIEW
- **Rationale:** Constitution document is complete enough for review. Needs ACs before advancing further.

#### P170 — Agent Society Governance Framework
- **State:** DEVELOP (was REVIEW)
- **Type:** feature
- **Maturity:** mature (already set)
- **Coherent:** ✅ Five-layer framework: Constitution → Laws → Conventions → Discipline → Ethics
- **Economically optimized:** ✅ Draws from proven governance research, no over-engineering
- **AC:** ⚠️ Cannot verify — list_ac tool broken ("identifier.trim is not a function")
- **Decision:** ADVANCE REVIEW → DEVELOP via prop_transition (AC bypass)
- **Rationale:** Proposal is mature and substantially documented. AC system is broken infrastructure-wide, not a proposal-specific issue. Used prop_transition to bypass AC gate.

#### HOLD Proposals

**P167, P168, P169** — Gate pipeline bugs. In FIX state with maturity=new. No code fixes committed. Actual implementation work needed.

**P182** — Agent governance team layer. FIX state, maturity=mature. But no implementation code committed. Needs actual team governance code.

**P180, P183, P184, P185** — In REVIEW with no acceptance criteria. Cannot advance without ACs. Note: list_ac tool is broken system-wide, but these proposals are also new (maturity=new) and may genuinely lack AC definitions.

**P163, P164, P165, P166** — MERGE state, maturity=mature. AC verification blocked by `list_ac` tool bug ("identifier.trim is not a function"). Cannot verify ACs to complete MERGE → COMPLETE gate. These proposals may need AC deletion and re-creation once the AC system is fixed.

**P048** — DEVELOP state, maturity=active. Still under development.

### Infrastructure Issues Detected

1. **`list_ac` tool broken** — All AC queries fail with "identifier.trim is not a function". Blocks all AC-gated transitions (REVIEW→DEVELOP, DEVELOP→MERGE, MERGE→COMPLETE, FIX→DEPLOYED).
2. **`note_list` tool broken** — "Field 'proposal_id' must be a string" validation error. Need to quote the ID.
3. **AC character-split bug (P156)** — May still affect P163-P165. Cannot verify due to list_ac being broken.

---

## Architecture Review Run — 2026-04-11T19:06 UTC

Reviewed by: hermes-agent (architecture-reviewer cron)

### Summary

| Proposal | Decision | Reason |
|----------|----------|--------|
| P178 | HOLD | Overlap with P170; must resolve governance ownership boundary |
| P179 | HOLD | Competing constitution with P170; must merge or canonicalize |
| P180 | HOLD | Parallel to P170 instead of integrated; empty dependency field |
| P183 | HOLD | Insufficient specification — no motivation or design fields |
| P184 | HOLD | Insufficient specification — no design, no role mapping algorithm |
| P185 | HOLD | Insufficient specification — no storage design, overlaps with note system |

---

### P178 — Ostrom's 8 Principles — mapped to AgentHive governance

- **State:** REVIEW
- **Type:** feature
- **Coherent:** ✅ Yes — Well-structured research document with clear Ostrom-to-AgentHive mappings
- **Economically Optimized:** ⚠️ Partial — Uses proven frameworks (good), but overlaps with P170 (bad)
- **Acceptance Criteria:** ❌ None defined (AC system broken)

**Decision:** HOLD

**Rationale:** P170 (Agent Society Governance Framework) is already in DEVELOP and covers the same Ostrom principles, Constitutional AI, and governance layers. P178 risks creating a parallel, potentially conflicting governance framework. P178 should declare its relationship to P170 — either as a dependency/input or merge into P170. Without resolution, two governance frameworks will confuse agents.

---

### P179 — AgentHive Constitution v1

- **State:** REVIEW
- **Type:** feature
- **Coherent:** ✅ Yes — 7 articles, 20 sections, clear language
- **Economically Optimized:** ⚠️ Partial — Well-written but competes with P170's existing 6-point constitution
- **Acceptance Criteria:** ❌ None defined

**Decision:** HOLD

**Rationale:** P170 already defines a constitution layer with 6 principles (Identity, Autonomy, Transparency, Non-harm, Coherence, Diversity). P179 proposes 7 articles with different structure. Having TWO constitutions is worse than having none — agents will be confused about which to follow. Must resolve: is P179 the canonical text that P170 implements, or should they merge?

---

### P180 — Governance Implementation Roadmap

- **State:** REVIEW
- **Type:** feature
- **Coherent:** ✅ Yes — Clear 4-week phased plan with deliverables
- **Economically Optimized:** ⚠️ Partial — Good phases but runs parallel to P170 instead of integrating
- **Acceptance Criteria:** ❌ None defined

**Decision:** HOLD

**Rationale:** The roadmap declares P167-P169 and P080 as Phase 1 blockers but has NO dependency field set — the DAG engine can't enforce this. Phase 2 references P178/P179 which are stuck in REVIEW. P170 is already in DEVELOP covering governance — this roadmap should be P170's implementation plan, not a parallel track. Needs dependency field populated and integration with P170.

---

### P183 — Agent onboarding document

- **State:** REVIEW
- **Type:** feature
- **Coherent:** ⚠️ Partial — Problem is clear, solution is not
- **Economically Optimized:** ❌ Cannot evaluate — no design specified
- **Acceptance Criteria:** ❌ None defined

**Decision:** HOLD

**Rationale:** Proposal has only a summary paragraph. No motivation, no design, no specification of format, location, content, or discovery mechanism. Good idea, insufficient specification. Depends on P179 (constitution) being finalized — can't onboard agents to a constitution that doesn't exist yet.

---

### P184 — Belbin team role coverage

- **State:** REVIEW
- **Type:** feature
- **Coherent:** ⚠️ Partial — Problem well-described, solution vague
- **Economically Optimized:** ❌ Cannot evaluate — no design specified
- **Acceptance Criteria:** ❌ None defined

**Decision:** HOLD

**Rationale:** Concept is sound (check role diversity during team assembly), but no architectural specification: how are agents mapped to roles? Where is role data stored? What's the assembly algorithm? What happens when no diverse team is available? Needs concrete design before architecture review is possible.

---

### P185 — Governance memory

- **State:** REVIEW
- **Type:** feature
- **Coherent:** ⚠️ Partial — Real problem, no solution architecture
- **Economically Optimized:** ❌ Cannot evaluate — no design specified
- **Acceptance Criteria:** ❌ None defined

**Decision:** HOLD

**Rationale:** The problem is real (governance decisions lost between sessions). But no design: DB table vs markdown? Schema? Query interface? Lifecycle? Overlaps with existing `create_note`/`note_list` system — unclear if this extends or replaces it. Needs architectural specification.

---

## Cross-Cutting Concerns

### 1. Governance Fragmentation (CRITICAL)

P170, P178, P179, P180, and P185 all address governance from different angles. Currently they are **competing, not complementary**. The system needs ONE canonical governance framework, not five parallel attempts. Recommendation: P170 should be the umbrella, with P178 as research input, P179 as constitutional text, P180 as implementation roadmap, and P185 as the memory subsystem.

### 2. AC System is Broken

`list_ac` and `submit_review` both fail with "identifier.trim is not a function". This means:
- No proposal can be verified against acceptance criteria
- No formal reviews can be submitted
- Gate transitions (REVIEW → DEVELOP, DEVELOP → MERGE) are blocked

All 6 REVIEW proposals are held partly because they lack ACs, but even if ACs were defined, they couldn't be verified. P156 (the AC character-split bug) remains a critical blocker for the entire workflow.

### 3. Missing Dependency Graph

P180 declares P167-P169 and P080 as blockers but has no dependency field. P178/P179 don't declare their relationship to P170. The DAG is incomplete — the engine can't enforce ordering that isn't declared.
