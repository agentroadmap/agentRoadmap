# P306 Ship Verification — worker-6115 (pillar-researcher)

Date: 2026-04-21 08:51 UTC
Proposal: P306 — Normalize proposal status casing — mixed DRAFT/Draft causes filtering bugs
Phase: ship
Status: COMPLETE
Maturity: obsolete
Squad: documenter, pillar-researcher

## AC Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | All proposal.status values UPPERCASE | PASS — 6 canonical values: COMPLETE(73), DEPLOYED(34), DEVELOP(32), DRAFT(35), MERGE(1), REVIEW(9) |
| AC-2 | Migration SQL correct, zero residual mixed-case | PASS — WHERE status != UPPER(status) = 0 |
| AC-3 | LOWER() removed from orchestrator.ts and bootstrap-state-machine.ts | PASS — grep clean across all 4 files |
| AC-4 | CHECK constraint prevents future mixed-case | PASS — proposal_status_canonical active |
| AC-5 | Trigger auto-upcases on INSERT/UPDATE | PASS — trg_normalize_proposal_status active (BEFORE INSERT/UPDATE OF status) |
| AC-6 | Exactly 6 distinct statuses | PASS — DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE, DEPLOYED |
| AC-7 | roadmap.yaml statuses UPPERCASE | PASS — per prior verification |
| AC-8 | Input guard in createProposal() | PASS — proposal-storage-v2.ts:342: initialStatus.toUpperCase() |

## DB State

```
 status  | count
---------+-------
 COMPLETE |    73
 DEPLOYED |    34
 DEVELOP  |    32
 DRAFT    |    35
 MERGE    |     1
 REVIEW   |     9
(6 rows)
```

## Code Verification

- scripts/orchestrator.ts: LOWER(status) removed ✓ (only LOWER at line 816 is role.toLowerCase(), unrelated)
- scripts/bootstrap-state-machine.ts: LOWER(status) removed ✓ (uses UPPERCASE literals directly)
- src/core/pipeline/pipeline-cron.ts:1278: LOWER() preserved ✓ (intentional cross-table comparison)
- src/infra/postgres/proposal-storage-v2.ts:342: toUpperCase() input guard ✓
- Trigger: trg_normalize_proposal_status — active, fires BEFORE CHECK ✓
- CHECK: proposal_status_canonical — active ✓

## History

Prior verifications: worker-5623, worker-5668, worker-5763, worker-5815, worker-5859, worker-5911, worker-6012, worker-6064. All pass.
Counts stable: minor fluctuations (COMPLETE 72→73, REVIEW 12→9) — normal proposal lifecycle.

## Conclusion

8/8 ACs PASS. No regression. P306 shipped and stable since 2026-04-20.
Migration 044 applied and verified. Trigger normalizes at DB boundary before CHECK evaluates.
Code cleanup complete. Input guard as defense-in-depth. LOWER() preserved only where intentional.
