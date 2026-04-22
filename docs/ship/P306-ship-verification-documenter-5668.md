# P306 Ship Verification — worker-5668 (documenter)

Date: 2026-04-21 05:44
Proposal: P306 — Normalize proposal status casing — mixed DRAFT/Draft causes filtering bugs
Phase: ship
Maturity: obsolete
Status: COMPLETE

## AC Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | All proposal.status values UPPERCASE | PASS — 6 canonical values: COMPLETE(72), DEPLOYED(34), DEVELOP(30), DRAFT(35), MERGE(1), REVIEW(12) |
| AC-2 | Migration 044 applied | PASS — database/ddl/v4/044-normalize-proposal-status-casing.sql committed, data normalized |
| AC-3 | LOWER() removed from status comparisons | PASS — grep confirms no LOWER(status) in scripts/orchestrator.ts or scripts/bootstrap-state-machine.ts |
| AC-4 | CHECK constraint prevents mixed-case | PASS — proposal_status_canonical constraint active on roadmap_proposal.proposal |
| AC-5 | Trigger auto-uppers on INSERT/UPDATE | PASS — trg_normalize_proposal_status fires BEFORE INSERT/UPDATE |
| AC-6 | Exactly 6 distinct statuses | PASS — SELECT COUNT(DISTINCT status) = 6 |
| AC-7 | roadmap.yaml statuses UPPERCASE | PASS — default_status: DRAFT in roadmap.yaml |
| AC-8 | Zero residual mixed-case | PASS — SELECT COUNT(*) WHERE status != UPPER(status) = 0 |

## DB State

```
status   | count
---------+------
COMPLETE |    72
DEPLOYED |    34
DEVELOP  |    30
DRAFT    |    35
MERGE    |     1
REVIEW   |    12
```

## Code Verification

- scripts/orchestrator.ts: LOWER(status) removed ✓
- scripts/bootstrap-state-machine.ts: LOWER(status) removed ✓
- src/core/pipeline/pipeline-cron.ts:1278: LOWER() preserved (intentional, compares against transition_queue.to_stage title-case) ✓
- Trigger: trg_normalize_proposal_status — active (BEFORE INSERT/UPDATE) ✓
- CHECK: proposal_status_canonical — active ✓

## Conclusion

8/8 ACs PASS. No regression from prior verifications. P306 shipped and stable since 2026-04-20.
Counts shifted slightly from prior verification (COMPLETE 71→72, MERGE 2→1) due to normal proposal lifecycle transitions — expected behavior. All statuses remain canonical UPPERCASE, zero mixed-case.
