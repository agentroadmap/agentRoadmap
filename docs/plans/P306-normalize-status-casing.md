# P306: Normalize Proposal Status Casing

## Problem

Live database has 10 distinct status values when only 6 are canonical. Mixed casing causes filtering bugs:

| Current Status | Count | Canonical |
|---|---|---|
| DRAFT | 31 | DRAFT |
| Draft | 8 | DRAFT |
| REVIEW | 11 | REVIEW |
| Review | 3 | REVIEW |
| DEVELOP | 11 | DEVELOP |
| Develop | 18 | DEVELOP |
| MERGE | 2 | MERGE |
| Merge | 2 | MERGE |
| COMPLETE | 53 | COMPLETE |
| Complete | 13 | COMPLETE |
| DEPLOYED | 34 | DEPLOYED |

`workflow_stages` defines all stages in UPPERCASE. The code works around mixed case in three different ways — none fix the root cause.

## Impact

1. **Discord bridge** (line 211): `WHERE p.status NOT IN ('COMPLETE','REJECTED','DISCARDED','ABANDONED')` — catches `COMPLETE` but misses `Complete` (13 proposals leak through).
2. **Board UI grouping**: `normalizeWorkflowStatus()` does case-insensitive matching client-side, but duplicate columns still appear when raw statuses differ.
3. **Orchestrator gate poll** (line 859): Uses `LOWER(p.status)` — works but adds per-row function call overhead on every 30s poll cycle.
4. **Pipeline cron** (line 1275): Uses `LOWER(p.status) = LOWER(tq.to_stage)` — same overhead.
5. **Proposal storage filters** (lines 150-152, 230-232, 262-264): `status = $X` — case-sensitive exact match, title-case proposals are invisible to uppercase filter values.
6. **Bootstrap script** (line 45, 105): Uses `LOWER(status)` — workaround.

## Root Cause

Historical inserts used mixed case. The `normalizeState()` function in orchestrator.ts exists but only normalizes in-memory — never writes back to DB. New proposals can still be inserted with wrong casing because no CHECK constraint enforces canonical values.

## Design

### Phase 1: DB Migration (the fix)

Single SQL migration that normalizes all existing data and prevents future drift:

```sql
-- 1. Normalize existing data to UPPERCASE
UPDATE roadmap_proposal.proposal SET status = 'DRAFT' WHERE status = 'Draft';
UPDATE roadmap_proposal.proposal SET status = 'REVIEW' WHERE status = 'Review';
UPDATE roadmap_proposal.proposal SET status = 'DEVELOP' WHERE status = 'Develop';
UPDATE roadmap_proposal.proposal SET status = 'MERGE' WHERE status = 'Merge';
UPDATE roadmap_proposal.proposal SET status = 'COMPLETE' WHERE status = 'Complete';

-- 2. Add CHECK constraint to enforce canonical casing
ALTER TABLE roadmap_proposal.proposal
  ADD CONSTRAINT proposal_status_canonical
  CHECK (status IN (
    'DRAFT','REVIEW','DEVELOP','MERGE','COMPLETE','DEPLOYED',
    'TRIAGE','OPEN','FIX','REVIEWING','MERGED','ESCALATE',
    'REJECTED','WONT_FIX','CLOSED','DISCARDED','ABANDONED'
  ));

-- 3. Create trigger to auto-uppercase on insert/update
CREATE OR REPLACE FUNCTION roadmap_proposal.fn_normalize_proposal_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.status := UPPER(NEW.status);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_normalize_proposal_status
  BEFORE INSERT OR UPDATE OF status ON roadmap_proposal.proposal
  FOR EACH ROW
  EXECUTE FUNCTION roadmap_proposal.fn_normalize_proposal_status();
```

### Phase 2: Code Cleanup (simplify workarounds)

Remove LOWER()/normalizeState() workarounds that become unnecessary once DB is clean:

| File | Line | Change |
|---|---|---|
| `scripts/orchestrator.ts` | 859 | `LOWER(p.status) IN (...)` → `p.status IN ('DRAFT','REVIEW','DEVELOP','MERGE')` |
| `scripts/bootstrap-state-machine.ts` | 45 | `LOWER(status) IN (...)` → `status IN (...)` |
| `scripts/bootstrap-state-machine.ts` | 105 | `LOWER(status) = 'develop'` → `status = 'DEVELOP'` |
| `src/core/pipeline/pipeline-cron.ts` | 1275 | `LOWER(p.status) = LOWER(tq.to_stage)` → `p.status = tq.to_stage` |
| `scripts/discord-bridge.ts` | 211 | `NOT IN ('COMPLETE',...)` already correct after normalization |

### Phase 3: Input Guard (prevent regression)

In `proposal-storage-v2.ts` `createProposal()`, normalize status before INSERT:
```typescript
initialStatus = initialStatus.toUpperCase();
```

## Acceptance Criteria

1. All proposal.status values normalized to UPPERCASE (DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE, DEPLOYED) in live DB
2. Migration SQL script verified: `SELECT status, COUNT(*) GROUP BY` shows only canonical values
3. Code paths that use normalizeState() or LOWER() reviewed and simplified if normalization is DB-level
4. CHECK constraint prevents future mixed-case inserts
5. Trigger auto-uppers any status value on INSERT/UPDATE as safety net
6. Board UI shows exactly 6 columns (not 10) without duplicate groupings

## Risks

- **CHECK constraint rejects existing code** that inserts title-case status. Mitigation: the trigger runs BEFORE the CHECK, so uppercase reaches the constraint. But any code that bypasses the trigger (direct COPY, raw SQL) could fail.
- **Deploy order matters**: migration must run before code changes. Safe to deploy migration first (trigger handles new inserts), then clean up code.

## Non-Goals

- Not touching `workflow_stages` — already canonical UPPERCASE.
- Not adding DEPLOYED to the Standard RFC workflow (it's a separate lifecycle state).
- Not refactoring the orchestrator's `normalizeState()` — keeping it as defense-in-depth for runtime state comparisons.
