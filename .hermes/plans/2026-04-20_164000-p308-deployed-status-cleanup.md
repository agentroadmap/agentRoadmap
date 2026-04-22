# P308: DEPLOYED Status Cleanup — Architectural Analysis

## Problem Statement

34 proposals have `status='DEPLOYED'` which creates workflow conflicts:
- 33 proposals have `workflow_name='RFC 5-Stage'` — DEPLOYED is NOT a valid stage in this workflow
- 1 proposal (P200) has `workflow_name='Quick Fix'` — DEPLOYED IS valid here (stage 3 of TRIAGE→FIX→DEPLOYED)

## Root Cause

The 33 RFC proposals were processed through the Quick Fix pipeline (Draft→TRIAGE→FIX→DEPLOYED) during the P079-P200 era (April 8-12, 2026). Events show:
- System/hermes-agent moved them from Draft to TRIAGE
- Then through FIX to DEPLOYED
- But workflow_name was never updated from 'RFC 5-Stage'

The proposals are semantically "done" (work was deployed), but stuck in an invalid state for their declared workflow. The RFC 5-Stage workflow only defines: DRAFT→REVIEW→DEVELOP→MERGE→COMPLETE (+ REJECTED/DISCARDED).

## Impact

1. **Gate churn**: 28 proposals with maturity='mature' + status='DEPLOYED' pollute implicit gate polling (v_implicit_gate_ready view), though DEPLOYED isn't in the gate's status filter (DRAFT/REVIEW/DEVELOP/MERGE), so no actual dispatches fire — but they still consume query cycles.

2. **Blocking chains**: P079 and P080 both set `blocks` dependency on P068 (DEVELOP). With P079/P080 in invalid DEPLOYED state, P068's dependency resolution is ambiguous.

3. **State machine integrity**: No valid transition FROM DEPLOYED exists for RFC workflow. These proposals can never advance through normal workflow.

## Proposed Resolution

### Triage Categories

**Category A: RFC proposals that are genuinely complete (majority)**
- Move status from DEPLOYED → COMPLETE
- Set maturity to 'obsolete' (work done, stale)
- Rationale: They went through Quick Fix pipeline successfully; work was deployed

**Category B: RFC proposals with blocking dependencies (P079, P080)**
- Same as Category A, but first resolve dependency links
- P079 blocks P068, P080 blocks P068 — resolve these before moving to COMPLETE

**Category C: Already obsolete proposals (P151, P152)**
- Already maturity='obsolete', just fix status: DEPLOYED → COMPLETE
- These were gate pipeline issues that are now resolved

**Category D: Quick Fix proposal (P200)**
- Already in valid state — no change needed
- workflow_name='Quick Fix', status='DEPLOYED' is valid

### SQL Migration

```sql
-- Step 1: Move all RFC-workflow DEPLOYED proposals to COMPLETE
UPDATE roadmap_proposal.proposal
SET status = 'COMPLETE',
    modified_at = NOW()
WHERE UPPER(status) = 'DEPLOYED'
  AND workflow_name = 'RFC 5-Stage';

-- Step 2: Set mature ones to obsolete (they've been stale for 8+ days)
UPDATE roadmap_proposal.proposal
SET maturity = 'obsolete'
WHERE status = 'COMPLETE'
  AND UPPER(status) = 'DEPLOYED'  -- won't match after step 1, do by ID
  AND id IN (SELECT id FROM roadmap_proposal.proposal
             WHERE status = 'COMPLETE' AND created_at < NOW() - interval '7 days');

-- Step 2 (corrected): Mark all migrated proposals as obsolete
UPDATE roadmap_proposal.proposal
SET maturity = 'obsolete'
WHERE id IN (79,80,81,82,85,86,87,88,89,91,143,144,145,146,147,150,151,152,153,154,155,156,157,158,159,160,161,181,182,186,189,190,192);

-- Step 3: Resolve blocking dependency chains
UPDATE roadmap_proposal.proposal_dependencies
SET resolved = true, resolved_at = NOW(), resolved_by = 'P308-cleanup'
WHERE from_proposal_id IN (79, 80) AND to_proposal_id = 68;

-- Step 4: Emit events for audit trail
INSERT INTO roadmap_proposal.proposal_event (proposal_id, event_type, payload)
SELECT id, 'status_changed',
  jsonb_build_object('from', 'DEPLOYED', 'to', 'COMPLETE', 'agent', 'P308-cleanup', 'reason', 'orphaned status cleanup')
FROM roadmap_proposal.proposal
WHERE id IN (79,80,81,82,85,86,87,88,89,91,143,144,145,146,147,150,151,152,153,154,155,156,157,158,159,160,161,181,182,186,189,190,192);
```

## Acceptance Criteria Mapping

1. **AC1**: All 34 DEPLOYED proposals migrated to COMPLETE or marked obsolete with rationale
   - 33 RFC proposals → COMPLETE + obsolete (via Steps 1-2)
   - P200 stays DEPLOYED (valid in Quick Fix workflow) — documented as exception
   - Rationale captured in proposal_event audit trail

2. **AC2**: DEPLOYED status removed from valid workflow states or explicitly defined
   - DEPLOYED already IS defined in workflow_stages (template_id=15, Quick Fix)
   - No removal needed — it's valid for Quick Fix
   - Issue was RFC proposals in Quick Fix status, not the status itself
   - Fix: validation guard (prevent RFC proposals from entering DEPLOYED)

### Optional: Add validation guard

To prevent recurrence, add a trigger or check:
```sql
-- Prevent RFC proposals from being set to DEPLOYED
CREATE OR REPLACE FUNCTION roadmap_proposal.validate_status_workflow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'DEPLOYED' AND NEW.workflow_name = 'RFC 5-Stage' THEN
    RAISE EXCEPTION 'DEPLOYED is not a valid status for RFC 5-Stage workflow';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Verification

```sql
-- After migration, verify:
-- 1. No RFC proposals in DEPLOYED
SELECT COUNT(*) FROM roadmap_proposal.proposal
WHERE UPPER(status) = 'DEPLOYED' AND workflow_name = 'RFC 5-Stage';
-- Expected: 0

-- 2. Only P200 remains DEPLOYED (Quick Fix)
SELECT id, display_id, workflow_name, status FROM roadmap_proposal.proposal
WHERE UPPER(status) = 'DEPLOYED';
-- Expected: 1 row (P200, Quick Fix)

-- 3. No unresolved blocking chains from cleaned proposals
SELECT * FROM roadmap_proposal.proposal_dependencies
WHERE from_proposal_id IN (79, 80) AND resolved = false;
-- Expected: 0 rows
```

## Risk Assessment

- **Low risk**: Moving RFC proposals from invalid DEPLOYED to valid COMPLETE is semantically correct
- **Dependency resolution**: P079/P080 blocking P068 — resolving these unblocks P068's workflow
- **No data loss**: All transitions are captured in proposal_event for audit
- **P200 exception**: Must NOT be changed — it's legitimately in Quick Fix workflow
