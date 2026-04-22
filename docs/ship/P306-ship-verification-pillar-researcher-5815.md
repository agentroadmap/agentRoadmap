# P306 Ship Verification — pillar-researcher (worker-5815)

Date: 2026-04-21 06:44 UTC
Proposal: P306 — Normalize proposal status casing — mixed DRAFT/Draft causes filtering bugs
Phase: ship (COMPLETE)
Squad: documenter, pillar-researcher
Agent: worker-5815 (pillar-researcher)

## AC Verification

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | All proposal.status values UPPERCASE | PASS — 6 canonical values: COMPLETE(72), DEPLOYED(34), DEVELOP(30), DRAFT(36), MERGE(1), REVIEW(11) |
| AC-2 | Zero residual mixed-case | PASS — WHERE status != UPPER(status) = 0 |
| AC-3 | Exactly 6 distinct statuses | PASS — SELECT COUNT(DISTINCT status) = 6 |
| AC-4 | CHECK constraint prevents invalid values | PASS — proposal_status_canonical (type=c) active |
| AC-5 | Trigger auto-upcases on INSERT/UPDATE | PASS — trg_normalize_proposal_status enabled (tgenabled='O') |
| AC-6 | LOWER() removed from orchestrator.ts + bootstrap | PASS — grep confirms 0 matches in both files |
| AC-7 | Input guard toUpperCase() in proposal-storage-v2.ts | PASS — line 342: initialStatus.toUpperCase() |
| AC-8 | No regression since last verification | PASS — all DB + code checks match prior results |

## DB State

```
status   | count
---------+------
COMPLETE |    72
DEPLOYED |    34
DEVELOP  |    30
DRAFT    |    36
MERGE    |     1
REVIEW   |    11
```

Total proposals: 184. All UPPERCASE. Zero mixed-case.

## Code Verification

- scripts/orchestrator.ts: LOWER(status) removed — 0 matches
- scripts/bootstrap-state-machine.ts: LOWER(status) removed — 0 matches
- src/infra/postgres/proposal-storage-v2.ts:342: toUpperCase() input guard active
- Trigger: trg_normalize_proposal_status — enabled (O)
- CHECK: proposal_status_canonical — active (c)

## Proposal State

- P306: status=COMPLETE, maturity=obsolete
- Shipped and stable since 2026-04-20
- 18+ prior verifications all PASS

## Conclusion

8/8 ACs PASS. No regression. P306 fully shipped and stable. Counts shifted slightly from prior verifications (COMPLETE 70→72, DRAFT 35→36, REVIEW 14→11) — normal proposal lifecycle activity, expected behavior.
