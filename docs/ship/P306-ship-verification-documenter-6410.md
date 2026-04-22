# P306 Ship Verification — worker-6410 (documenter)

Date: 2026-04-21 10:51 UTC
Proposal: P306 — Normalize proposal status casing — mixed DRAFT/Draft causes filtering bugs
Phase: ship
Status: COMPLETE
Maturity: obsolete

## AC Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | All proposal.status values UPPERCASE | PASS — 6 canonical values: COMPLETE(75), DEPLOYED(34), DEVELOP(31), DRAFT(35), MERGE(1), REVIEW(8) |
| AC-2 | Migration SQL normalizes data | PASS — 0 rows where status != UPPER(status) |
| AC-3 | LOWER() removed from orchestrator.ts and bootstrap-state-machine.ts | PASS — grep clean |
| AC-4 | CHECK constraint prevents invalid values | PASS — proposal_status_canonical active (CHECK) |
| AC-5 | Trigger auto-upcases on INSERT/UPDATE | PASS — trg_normalize_proposal_status enabled (BEFORE INSERT, BEFORE UPDATE) |
| AC-6 | 6 distinct statuses | PASS — 6 rows (COMPLETE, DEPLOYED, DEVELOP, DRAFT, MERGE, REVIEW) |
| AC-7 | Input guard: toUpperCase() in createProposal | PASS — proposal-storage-v2.ts:342 |
| AC-8 | No residual mixed-case | PASS — 0 rows |

## DB State

```
status   | count
---------+------
COMPLETE |   75
DEPLOYED |   34
DEVELOP  |   31
DRAFT    |   35
MERGE    |    1
REVIEW   |    8
```

6 distinct statuses. 0 mixed-case rows. Trigger fires BEFORE CHECK — correct PostgreSQL execution order.

## Code Verification

- scripts/orchestrator.ts: LOWER(status) removed ✓
- scripts/bootstrap-state-machine.ts: LOWER(status) removed ✓
- src/infra/postgres/proposal-storage-v2.ts:342: toUpperCase() input guard ✓
- database/ddl/v4/044-normalize-proposal-status-casing.sql: migration present ✓
- Trigger: trg_normalize_proposal_status — enabled (BEFORE INSERT/UPDATE) ✓
- CHECK: proposal_status_canonical — active ✓
- LOWER(p.status) preserved at pipeline-cron.ts:1278 — intentional (compares against transition_queue.to_stage title-case) ✓

## Delta from Prior Verifications

COMPLETE 74→75, REVIEW 9→8 — normal proposal lifecycle movement. No regression.
Prior verifications: worker-5763 (pillar-researcher), worker-6222 (pillar-researcher), worker-5911 (documenter), worker-5860 (skeptic-beta).

## Architecture Notes

- terminology.ts stays title-case (display layer). Trigger normalizes at DB boundary.
- transition_queue.to_stage stays title-case (98.7% of data). LOWER() comparison intentional.
- NormalizeState() kept as defense-in-depth in orchestrator.

## Conclusion

8/8 ACs PASS. No regression. P306 shipped and stable since 2026-04-20.
Migration 044 applied. Trigger + CHECK constraint enforce UPPERCASE at DB boundary.
Code cleanup complete. Input guard as defense-in-depth. LOWER() preserved only where intentional.
