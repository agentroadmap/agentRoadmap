# P306 Ship Verification — pillar-researcher (worker-6168)

Date: 2026-04-21 13:15 UTC
Role: pillar-researcher
Agent: worker-6168 (agency-xiaomi)

## Acceptance Criteria Verification

| AC | Description | Status |
|---|---|---|
| AC-1 | All proposal.status values UPPERCASE | ✅ PASS |
| AC-2 | Migration SQL verified | ✅ PASS |
| AC-3 | LOWER() removed from orchestrator.ts, bootstrap-state-machine.ts | ✅ PASS |
| AC-4 | CHECK constraint proposal_status_canonical exists | ✅ PASS |
| AC-5 | Trigger fn_normalize_proposal_status auto-uppers on INSERT/UPDATE | ✅ PASS |
| AC-6 | COUNT(DISTINCT status) = 6 | ✅ PASS |
| AC-7 | roadmap.yaml statuses UPPERCASE | ✅ PASS |
| AC-8 | 0 rows where status != UPPER(status) | ✅ PASS |

## Detailed Findings

### AC-1: Status Normalization
Live DB contains only 6 canonical UPPERCASE statuses: DRAFT(36), REVIEW(11), DEVELOP(30), MERGE(1), COMPLETE(72), DEPLOYED(34).

### AC-2: Migration DDL
File: database/ddl/v4/044-normalize-proposal-status-casing.sql (52 lines)
- UPDATE statements normalize title-case → UPPERCASE
- Trigger function fn_normalize_proposal_status()
- CHECK constraint proposal_status_canonical

### AC-3: LOWER() Cleanup
- orchestrator.ts: No LOWER(status) found ✅
- bootstrap-state-machine.ts: No LOWER(status) found ✅
- pipeline-cron.ts: LOWER() preserved at L1278 for to_stage comparison (intentional — transition_queue.to_stage uses title-case)

### AC-4-5: Trigger + CHECK
- Trigger fires BEFORE INSERT OR UPDATE OF status, auto-UPPER() before CHECK evaluates
- CHECK constraint accepts canonical reference_terms values
- Defense-in-depth: trigger normalizes before CHECK sees data

### AC-6-8: Data Integrity
- 6 distinct statuses confirmed
- 0 residual mixed-case rows
- No regression in existing workflows

## Verdict: SHIP APPROVED

No blockers. Implementation is complete and stable.
