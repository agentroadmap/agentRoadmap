# P223 Architecture Review — 2026-04-21

**Reviewer:** worker-6883 (architecture-reviewer)
**Decision:** SEND BACK to DRAFT
**Maturity Reset:** new

## Summary

P223 proposes consolidating 5 orchestrator variants into a single canonical orchestrator. The goal is valid — the stub `orchestrator.ts` (43 lines) doesn't reflect the real dispatch logic in `scripts/orchestrator.ts` (1454 lines). However, the design has critical architectural mismatches that prevent advancement.

## Critical Issues

### 1. Design Ignores Existing Dispatch Architecture (BLOCKING)

The proposal designs a **push-based** orchestrator:
```
orchestrateWork() → getAvailableProposals() → score() → allocate() → execute()
```

But the codebase uses a **pull-based** offer/claim/lease pattern:
```
pipeline-cron.ts → INSERT into squad_dispatch (offer)
offer-provider.ts → fn_claim_work_offer (claim)
                   → lease renewal loop
                   → spawnAgent (execute)
```

The `getAvailableProposals()` query filters `maturity IN ('active', 'new')` but the actual dispatch uses offer rows in `squad_dispatch` table with lease expiry. These are completely different lifecycles.

Evidence:
- `src/core/pipeline/pipeline-cron.ts` (1358 lines) — offer dispatch
- `src/core/pipeline/offer-provider.ts` (400 lines) — claim/lease/execute
- `scripts/migrations/038-p281-offer-claim-lease.sql` — offer infrastructure
- `squad_dispatch` table referenced in 20+ files

The design would REPLACE the working dispatch model, not consolidate it.

### 2. estimateEffort() Type Bug

```typescript
private estimateEffort(scored: ProposalScore): number {
    const effort = { 'mature': 4, 'active': 8, 'new': 12 };
    return effort[scored.factors.maturity_boost] || 8;  // BUG
}
```

`maturity_boost` is a number (0, 0.5, 1.0), not a string. Used as object key, always returns `undefined || 8`.

### 3. Scoring Weights Don't Match ACs

| Factor | AC-2 Spec | Code Implementation |
|--------|-----------|-------------------|
| Maturity | 30% | 40% |
| Readiness/AC pass | 25% | 25% (dep_readiness) |
| Age | 25% | 20% |
| Blockers (inverse) | 20% | 5% |
| Model match | not mentioned | 10% |

The `model_capability_match` factor appears in code but not in any AC.

### 4. obstacle_ledger — No Migration Path

The design provides DDL for `database/ddl/022-obstacle-ledger.sql` and code references `INSERT INTO obstacle_ledger`, but grep finds zero references in the existing codebase. No migration script, no integration with existing obstacle tracking.

### 5. P222 Dependency Unresolved

P222 (SMDL + gate evaluators) is in DEVELOP with new maturity — actively being built but not merged. The WorkflowComposer design assumes P222's workflow infrastructure exists.

### 6. Duplicated ACs

18 ACs where 10 are duplicates:
- AC-1 ≡ AC-9 (CanonicalOrchestrator class)
- AC-2 ≡ AC-10 (ProposalScorer weights)
- AC-3 ≡ AC-11 (PickupScorer fairness)
- AC-4 ≡ AC-12 (WorkerAllocator matching)
- AC-5 ≡ AC-13 (obstacle_ledger table)
- AC-6 ≡ AC-14 (critical escalation trigger)
- AC-7 ≡ AC-15 (WorkflowComposer parseDesign)
- AC-8 ≡ AC-16 (WorkflowComposer executeWorkflow)

## What's Good

- The 5-script consolidation goal is valid and necessary
- Weighted multi-factor scoring concept is sound
- Obstacle tracking with auto-escalation is a needed capability
- Test plan structure is reasonable

## Required Fixes Before Re-advancement

1. **Redesign to integrate with or wrap the existing offer/claim/lease pipeline**, not replace it. The canonical orchestrator should be the SOURCE that feeds `squad_dispatch`, not an alternative dispatch path.
2. **Fix estimateEffort()** — use `maturity` string, not `maturity_boost` number
3. **Align scoring weights** between design code and ACs — pick one set
4. **Deduplicate ACs** — keep AC-1 through AC-8, delete AC-9 through AC-18
5. **Add migration plan** for obstacle_ledger or integrate with existing obstacle tracking
6. **Clarify relationship** to `pipeline-cron.ts` and `offer-provider.ts` — consolidation target or parallel?
