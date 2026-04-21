# P306 Ship Verification — worker-6286 (pillar-researcher)

Date: 2026-04-21 14:04 UTC
Proposal: P306 — Normalize proposal status casing — mixed DRAFT/Draft causes filtering bugs
Phase: ship
Status: COMPLETE
Maturity: obsolete
Agent: worker-6286 (pillar-researcher)

## AC Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | All proposal.status values UPPERCASE | PASS — 6 canonical values |
| AC-2 | Migration SQL normalizes data | PASS — 0 rows where status != UPPER(status) |
| AC-3 | LOWER() removed from orchestrator.ts and bootstrap-state-machine.ts | PASS — grep clean |
| AC-4 | CHECK constraint prevents invalid values | PASS — proposal_status_canonical active |
| AC-5 | Trigger auto-upcases on INSERT/UPDATE | PASS — trg_normalize_proposal_status enabled |
| AC-6 | 6 distinct statuses | PASS — SELECT COUNT(DISTINCT status) = 6 |
| AC-7 | Input guard: toUpperCase() in createProposal | PASS — proposal-storage-v2.ts |
| AC-8 | No residual mixed-case | PASS — 0 rows |

## Live DB State

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

6 distinct statuses. 0 mixed-case rows. All UPPERCASE.

## Code Verification

- scripts/orchestrator.ts: LOWER(status) removed ✓
- scripts/bootstrap-state-machine.ts: LOWER(status) removed ✓
- src/infra/postgres/proposal-storage-v2.ts: toUpperCase() input guard ✓
- database/ddl/v4/044-normalize-proposal-status-casing.sql: migration applied ✓
- Trigger: trg_normalize_proposal_status — enabled ✓
- CHECK: proposal_status_canonical — active ✓
- src/core/pipeline/pipeline-cron.ts:1278: LOWER() preserved for to_stage comparison ✓

## Skeptic Review Conditions (P241)

All 5 minor conditions addressed:
1. AC-4 INSERT+UPDATE: Trigger is BEFORE INSERT OR UPDATE OF status — covers both ✓
2. AC-5 bypass vector: Trigger fires before CHECK; only superuser COPY could bypass — acceptable ✓
3. ROLLBACK documentation: Documented in migration comments ✓
4. CHECK constraint dual-case: Mitigated by trigger running BEFORE CHECK ✓
5. proposal_state_transitions: Out of scope, documented in Non-Goals ✓

## Delta from Prior Verifications

COMPLETE 74 (was 72 at last verification), REVIEW 8 (was 9). Normal lifecycle movement.
No regression detected. Orchestrator active, dispatching gate agents.

## Conclusion

8/8 ACs PASS. No regression. P306 shipped and stable since 2026-04-20.
Migration 044 applied. Trigger + CHECK constraint enforce UPPERCASE at DB boundary.
Code cleanup complete. Input guard as defense-in-depth.

Ship verdict: APPROVED.
