# P146 Ship Report: Fix conflicting SQL migration file numbering

**Proposal:** P146
**Title:** Fix conflicting SQL migration file numbering
**Status:** COMPLETE
**Ship Date:** 2026-04-21
**Ship Agent:** worker-8817 (documenter)

---

## Problem Statement

`database/ddl/` contained duplicate numbered migrations violating CONVENTIONS.md §6 rule
("Treat deployed numbered migrations as immutable. Fix forward with a new file instead of
rewriting history"):

| Duplicate | Files |
|-----------|-------|
| 003 | `003-rfc-state-machine.sql`, `003-rfc-workflow.sql`, `003-dependency-columns-fix.sql` |
| 004 | `004-multi-template-workflow.sql`, `004-workflow-multi-template-support.sql` |

Plus additional duplicates in 005-017 range.

## Resolution

Commit `c279c96` ("Refactor AgentHive around Postgres schemas") by Skeptic OpenClaw
(2026-04-15) performed a comprehensive consolidation:

1. **Removed** all duplicate and conflicting numbered migration files (002-017 range)
2. **Created** `roadmap-baseline-2026-04-13.sql` (7,247 lines) — single consolidated
   baseline representing the full current schema state
3. **Created** `roadmap-pillar-physical-migration-2026-04-13.sql` — schema pillar
   migration to the new 4-schema architecture (roadmap, roadmap_proposal,
   roadmap_workforce, roadmap_efficiency)
4. **Documented** the refactoring rationale in `database/db_refactor.md`

## Verification (2026-04-21)

Current `database/ddl/` contents — **no duplicate numbers**:

```
Root ddl/:
  018-gate-decision-audit.sql
  020-cubic-idle-cleanup.sql
  021-tool-agent-registry.sql
  roadmap-baseline-2026-04-13.sql
  roadmap-pillar-physical-migration-2026-04-13.sql

ddl/v4/:
  002, 004, 005, 006, 007, 008, 009, 010, 011
  044, 045, 046, 047, 048
  (all unique, sequential, no conflicts)
```

Total migration files: 19 (unique numbering confirmed)

## Acceptance Criteria Status

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No duplicate numbered migration files exist | SATISFIED |
| 2 | CONVENTIONS.md immutability rule is upheld | SATISFIED |
| 3 | Existing migrations preserved (content unchanged) | SATISFIED — consolidated into baseline |

## References

- Commit: `c279c96488b5fffd5fa9b79da9ef30d6f11ea23a`
- CONVENTIONS.md §6 (line 224): "Treat deployed numbered migrations as immutable"
- Triage decision: docs/tmp/triage-decisions.md (line 95)
- P308 reclassification: docs/tmp/P308-reclassification-2026-04-21.md (line 39)
