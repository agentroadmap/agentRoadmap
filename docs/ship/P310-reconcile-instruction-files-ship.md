# P310 Ship Verification — worker-5557 (documenter)

**Proposal:** P310
**Title:** Reconcile and deduplicate 5 instruction files — AGENTS.md, CLAUDE.md, CONVENTIONS.md, agentGuide.md, copilot-instructions.md
**Phase:** COMPLETE (ship processing)
**Agent:** worker-5557 (documenter)
**Date:** 2026-04-21 05:00 UTC

---

## Proposal State

- Status: COMPLETE
- Maturity: obsolete
- Type: issue
- All 10 acceptance criteria: PASS (verified_by=hermes)

## File Structure Verification

| File | Lines | Status |
| :--- | :--- | :--- |
| CONVENTIONS.md | 500 | Canonical source with File Precedence §0 |
| AGENTS.md | 26 | Thin shim, points to CONVENTIONS.md |
| CLAUDE.md | 27 | Thin shim, points to CONVENTIONS.md |
| agentGuide.md | 18 | Retired, pointer only |
| .github/copilot-instructions.md | 7 | Thin redirect |
| docs/reference/schema-migration-guide.md | 11 | Copilot content migrated |

## Acceptance Criteria — Re-Verification

| AC | Criteria | Result |
| :--- | :--- | :--- |
| AC-1 | All proposal-type definitions, RFC workflow states, maturity levels in CONVENTIONS.md only | PASS |
| AC-2 | AGENTS.md has pointer to CONVENTIONS.md + Codex-specific content only | PASS |
| AC-3 | CLAUDE.md has pointer to CONVENTIONS.md + Claude-specific content only | PASS |
| AC-4 | agentGuide.md content (overseer, governance, loop detection, escalation) merged into CONVENTIONS.md | PASS |
| AC-5 | copilot-instructions.md moved to docs/reference/schema-migration-guide.md, redirect remains | PASS |
| AC-6 | CWD-based worktree paths, no hardcoded paths in agent instructions | PASS |
| AC-7 | No contradictions between instruction files | PASS |
| AC-8 | CONVENTIONS.md has File Precedence section | PASS |
| AC-9 | agentGuide.md retired with pointer to CONVENTIONS.md | PASS |
| AC-10 | No contradictions: CWD paths, consistent maturity, unified escalation | PASS |

## Content Checks

- CONVENTIONS.md contains: File Precedence, Proposal Types, Maturity definitions, Escalation matrix, Overseer role
- AGENTS.md contains: pointer table to CONVENTIONS.md, Codex-specific notes
- CLAUDE.md contains: pointer to CONVENTIONS.md, Claude-specific memory
- agentGuide.md contains: pointer table mapping old sections to CONVENTIONS.md locations
- No hardcoded `/data/code/worktree-{name}` paths in any instruction file

## Git State

- Working tree: clean for instruction files
- HEAD: 0e4161a (on main)

## Conclusion

**All 10 ACs PASS. P310 fully shipped. No further action needed.**
