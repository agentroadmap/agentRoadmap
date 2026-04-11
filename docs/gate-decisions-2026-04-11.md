# Gate Decisions — 2026-04-11

## TRIAGE Proposals (Quick Fix)

| Proposal | Decision | Reason |
|----------|----------|--------|
| P087 | **LEAVE IN TRIAGE** | Real issue — ~12 code files still use `maturity_state` instead of `maturity`. But blocked on P086 (DDL rename) which is still in FIX/new. Cannot proceed until P086 deploys the column rename. |
| P089 | **LEAVE IN TRIAGE** | Not a quick fix — this is an architecture review/research proposal masquerading as an issue. Should be converted to RFC workflow (DRAFT) or handled as a research task. No concrete bug to fix. |
| P091 | **LEAVE IN TRIAGE — needs investigation** | The file-based roadmap (docs/pillars/1-proposal/product-roadmap.md) is stale. P068 in DB is "Federation & Cross-Instance Sync" not "Web Dashboard & TUI Board" or "Risk Alert & Mitigation". The entire roadmap file is out of sync with Postgres — P066, P067, P068, P069 all have wrong titles in the file. Needs a comprehensive sync, not just P068 fix. Issue description is also inaccurate about what MCP shows. |
| P147 | **LEAVE IN TRIAGE** | Duplicate/related to P087. Same root cause — P086 DDL not deployed. ~12 files still reference `maturity_state`. Blocked on P086. Additionally, P087 itself has ACs in its summary but none stored in the AC system (likely hit the character-splitting bug from P156). |

## REVIEW Proposals (RFC)

| Proposal | Decision | Reason |
|----------|----------|--------|
| P149 | **ADVANCE REVIEW → DEVELOP** | ✅ Coherent: Clear design reusing proven pg_notify pattern from gate pipeline. ✅ Economically optimized: pg_notify adds zero infrastructure cost vs WebSocket or Redis alternatives. ✅ Has ACs: 5 well-defined ACs in summary (AC system hit char-split bug but ACs are solid in proposal text). Design is thorough with table schema, trigger, fallback strategy, and tool interface. |
| P162 | **LEAVE IN REVIEW** | Coherent and useful UX improvement. ❌ No acceptance criteria defined. Needs ACs before advancing. Also should consider: is this a standalone feature or part of P064 (OpenClaw CLI)? |

## Summary

- **2 proposals advanced**: P149 → DEVELOP (mature)
- **4 proposals kept in TRIAGE**: P087, P089, P091, P147 (blocked or need more info)
- **1 proposal kept in REVIEW**: P162 (missing ACs)

## Blocking Chain

```
P086 (FIX/new) ──blocks──→ P087 (TRIAGE) ──related──→ P147 (TRIAGE)
```

P086 deploys the DDL rename. Until it completes, P087 and P147 cannot proceed.
