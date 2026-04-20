# P298: Multi-provider orchestration — Design Document

## Problem Statement

Currently, only one OfferProvider runs per gate-pipeline process. The startup script (`scripts/start-gate-pipeline.ts`) creates a single `OfferProvider` with one `agentIdentity`. After P297, `hermes/agency-xiaomi` self-registers and claims offers — but no other agency can compete.

Three gaps block multi-agency dispatch:
1. **Single-provider startup** — one process, one identity, one OfferProvider
2. **No provider_registry scoping** — `fn_claim_work_offer` matches capabilities but ignores project/squad opt-in
3. **No project_id on offers** — PipelineCron INSERTs without `project_id`, so even if we filter by provider_registry, there's nothing to filter on

## Current Architecture

```
PipelineCron.processTransitionWithOffer()
  → INSERT squad_dispatch (offer_status='open', project_id=NULL)
  → pg_notify('work_offers')

OfferProvider (single instance, identity=hermes/agency-xiaomi)
  → LISTEN work_offers
  → fn_claim_work_offer(identity, caps, ttl)  ← no project/squad filter
  → spawnAgent() → complete()
```

Key tables:
- `squad_dispatch` — has `project_id` column (FK to projects) but always NULL
- `provider_registry` — has `agency_id`, `project_id`, `squad_name`, `capabilities` — wired into nothing
- `agent_capability` — what `fn_claim_work_offer` actually checks

## Proposed Design

### Change 1: Multi-Provider Manager

Replace the single OfferProvider in `start-gate-pipeline.ts` with a manager that spawns N providers, one per registered agency.

**Approach:** Read `agent_registry` where `agent_type='agency'` and `status='active'`. For each, read capabilities from `agent_capability`. Create one `OfferProvider` per agency. All share the same DB pool but each has its own identity and LISTEN connection.

**Key decisions:**
- All providers run in one process (simpler deployment) — each gets its own pg listener connection
- `maxConcurrent` per provider stays configurable (default 1)
- Provider list is read at startup; hot-reload is out of scope (restart to pick up new agencies)

**Files:**
- `src/core/pipeline/offer-provider.ts` — add `OfferProviderManager` class
- `scripts/start-gate-pipeline.ts` — use manager when offer dispatch enabled

### Change 2: Wire provider_registry into fn_claim_work_offer

Add optional `p_project_id` and `p_squad_name` parameters. When provided, the claim query JOINs against `provider_registry` to verify the claiming agency has opted in.

**SQL change (migration):**
```sql
CREATE OR REPLACE FUNCTION roadmap_workforce.fn_claim_work_offer(
  p_agent_identity TEXT,
  p_required_capabilities JSONB DEFAULT '{}'::jsonb,
  p_lease_ttl_seconds INT DEFAULT 20,
  p_project_id BIGINT DEFAULT NULL,      -- NEW
  p_squad_name TEXT DEFAULT NULL          -- NEW
)
```

The candidate CTE adds:
```sql
-- Verify agency opted in for this project/squad via provider_registry
AND EXISTS (
  SELECT 1 FROM roadmap_workforce.provider_registry pr
  JOIN roadmap_workforce.agent_registry ar ON ar.id = pr.agency_id
  WHERE ar.agent_identity = p_agent_identity
    AND pr.is_active = true
    AND (p_project_id IS NULL OR pr.project_id = p_project_id OR pr.project_id IS NULL)
    AND (p_squad_name IS NULL OR pr.squad_name = p_squad_name OR pr.squad_name IS NULL)
)
```

**Backward compatibility:** NULL params = no filtering (same behavior as today).

### Change 3: Project/squad context in offer metadata

PipelineCron's `processTransitionWithOffer` already computes `squadName` and has `proposalIdNum`. Add `project_id` to the INSERT:

```sql
INSERT INTO roadmap_workforce.squad_dispatch
  (proposal_id, squad_name, dispatch_role, dispatch_status,
   offer_status, agent_identity, required_capabilities, metadata, project_id)
VALUES ($1, $2, $3, 'open', 'open', NULL, $4::jsonb, $5::jsonb, $6)
```

Also include `project_id` in offer metadata JSON for observability.

**Where does project_id come from?**
- From `proposal.tags->>'project_id'` if set
- From a default project (e.g., the first active project)
- NULL if unspecified (backward compatible)

### Change 4: pg_notify on claim and complete

Add `pg_notify('work_offers_claimed', ...)` in `fn_claim_work_offer` after the UPDATE.
Add `pg_notify('work_offers_completed', ...)` in `fn_complete_work_offer` after the UPDATE.

Payload format:
```json
{
  "event": "claimed",
  "dispatch_id": 123,
  "proposal_id": 456,
  "agent_identity": "hermes/agency-xiaomi",
  "project_id": 1
}
```

This enables:
- Dashboard real-time feed of offer lifecycle
- Orchestrator awareness of which agency is working on what
- Debugging multi-provider races

## File Impact Summary

| File | Change |
|------|--------|
| `scripts/migrations/NNN-p298-multi-provider.sql` | fn_claim_work_offer params, pg_notify |
| `src/core/pipeline/offer-provider.ts` | OfferProviderManager class |
| `scripts/start-gate-pipeline.ts` | Use manager, read agencies from DB |
| `src/core/pipeline/pipeline-cron.ts` | Add project_id to offer INSERT |
| `tests/unit/offer-provider.test.ts` | Manager tests, project_id filter tests |

## Dependencies

- P281 (Resource hierarchy) — COMPLETE
- P289 (Pull-based dispatch + provider_registry) — DEVELOP
- P297 (Hermes agency self-registration) — COMPLETE

## Risks

1. **LISTEN connection storm** — N providers = N pg connections. Mitigation: shared connection with channel filtering, or connection pool limits.
2. **Race on project_id** — If proposals don't have project_id set, all offers look the same. Mitigation: default project assignment or explicit NULL = "any provider can claim."
3. **Provider hot-reload** — Adding a new agency requires restart. Acceptable for now; hot-reload is a future enhancement.
