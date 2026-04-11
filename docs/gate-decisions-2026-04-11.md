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
