# Gate Decisions — 2026-04-11

## Architecture Review Session

**Reviewer:** architecture-reviewer
**Date:** 2026-04-11
**Proposals Reviewed:** 12

---

## Mature Proposals (P172–P177) — All REQUEST CHANGES

All six workforce/analytics proposals share a **systemic AC corruption bug**: acceptance criteria are stored as individual characters rather than complete testable criteria. This blocks all gate transitions.

| Proposal | Title | Decision | Primary Issues |
| :--- | :--- | :--- | :--- |
| P172 | Agent Performance Analytics | REQUEST CHANGES | ACs corrupted; no drawbacks/alternatives |
| P173 | Workforce Capacity Planning | REQUEST CHANGES | ACs corrupted; cold-start undefined; no alternatives |
| P174 | Skill Certification & Reputation | REQUEST CHANGES | ACs corrupted; badge eval timing unclear; unbounded merkle chain |
| P175 | Retirement & Knowledge Transfer | REQUEST CHANGES | ACs corrupted; partial transfer failure undefined |
| P176 | Labor Market & Talent Exchange | REQUEST CHANGES | ACs corrupted; O(n³) matching scalability; market manipulation |
| P177 | Workforce Dashboard & Observability | REQUEST CHANGES | ACs corrupted; refresh interval at scale; cost model undefined |

### Architectural Notes on Mature Proposals

**Strengths across P172–P177:**
- Clean module decomposition (each: engine + API + tables)
- Integration points clearly mapped to existing systems
- Merkle hash chain for reputation (P174) is sound
- Hungarian algorithm for matching (P176) is optimal at current scale

**Common Gaps:**
- All missing `drawbacks` and `alternatives` sections
- None consider 10x fleet growth scenarios explicitly
- Database schema details (indexes, partitioning) absent

---

## New Proposals (P178–P180, P183–P185) — All REQUEST CHANGES

| Proposal | Title | Decision | Primary Issues |
| :--- | :--- | :--- | :--- |
| P178 | Ostrom's 8 Principles Mapping | REQUEST CHANGES | Research doc, not buildable; no ACs/design |
| P179 | Constitution v1 | REQUEST CHANGES | No enforcement mechanism; no ACs |
| P180 | Governance Implementation Roadmap | REQUEST CHANGES | Phase 1 blockers unverified; no ACs |
| P183 | Agent Onboarding Document | REQUEST CHANGES | No design/delivery mechanism; no ACs; depends on P179 |
| P184 | Belbin Team Role Coverage | REQUEST CHANGES | No design; Belbin→agent mapping unjustified; no ACs |
| P185 | Governance Memory | REQUEST CHANGES | No schema/query design; overlap with P178; no ACs |

### Architectural Notes on Governance Proposals

**Observation:** P178–P180, P183–P185 form a governance foundation layer but have **circular dependency risks**:
- P183 (onboarding) depends on P179 (constitution)
- P179 (constitution) depends on P178 (Ostrom mapping) for justification
- P180 (roadmap) references P167–P169 which may not be resolved
- P185 (governance memory) overlaps with P178 on institutional memory

**Recommendation:** Resolve P167–P169 blockers first, then sequence: P178 → P179 → P185 → P183 → P180.

---

## Systemic Issue: AC Corruption

The AC storage system is corrupting multi-character acceptance criteria into individual character entries. This affects all 6 mature proposals and likely others. **This should be investigated as a platform bug** — the `add_acceptance_criteria` tool or its storage layer may have a string-splitting bug.

**Action Required:** File an issue against the MCP server's AC handling.

---

## Summary

- **0 approved** out of 12 reviewed
- **12 request changes** — all blocked on AC fixes (mature) or missing ACs/design (new)
- **1 systemic bug** identified: AC corruption in MCP server
- **Next gate session** should follow AC repair
