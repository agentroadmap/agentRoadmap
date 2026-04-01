# PM Review: STATE-058.1 Research & Enhanced ACs
**Date:** 2026-03-24  
**Reviewer:** product-manager  
**Scope:** STATE-058.1 — Enhanced Product Documentation - Full State Detail & GitHub Hosting

---

## Research Findings

### Gap Analysis: STATE-058 Output vs. Available Data

STATE-058 (Live Product Documentation) is Reached and working, but its output is minimal — titles and status only. Meanwhile, state files contain rich structured data that's invisible to users:

| Data Available | In STATE-058 Output? | User Value |
|---|---|---|
| Full description | ❌ | High — what does this state actually do? |
| Acceptance criteria with status | ❌ | High — what was promised vs delivered? |
| Implementation notes | ❌ | Medium — what files were created? |
| Audit notes / blocking issues | ❌ | High — why did review fail? |
| Proof of arrival | ❌ | Medium — test counts, evidence |
| Dependencies (linked) | Partial | High — what's blocked? |
| Assignee, builder, auditor | ❌ | Medium — who did this? |
| Priority, maturity, labels | ❌ | Low — filtering and sorting |

**Verdict:** STATE-058 solves "can we generate docs" but not "are the docs useful." STATE-058.1 addresses the gap.

### GitHub Hosting Decision

| Approach | Best For | agentRoadmap Fit |
|---|---|---|
| docs/ + GitHub Pages | Professional product docs, CI/CD | ✅ Recommended |
| Wiki | Community how-tos | ❌ No CI/CD, poor search |
| README | Project overview only | ❌ Can't handle 50+ states |

**Recommendation:** docs/ folder + GitHub Pages with MkDocs Material theme. Version-controlled, auto-deployed, searchable, professional.

### Output Architecture

Extends STATE-058's `doc-generator.ts` — no breaking changes. New functions generate full-state pages and GitHub Pages config. Incremental generation avoids rebuilding unchanged states.

---

## Product Coherence Assessment

- **Connects to STATE-058:** ✅ Extends, doesn't replace
- **Serves real user need:** ✅ Humans and agents both need to read state details, not just titles
- **Feasible scope:** ✅ Mostly data extraction + template rendering + CI/CD setup
- **Dependency chain clear:** STATE-058 → STATE-058.1 → (potential future: search, dashboards)

## AC Quality Review

8 acceptance criteria defined. Each is:
- **Testable** — pass/fail verifiable
- **Specific** — not vague ("include all data" vs "include data")
- **Non-overlapping** — each covers distinct functionality
- **Valuable** — each directly improves documentation usability

No gaps found. Ready for implementation handoff.

---

## Recommendations

1. **Implementation order:** AC#1 (per-state detail) first — it's the core value. AC#3 (GitHub Pages) second — it's the delivery mechanism. Rest can follow.
2. **Consider:** Adding a `docs/generate` GitHub Action to STATE-058's existing workflow, so documentation is always fresh.
3. **Future state:** Search functionality (Algolia or Lunr.js) could be STATE-058.2 if users request it.
