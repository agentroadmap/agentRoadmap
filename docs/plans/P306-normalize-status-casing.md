# P306: Normalize Proposal Status Casing

## Problem

Live database has 10 distinct status values when only 6 are canonical. Mixed casing causes filtering bugs:

| Current Status | Count | Canonical |
|---|---|---|
| DRAFT | 30 | DRAFT |
| Draft | 8 | DRAFT |
| REVIEW | 12 | REVIEW |
| Review | 3 | REVIEW |
| DEVELOP | 11 | DEVELOP |
| Develop | 18 | DEVELOP |
| MERGE | 2 | MERGE |
| Merge | 2 | MERGE |
| COMPLETE | 53 | COMPLETE |
| Complete | 13 | COMPLETE |
| DEPLOYED | 34 | DEPLOYED |

Total mixed-case proposals: 44 (8+3+18+2+13).

`workflow_stages` defines all stages in UPPERCASE. The code works around mixed case in three different ways — none fix the root cause.

## Impact

1. **Discord bridge** (line 211): `WHERE p.status NOT IN ('COMPLETE','REJECTED','DISCARDED','ABANDONED')` — catches `COMPLETE` but misses `Complete` (13 proposals leak through).
2. **Board UI grouping**: `normalizeWorkflowStatus()` does case-insensitive matching client-side, but duplicate columns still appear when raw statuses differ.
3. **Orchestrator gate poll** (line 888): Uses `LOWER(p.status)` — works but adds per-row function call overhead on every 30s poll cycle.
4. **Pipeline cron** (line 1278): Uses `LOWER(p.status) = LOWER(tq.to_stage)` — same overhead.
5. **Proposal storage filters** (lines 150-152, 230-232, 262-264): `status = $X` — case-sensitive exact match, title-case proposals are invisible to uppercase filter values.
6. **Bootstrap script** (lines 45, 105): Uses `LOWER(status)` — workaround.

## Root Cause

1. `terminology.ts` exports `CanonicalStatus` as title-case ("Draft","Review","Develop","Merge","Complete"). `STATUS_MAP` maps lowercase→title-case. `normalizeStatus()` returns title-case. This is the primary source of title-case flowing into `proposal.status`.

2. `inferGateForState()` in orchestrator.ts returns title-case `toStage` values ("Review","Develop","Merge","Complete") which are written to `transition_queue.to_stage`.

3. No CHECK constraint or trigger prevents mixed-case inserts.

## Design

### Architecture Decisions

**Decision 1: terminology.ts — Keep as display layer (title-case).**
`terminology.ts` is the UI/display layer — title-case looks correct in TUI/board/Discord. The trigger normalizes at the DB boundary, which is the correct layer. `normalizeStatus()` returns title-case for display; the trigger ensures UPPERCASE reaches the column.

**Decision 2: transition_queue.to_stage — Keep title-case, keep LOWER().**
Rationale: transition_queue has 6,631 title-case rows (98.7% of data: Review=415, Develop=22, Merge=6136). Normalizing to UPPERCASE requires rewriting SQL functions in migrations 020, 029, 030, 033 + the `v_implicit_gate_ready` view + `fn_notify_gate_ready` trigger + orchestrator.ts `inferGateForState()`. That's ~12 files for a marginal benefit. The LOWER() comparison in pipeline-cron.ts:1278 is correct and intentional — it compares proposal.status (UPPERCASE after P306) against transition_queue.to_stage (title-case). Future P3XX could normalize to_stage as a separate, scoped effort.

**Decision 3: CHECK constraint — Use all 28 reference_terms values.**
`proposal.status` has FK to `roadmap.reference_terms`. A narrower CHECK that rejects FK-allowed values would be a footgun. Including all 28 `proposal_state` values is safe. The trigger normalizes casing before CHECK evaluates.

### Phase 1: DB Migration

File: `database/ddl/v4/044-normalize-proposal-status-casing.sql`

```sql
-- P306: Normalize proposal.status to UPPERCASE
-- Fixes 44 mixed-case proposals causing filtering bugs.

BEGIN;

-- 1. Normalize existing data
UPDATE roadmap_proposal.proposal SET status = 'DRAFT'    WHERE status = 'Draft';
UPDATE roadmap_proposal.proposal SET status = 'REVIEW'   WHERE status = 'Review';
UPDATE roadmap_proposal.proposal SET status = 'DEVELOP'  WHERE status = 'Develop';
UPDATE roadmap_proposal.proposal SET status = 'MERGE'    WHERE status = 'Merge';
UPDATE roadmap_proposal.proposal SET status = 'COMPLETE' WHERE status = 'Complete';

-- 2. Trigger function: auto-uppercase status on INSERT/UPDATE
CREATE OR REPLACE FUNCTION roadmap_proposal.fn_normalize_proposal_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.status := UPPER(NEW.status);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger
DROP TRIGGER IF EXISTS trg_normalize_proposal_status ON roadmap_proposal.proposal;
CREATE TRIGGER trg_normalize_proposal_status
  BEFORE INSERT OR UPDATE OF status ON roadmap_proposal.proposal
  FOR EACH ROW
  EXECUTE FUNCTION roadmap_proposal.fn_normalize_proposal_status();

-- 4. CHECK constraint — all 28 reference_terms proposal_state values
-- Must match: SELECT term_value FROM roadmap.reference_terms WHERE term_category = 'proposal_state';
-- The trigger runs BEFORE CHECK, so uppercase reaches the constraint.
ALTER TABLE roadmap_proposal.proposal
  DROP CONSTRAINT IF EXISTS proposal_status_canonical;
ALTER TABLE roadmap_proposal.proposal
  ADD CONSTRAINT proposal_status_canonical
  CHECK (status IN (
    'Abandoned', 'APPROVED', 'CLOSED', 'Complete', 'COMPLETE',
    'DEPLOYED', 'Develop', 'DEVELOP', 'DISCARDED', 'DONE',
    'Draft', 'DRAFT', 'ESCALATE', 'FIX', 'FIXING',
    'Merge', 'MERGE', 'MERGED', 'NON_ISSUE', 'OPEN',
    'Rejected', 'REJECTED', 'Replaced', 'Review', 'REVIEW',
    'REVIEWING', 'TRIAGE', 'WONT_FIX'
  ));

COMMIT;

-- Verification:
-- SELECT status, COUNT(*) FROM roadmap_proposal.proposal GROUP BY status ORDER BY status;
-- Expected: 6 distinct statuses (DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE, DEPLOYED)
-- SELECT COUNT(*) FROM roadmap_proposal.proposal WHERE status != UPPER(status);
-- Expected: 0
```

**Note on CHECK constraint design:** The constraint lists both title-case AND UPPERCASE values because: (a) the trigger converts to UPPERCASE before CHECK evaluates, so only UPPERCASE values actually reach the column; (b) listing both forms provides a clear error message if the trigger is somehow bypassed; (c) matches reference_terms exactly for FK consistency. The trigger is the real defense; the CHECK is belt-and-suspenders.

### Phase 2: Code Cleanup

**Safe to change (proposal.status only — now UPPERCASE after migration):**

| File | Line | Change |
|---|---|---|
| `scripts/orchestrator.ts` | 888 | `LOWER(p.status) IN (...)` → `p.status IN ('DRAFT','REVIEW','DEVELOP','MERGE')` |
| `scripts/bootstrap-state-machine.ts` | 45 | `LOWER(status) IN (...)` → `status IN ('DRAFT','REVIEW','DEVELOP','MERGE')` |
| `scripts/bootstrap-state-machine.ts` | 105 | `LOWER(status) = 'develop'` → `status = 'DEVELOP'` |

**Must keep (intentional LOWER() for cross-table comparisons):**

| File | Line | Reason |
|---|---|---|
| `src/core/pipeline/pipeline-cron.ts` | 1278 | Compares against `transition_queue.to_stage` (title-case) — intentional |
| `src/infra/postgres/proposal-storage-v2.ts` | 513-514 | `proposal_valid_transitions` is already UPPERCASE but LOWER() is harmless safety net |
| `src/infra/postgres/proposal-storage-v2.ts` | 567 | `proposal_state_transitions` historical data — mixed case, out of scope |
| `src/core/dag/dag-health.ts` | 664-672 | Historical transition records — mixed case, out of scope |
| `src/core/proposal/proposal-integrity.ts` | 125-126 | `proposal_valid_transitions` safety net — harmless |

**No change needed:**

| File | Line | Reason |
|---|---|---|
| `scripts/discord-bridge.ts` | 211 | Case-sensitive NOT IN works correctly after proposal.status normalization |
| `src/core/infrastructure/terminology.ts` | all | Display layer — title-case is correct for UI |

### Phase 3: Input Guard

In `src/infra/postgres/proposal-storage-v2.ts` `createProposal()`, normalize status before INSERT:
```typescript
initialStatus = initialStatus.toUpperCase();
```

This is belt-and-suspenders with the trigger — explicit UPPER() in code, trigger as defense-in-depth.

## Acceptance Criteria

1. All proposal.status values normalized to UPPERCASE in live DB:
   `SELECT status, COUNT(*) FROM roadmap_proposal.proposal GROUP BY status ORDER BY status;`
   Expected: DRAFT(38), REVIEW(15), DEVELOP(29), MERGE(4), COMPLETE(66), DEPLOYED(34)

2. Zero residual mixed-case:
   `SELECT COUNT(*) FROM roadmap_proposal.proposal WHERE status != UPPER(status);`
   Expected: 0

3. Exactly 6 distinct statuses:
   `SELECT COUNT(DISTINCT status) FROM roadmap_proposal.proposal;`
   Expected: 6 (DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE, DEPLOYED)

4. Trigger functional: INSERT with title-case produces UPPERCASE in column.
   ```sql
   BEGIN;
   INSERT INTO roadmap_proposal.proposal (display_id, type, status, title, audit)
   VALUES ('P306-TEST', 'issue', 'Draft', 'Test trigger', '[]'::jsonb);
   SELECT status FROM roadmap_proposal.proposal WHERE display_id = 'P306-TEST';
   -- Expected: 'DRAFT'
   ROLLBACK;
   ```

5. CHECK constraint functional: direct INSERT bypassing trigger with invalid value fails.
   ```sql
   -- This should fail (value not in CHECK list):
   INSERT INTO roadmap_proposal.proposal (display_id, type, status, title, audit)
   VALUES ('P306-TEST2', 'issue', 'INVALID', 'Test check', '[]'::jsonb);
   ```

6. Code cleanup verified: LOWER() removed from orchestrator.ts:888, bootstrap-state-machine.ts:45+105.
   `grep -n "LOWER.*status" scripts/orchestrator.ts scripts/bootstrap-state-machine.ts`
   Expected: no matches

7. LOWER() preserved where required:
   `grep -n "LOWER.*status\|LOWER.*stage" src/core/pipeline/pipeline-cron.ts`
   Expected: line 1278 still has LOWER()

8. No regressions: orchestrator dispatches gate agents for mature proposals.
   `sudo journalctl -u agenthive-orchestrator --since "5 min ago" | grep -i "gate\|dispatch"`
   Expected: normal dispatch output, no errors

## Non-Goals

- Not touching `workflow_stages` — already canonical UPPERCASE.
- Not adding DEPLOYED to the Standard RFC workflow (separate lifecycle state).
- Not refactoring `normalizeState()` in orchestrator.ts — keeping as defense-in-depth.
- Not normalizing `proposal_valid_transitions` — already UPPERCASE.
- Not normalizing `proposal_state_transitions` — historical data, 261 mixed-case rows (41%), separate concern.
- Not changing `transition_queue.to_stage` to UPPERCASE — 98.7% title-case, requires rewriting SQL functions in 4 migrations + views + triggers. Out of scope. Lower() comparisons handle this correctly.
- Not changing `terminology.ts` CanonicalStatus to UPPERCASE — display layer, title-case is correct for UI.

## Risks

- **CHECK constraint with both cases**: Lists both 'Draft' and 'DRAFT' etc. This means a direct INSERT with title-case would pass CHECK (bypassing trigger). Mitigation: trigger runs BEFORE CHECK on INSERT/UPDATE. Only raw COPY or disabled triggers could bypass. Acceptable risk.
- **Deploy order**: migration must run before code changes. Safe to deploy migration first (trigger handles new inserts), then clean up code.
- **proposal_state_transitions not normalized**: 261 rows with mixed case. Any code querying these must keep LOWER(). Out of scope for P306.
- **terminology.ts root cause not "fixed"**: normalizeStatus() still returns title-case. The trigger catches it at DB boundary. This is the correct layered approach — display layer stays readable, DB layer stays canonical.
