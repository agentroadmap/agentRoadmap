# P306 Ship Verification — documenter (worker-6473)

Date: 2026-04-21 11:14 UTC
Proposal: P306 — Normalize proposal status casing — mixed DRAFT/Draft causes filtering bugs
Phase: ship (COMPLETE)
Maturity: obsolete
Status: COMPLETE
Squad: documenter, pillar-researcher
Agent: worker-6473 (agency-xiaomi)

## AC Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | All proposal.status values UPPERCASE | PASS — 6 canonical values: COMPLETE(75), DEPLOYED(34), DEVELOP(31), DRAFT(35), MERGE(1), REVIEW(8) |
| AC-2 | Migration SQL verified | PASS — 044-normalize-proposal-status-casing.sql (2182 bytes), committed at 444e34d |
| AC-3 | LOWER() removed from status comparisons | PASS — 0 matches in scripts/orchestrator.ts, scripts/bootstrap-state-machine.ts |
| AC-4 | CHECK constraint prevents mixed-case | PASS — proposal_status_canonical (contype='c') on roadmap_proposal.proposal |
| AC-5 | Trigger auto-uppers on INSERT/UPDATE | PASS — trg_normalize_proposal_status enabled (tgenabled='O'), fn_normalize_proposal_status exists |
| AC-6 | Exactly 6 distinct statuses | PASS — SELECT COUNT(DISTINCT status) = 6 |
| AC-7 | roadmap.yaml statuses UPPERCASE | PASS — default_status: DRAFT |
| AC-8 | Zero residual mixed-case | PASS — SELECT COUNT(*) WHERE status != UPPER(status) = 0 |

## DB State

```
status   | count
---------+------
COMPLETE |    75
DRAFT    |    35
DEPLOYED |    34
DEVELOP  |    31
REVIEW   |     8
MERGE    |     1
```

## Code Verification

- scripts/orchestrator.ts: LOWER(status) removed (0 matches) ✓
- scripts/bootstrap-state-machine.ts: LOWER(status) removed (0 matches) ✓
- src/core/pipeline/pipeline-cron.ts:1278: LOWER() preserved — intentional cross-table comparison with transition_queue.to_stage (title-case) ✓
- src/infra/postgres/proposal-storage-v2.ts:342: toUpperCase() input guard in createProposal() ✓
- Trigger: trg_normalize_proposal_status — active (tgenabled='O') ✓
- CHECK: proposal_status_canonical — active (contype='c') ✓
- Migration: database/ddl/v4/044-normalize-proposal-status-casing.sql (2182 bytes) ✓
- normalizeState() preserved as defense-in-depth in orchestrator.ts ✓

## History

Prior verifications: worker-5623, worker-5668, worker-5859, worker-5911, worker-6063, worker-6115, worker-6221, worker-6285, worker-6410, worker-6411 and many others. All 8/8 PASS.
Counts shifted from prior (REVIEW 10→8, COMPLETE 72→75) — normal proposal lifecycle, expected behavior.

## Conclusion

8/8 ACs PASS. No regression. P306 shipped and stable since 2026-04-20.
Migration 044 applied. Trigger and CHECK constraint enforce UPPERCASE at DB boundary.
Code cleanup complete. Input guard as belt-and-suspenders. LOWER() preserved only where intentional (cross-table comparisons against transition_queue.to_stage).
