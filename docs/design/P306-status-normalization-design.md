# P306: Normalize Proposal Status Casing — Design Document

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Eliminate mixed-case status values in the proposal table so that all status comparisons are deterministic and no code path depends on runtime case normalization.

**Architecture:** Normalize existing data to UPPERCASE (matching workflow_stages and proposal_valid_transitions), add a DB constraint to prevent regression, update the config file, and fix code paths that write title-case defaults.

---

## Problem Analysis

### Root Cause

There are two sources of truth for status casing that disagree:

| Source | Casing | Example |
|--------|--------|---------|
| `workflow_stages.stage_name` | UPPERCASE | `DRAFT`, `REVIEW`, `DEVELOP` |
| `proposal_valid_transitions.from_state` | UPPERCASE | `DRAFT`, `REVIEW`, `DEVELOP` |
| `roadmap.yaml` → `statuses` | Title-case | `Draft`, `Review`, `Develop` |
| `proposal-storage-v2.ts` fallback | Title-case | `"Draft"` (line 336) |
| `terminology.ts` STATUS_MAP values | Title-case | `Draft`, `Review`, `Develop` |

When proposals are created through paths that bypass workflow validation (no workflow configured, or legacy inserts), they get the title-case default `"Draft"` from code or config.

### Current State (live DB)

```
status   | count
---------+------
Complete |    13   ← title-case
COMPLETE |    53   ← uppercase (canonical)
DEPLOYED |    34   ← uppercase (canonical)
Develop  |    18   ← title-case
DEVELOP  |    11   ← uppercase (canonical)
Draft    |     8   ← title-case
DRAFT    |    32   ← uppercase (canonical)
Merge    |     2   ← title-case
Review   |     3   ← title-case
REVIEW   |    10   ← uppercase (canonical)
```

54 proposals have non-canonical (title-case) status values.

### Impact

1. **Gate dispatch miss**: `orchestrator.ts:30` does `WHERE status = 'Active'` (exact match) — misses uppercase variants.
2. **Gate transition miss**: `pg-handlers.ts:460` has `gateTransitions` map keyed by title-case (`Draft`, `Review`). If `current.status` is `DRAFT`, the lookup returns `undefined`, skipping the gate note requirement.
3. **Board display**: The board groups case-insensitively (works), but the config `statuses` list defines title-case column names. If a proposal has `DEVELOP`, the canonical lookup may create a separate column or merge incorrectly depending on config order.
4. **Future breakage**: Any new SQL query or code path that forgets `.toLowerCase()` will silently miss proposals.

---

## Design Decisions

### Decision 1: Target casing = UPPERCASE

**Rationale**: `workflow_stages` and `proposal_valid_transitions` (the DB-level source of truth for valid states) both use UPPERCASE. Aligning the proposal table to match eliminates join mismatches and is the least disruptive change.

**Trade-off**: Some code uses title-case constants (terminology.ts). Those will continue to work because they normalize with `.toLowerCase()` before comparing. No code depends on reading the raw DB status and displaying it without transformation.

### Decision 2: DB-level enforcement via CHECK constraint

A CHECK constraint ensures that any INSERT or UPDATE that tries to set a non-uppercase status fails immediately, rather than silently creating another mixed-case row.

```sql
ALTER TABLE roadmap_proposal.proposal
  ADD CONSTRAINT proposal_status_uppercase
  CHECK (status = UPPER(status));
```

### Decision 3: Normalize at write boundary, not read boundary

Currently, dozens of code sites call `.toLowerCase()` on every read. After DB normalization, most of those can be removed (simplification). The write path (`createProposal`, `transitionProposal`, MCP handlers) should normalize input to UPPERCASE before writing.

### Decision 4: Update roadmap.yaml to UPPERCASE

The `statuses` list in `roadmap.yaml` should match the DB canonical values. This fixes the board column naming and the `default_status` fallback.

---

## Implementation Plan

### Task 1: Migration SQL — normalize existing data

**File**: `scripts/migrations/043-normalize-status-casing.sql`

```sql
-- Normalize all proposal.status to UPPERCASE
-- Matches workflow_stages and proposal_valid_transitions casing

BEGIN;

-- 1. Normalize title-case statuses to UPPERCASE
UPDATE roadmap_proposal.proposal SET status = 'DRAFT'    WHERE status = 'Draft';
UPDATE roadmap_proposal.proposal SET status = 'REVIEW'   WHERE status = 'Review';
UPDATE roadmap_proposal.proposal SET status = 'DEVELOP'  WHERE status = 'Develop';
UPDATE roadmap_proposal.proposal SET status = 'MERGE'    WHERE status = 'Merge';
UPDATE roadmap_proposal.proposal SET status = 'COMPLETE' WHERE status = 'Complete';

-- 2. Verify: should return only canonical UPPERCASE values
-- SELECT status, COUNT(*) FROM roadmap_proposal.proposal GROUP BY status ORDER BY status;

-- 3. Add CHECK constraint to prevent future mixed-case inserts
ALTER TABLE roadmap_proposal.proposal
  ADD CONSTRAINT proposal_status_uppercase
  CHECK (status = UPPER(status));

COMMIT;
```

**Verification**:
```sql
SELECT status, COUNT(*) FROM roadmap_proposal.proposal GROUP BY status ORDER BY status;
-- Expected: only DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE, DEPLOYED, REJECTED, DISCARDED
```

### Task 2: Update roadmap.yaml statuses to UPPERCASE

**File**: `roadmap.yaml`

Change:
```yaml
statuses:
  - Draft
  - Review
  - Develop
  - Merge
  - Complete
  - Rejected
  - Abandoned
  - Replaced
```

To:
```yaml
statuses:
  - DRAFT
  - REVIEW
  - DEVELOP
  - MERGE
  - COMPLETE
  - REJECTED
  - ABANDONED
  - REPLACED
default_status: DRAFT
```

### Task 3: Fix code write boundary — proposal-storage-v2.ts

**File**: `src/infra/postgres/proposal-storage-v2.ts`

Line 336: Change fallback from `"Draft"` to `"DRAFT"`:
```typescript
// Before:
initialStatus = startStage ?? "Draft";

// After:
initialStatus = (startStage ?? "DRAFT").toUpperCase();
```

Also normalize `input.status` to UPPERCASE before using it:
```typescript
// Line ~327: normalize input
const normalizedInputStatus = input.status?.toUpperCase();
```

### Task 4: Fix MCP handler gate transitions map

**File**: `src/apps/mcp-server/tools/proposals/pg-handlers.ts`

Lines 459-463: Change gateTransitions keys from title-case to UPPERCASE:
```typescript
// Before:
const gateTransitions: Record<string, string[]> = {
  Draft: ["Review"],
  Review: ["Develop"],
  Develop: ["Merge"],
  Merge: ["Complete"],
};

// After:
const gateTransitions: Record<string, string[]> = {
  DRAFT: ["REVIEW"],
  REVIEW: ["DEVELOP"],
  DEVELOP: ["MERGE"],
  MERGE: ["COMPLETE"],
};
```

Also normalize `current.status` before lookup:
```typescript
const normalizedStatus = (current.status ?? "").toUpperCase();
const allowedTargets = gateTransitions[normalizedStatus];
```

### Task 5: Fix orchestrator.ts hardcoded status strings

**File**: `src/core/orchestration/orchestrator.ts`

Lines 30, 9-10: Use UPPERCASE:
```typescript
// Before:
const complete = await this.getProposalsByStatus('Complete');
const active = await this.getProposalsByStatus('Active');

// After:
const complete = await this.getProposalsByStatus('COMPLETE');
// 'Active' is not a real status — remove or use 'DEVELOP'
const active = await this.getProposalsByStatus('DEVELOP');
```

### Task 6: Review and simplify status.ts / terminology.ts

**Files**: `src/shared/utils/status.ts`, `src/core/infrastructure/terminology.ts`

After DB normalization, the `.toLowerCase()` calls in read paths still work correctly (they match either way). But we should:

1. Update `STATUS_MAP` in terminology.ts to map to UPPERCASE canonical values:
```typescript
export const STATUS_MAP: Record<string, CanonicalStatus> = {
  draft: "DRAFT" as CanonicalStatus,
  // ... etc
};
```

2. Update `CanonicalStatus` type to use UPPERCASE:
```typescript
export type CanonicalStatus =
  | "DRAFT"
  | "REVIEW"
  | "DEVELOP"
  | "MERGE"
  | "COMPLETE"
  | "REJECTED"
  | "DISCARD"
  | "REPLACED";
```

**Scope note**: This is a larger refactor. For P306, tasks 1-5 are sufficient to fix the actual bugs. Task 6 can be deferred to a follow-up proposal if it's too invasive.

### Task 7: Migration verification script

**File**: `scripts/migrations/043-verify.sql`

```sql
-- Run after migration to verify no mixed-case statuses remain
SELECT status, COUNT(*) FROM roadmap_proposal.proposal GROUP BY status ORDER BY status;

-- Verify constraint exists
SELECT conname, contype FROM pg_constraint
WHERE conrelid = 'roadmap_proposal.proposal'::regclass
AND conname = 'proposal_status_uppercase';

-- Verify no lowercase/title-case proposals exist
SELECT id, display_id, status FROM roadmap_proposal.proposal WHERE status != UPPER(status);
-- Expected: 0 rows
```

---

## Verification Steps

1. Run migration SQL
2. Run verification SQL (0 mixed-case rows)
3. Create a new proposal via MCP — verify status is `DRAFT` (uppercase)
4. Transition a proposal via MCP — verify status is `REVIEW` (uppercase)
5. Check board display — verify single column per state, no duplicates
6. Check orchestrator report — verify counts are correct
7. Restart services: `sudo systemctl restart agenthive-mcp agenthive-orchestrator`

---

## Out of Scope

- Removing `.toLowerCase()` calls from read paths (safe to leave, reduces risk)
- Changing terminology.ts CanonicalStatus type (too invasive, follow-up)
- Modifying the board UI grouping logic (already handles case-insensitive matching)
