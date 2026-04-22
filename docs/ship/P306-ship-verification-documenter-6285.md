# P306 Ship Verification — worker-6285 (documenter)

Date: 2026-04-21 10:00 UTC
Proposal: P306 — Normalize proposal status casing — mixed DRAFT/Draft causes filtering bugs
Phase: ship
Status: COMPLETE
Maturity: obsolete
Agent: worker-6285 (documenter, agency-xiaomi)

## AC Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | All proposal.status values UPPERCASE | PASS — 6 canonical values: COMPLETE(74), DEPLOYED(34), DEVELOP(31), DRAFT(35), MERGE(2), REVIEW(8) |
| AC-2 | Zero residual mixed-case | PASS — WHERE status != UPPER(status) = 0 |
| AC-3 | Exactly 6 distinct statuses | PASS — SELECT COUNT(DISTINCT status) = 6 |
| AC-4 | Trigger auto-upcases on INSERT/UPDATE | PASS — trg_normalize_proposal_status active (BEFORE INSERT, BEFORE UPDATE) |
| AC-5 | CHECK constraint prevents invalid values | PASS — proposal_status_canonical (CHECK) active |
| AC-6 | LOWER() removed from orchestrator.ts + bootstrap-state-machine.ts | PASS — grep returns 0 matches |
| AC-7 | Input guard: toUpperCase() in createProposal | PASS — proposal-storage-v2.ts:342 |
| AC-8 | LOWER() preserved in pipeline-cron.ts:1278 | PASS — intentional cross-table comparison against transition_queue.to_stage |

## DB State

```
status   | count
---------+------
COMPLETE |    74
DEPLOYED |    34
DEVELOP  |    31
DRAFT    |    35
MERGE    |     2
REVIEW   |     8
```

6 distinct statuses. 0 mixed-case rows. 184 total proposals.

## Code Verification

- scripts/orchestrator.ts: LOWER(status) removed — grep clean
- scripts/bootstrap-state-machine.ts: LOWER(status) removed — grep clean
- src/infra/postgres/proposal-storage-v2.ts:342: initialStatus.toUpperCase() — input guard active
- src/core/pipeline/pipeline-cron.ts:1278: LOWER() preserved — intentional for transition_queue.to_stage comparison
- database/ddl/v4/044-normalize-proposal-status-casing.sql: migration exists

## Trigger + Constraint

- Trigger: trg_normalize_proposal_status — BEFORE INSERT/UPDATE OF status — auto-UPPER()
- CHECK: proposal_status_canonical — validates against 28 reference_terms values

## Delta from Prior Verifications

COMPLETE 72→74 (+2), REVIEW 12→8 (-4), MERGE 1→2 (+1) — normal proposal lifecycle movement. No regression.

Prior verifications: worker-6222 (pillar-researcher), worker-6221 (documenter), and 20+ prior runs. All PASS.

## Conclusion

8/8 ACs PASS. No regression. P306 shipped and stable since 2026-04-20.
Migration 044 applied. Trigger + CHECK constraint enforce UPPERCASE at DB boundary.
Code cleanup complete. Input guard as defense-in-depth. LOWER() preserved only where intentional.

SHIP VERIFIED — no further action needed.
