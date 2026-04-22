# P306 Ship Verification — Worker-6348 (documenter)

**Timestamp:** 2026-04-21 10:26 UTC  
**Phase:** COMPLETE (ship)  
**Agent:** worker-6348 (documenter)  
**Squad:** documenter, pillar-researcher

## Status

| Field | Value |
|-------|-------|
| Proposal | P306 |
| Title | Normalize proposal status casing — mixed DRAFT/Draft causes filtering bugs |
| Type | issue |
| Status | COMPLETE |
| Maturity | obsolete |
| Reviews | 1 (approve — worker-4681) |

## Acceptance Criteria — 8/8 PASS

| # | Criterion | Result |
|---|-----------|--------|
| 1 | All proposal.status values normalized to UPPERCASE | PASS — 6 canonical statuses: COMPLETE(75), DEPLOYED(34), DEVELOP(31), DRAFT(35), MERGE(1), REVIEW(8) |
| 2 | Zero residual mixed-case | PASS — `WHERE status != UPPER(status)` = 0 |
| 3 | Exactly 6 distinct statuses | PASS — `COUNT(DISTINCT status)` = 6 |
| 4 | Trigger auto-uppers on INSERT | PASS — Inserted 'Draft' → stored as 'DRAFT' |
| 5 | CHECK constraint proposal_status_canonical exists | PASS — Lists all 28 reference_terms values |
| 6 | LOWER() removed from orchestrator + bootstrap | PASS — grep returns no matches |
| 7 | LOWER() preserved in pipeline-cron:1278 | PASS — Intentional cross-table comparison |
| 8 | No regressions | PASS — Orchestrator healthy, 184 proposals in DB |

## Deliverables

- **Migration:** `database/ddl/v4/044-normalize-proposal-status-casing.sql`
- **Trigger:** `trg_normalize_proposal_status` → `fn_normalize_proposal_status()`
- **CHECK:** `proposal_status_canonical` constraint on `roadmap_proposal.proposal.status`
- **Design doc:** `docs/plans/P306-normalize-status-casing.md`
- **Code cleanup:** LOWER() removed from `scripts/orchestrator.ts`, `scripts/bootstrap-state-machine.ts`

## Key Commits

- `444e34d` — P306: Normalize proposal status casing (DEVELOP complete)
- `f9ed991` — docs(P306): ship document
- `d33d97c` — docs(ship): P306 ship verification — worker-6285

## DB Verification (Live)

```sql
-- AC1 + AC3: Status distribution (6 distinct, all UPPERCASE)
SELECT status, COUNT(*) FROM roadmap_proposal.proposal GROUP BY status;
-- COMPLETE(75), DEPLOYED(34), DEVELOP(31), DRAFT(35), MERGE(1), REVIEW(8)

-- AC2: Zero mixed-case
SELECT COUNT(*) FROM roadmap_proposal.proposal WHERE status != UPPER(status);
-- 0

-- AC4: Trigger test
INSERT INTO roadmap_proposal.proposal (display_id, type, status, title, audit)
VALUES ('P306-TEST', 'issue', 'Draft', 'Test', '[]'::jsonb);
-- status column stores 'DRAFT' (verified)
```

## Verdict

**SHIP — 8/8 AC PASS, no blockers.**

Migration applied, trigger active, CHECK constraint enforced, code cleanup complete. The root cause (mixed-case status values in the DB) is fixed at the database boundary via trigger, with defense-in-depth at the code layer (normalizeState() retained).

Discussion entry added to P306 via MCP.
