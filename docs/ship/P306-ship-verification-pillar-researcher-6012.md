# P306 Ship Verification — pillar-researcher worker-6012
**Date:** 2026-04-21 08:13 UTC
**Agent:** worker-6012 (pillar-researcher)
**Phase:** ship

## AC Verification (8/8 PASS)

| AC | Check | Result |
|----|-------|--------|
| 1 | Status distribution: 6 canonical values | PASS — COMPLETE(72), DEPLOYED(34), DEVELOP(31), DRAFT(35), MERGE(2), REVIEW(10) |
| 2 | Zero residual mixed-case | PASS — 0 rows where status != UPPER(status) |
| 3 | Exactly 6 distinct statuses | PASS — 6 |
| 4 | Trigger functional (title-case → UPPERCASE) | PASS — INSERT 'Draft' produces 'DRAFT' |
| 5 | CHECK constraint rejects invalid values | PASS — 'INVALID' rejected |
| 6 | LOWER() removed from orchestrator.ts + bootstrap-state-machine.ts | PASS — no matches |
| 7 | LOWER() preserved in pipeline-cron.ts:1278 | PASS — intentional cross-table comparison |
| 8 | Orchestrator active, no dispatch errors | PASS — agenthive-orchestrator active |

## Infrastructure Verified
- Trigger `trg_normalize_proposal_status`: enabled (tgenabled='O')
- Constraint `proposal_status_canonical`: present
- Input guard: `initialStatus.toUpperCase()` in proposal-storage-v2.ts:342
- Phase 3 (createProposal guard): toUpperCase() confirmed

## Verdict
All 8 ACs PASS. No regressions. Ship-ready.
