# P310 — Ship Document
## Reconcile and deduplicate 5 instruction files — AGENTS.md, CLAUDE.md, CONVENTIONS.md, agentGuide.md, copilot-instructions.md

**Status:** SHIPPED
**Date:** 2026-04-21
**Type:** Issue
**Proposal:** P310

---

## Problem

Three overlapping instruction files existed: AGENTS.md (Codex), CLAUDE.md (Claude Code), .github/copilot-instructions.md (Copilot). They contained duplicated but not identical content. New agents got confused about which rules took precedence. Content drift meant fixes to one file didn't propagate to others.

## Solution: Single Source of Truth + Per-Tool Minimal Shims

CONVENTIONS.md is the canonical source. All other files are thin shims that point to it.

### Final File Structure

| File | Lines | Role |
| :--- | :--- | :--- |
| **CONVENTIONS.md** | 498 | Canonical source. All shared rules: workflow, MCP, DB, Git, governance. |
| AGENTS.md | 26 | Thin shim for Codex/similar. Points to CONVENTIONS.md. |
| CLAUDE.md | 27 | Thin shim for Claude Code. Claude-specific memory + pointer. |
| agentGuide.md | 18 | Retired. Content merged into CONVENTIONS.md. Pointer only. |
| .github/copilot-instructions.md | 7 | Redirect to docs/reference/schema-migration-guide.md. |
| docs/reference/schema-migration-guide.md | 11 | Copilot schema migration context. |

### Content Merged into CONVENTIONS.md

From agentGuide.md (new sections 11-16):
- Overseer role definition (Hermes/Andy responsibilities) — §11
- Model-to-workflow phase mapping — §12
- Financial governance / budget control — §13
- Anomaly and loop detection — §14
- Escalation matrix — §15
- Agent definitions — §16

From AGENTS.md/CLAUDE.md (consolidated into existing sections):
- Proposal types table — §5
- RFC workflow states — §5
- Maturity definitions — §5
- Working rules — §4

### Fixes Applied

- Precedence section added as §0 declaring CONVENTIONS.md canonical
- Worktree path: CWD-based convention everywhere (fixes agentGuide.md hardcoded path)
- Cross-references updated (remove agentGuide.md from reading list after merge)
- Stale content removed (hardcoded paths, outdated dates)
- agentGuide.md retired with pointer table mapping old sections to new locations

## Acceptance Criteria — All Pass

| AC | Criteria | Result |
| :--- | :--- | :--- |
| AC1 | Precedence section exists in CONVENTIONS.md | PASS |
| AC2 | AGENTS.md is thin shim (~30 lines, 26 actual) | PASS |
| AC3 | CLAUDE.md is thin shim (~40 lines, 27 actual) | PASS |
| AC4 | agentGuide.md retired with pointer table | PASS |
| AC5 | copilot-instructions.md is redirect | PASS |
| AC6 | schema-migration-guide.md exists | PASS |
| AC7 | Merged content (overseer, governance, escalation) in CONVENTIONS.md | PASS |
| AC8 | No hardcoded worktree paths in agentGuide.md | PASS |
| AC9 | AGENTS.md points to CONVENTIONS.md | PASS |
| AC10 | CLAUDE.md points to CONVENTIONS.md | PASS |

## Verification

- All 5 instruction files restructured as designed
- CONVENTIONS.md expanded from 337 to 498 lines with merged content
- No contradictions between files (CONVENTIONS.md is canonical per §0)
- Commit: `6b7969d` merged to main
- All 97 squad dispatches completed/delivered
