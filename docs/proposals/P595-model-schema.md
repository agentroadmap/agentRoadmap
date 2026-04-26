# P595 — Model Schema (enhanced)

**Status:** Enhanced via 4-expert squad review. Maturity: mature pending gate review.
**Parent:** P590. **Schema family file (target):** `database/ddl/hivecentral/004-model.sql`.
**Depends on:** P594 (`agency`).
**Reviewers:** Product Manager, Backend Architect, AI Engineer, Software Architect (parallel squad, 2026-04-26).

---

## 1. Synthesis

### Why

The orchestrator dispatches by **route**, not by model — a route binds a model + CLI path + rate limits + priority + cost multiplier. The same model can have several routes (`claude-opus-default`, `claude-opus-fast`, `claude-opus-batch`) with different scheduling characteristics. Per-host policy gates which routes may run where (data-residency, budget caps). Without this schema, routing logic lives scattered in env vars and code.

### Scope (4 tables)

- `model.model_capability` — controlled vocabulary (long-context, tool-use, vision, code-review, structured-output, reasoning, streaming, cache-aware)
- `model.model` — LLM registry (provider × model_id) with cost columns + capabilities[]
- `model.model_route` — routes binding model + cli_path + rate limits + priority + cost_multiplier + fallback chain
- `model.host_model_policy` — explicit (host_id, route_id) rows with `is_allowed` boolean

### Public API

```
model.get_route(route_id)                              → {route, model, capabilities, cost}
model.list_allowed_routes_for_host(host_id)            → route_id[]
model.list_active_routes_for_capabilities(caps[])      → route_id[]
model.is_route_allowed_on_host(route_id, host_id)      → bool
model.get_model_capabilities(model_id)                 → capability[]
```

Routing decisions are made in **application code** (orchestrator's `dispatch/selector` module) — not stored procedures. Reason: routing is stateful (depends on agency capacity, budget, latency targets); observability requires structured policy traces; weights evolve per A/B test. The schema is the source of truth, not the decision-maker. The selector writes a row to `observability.model_routing_outcome` (P604) with candidate scores + reasons for replay/explainability.

---

## 2. Concrete table outlines (full DDL ships in `004-model.sql`)

```sql
-- Capability vocabulary (controlled, ~8 base set; new entries via Tier-A proposal)
CREATE TABLE model.model_capability (
  capability_id     BIGSERIAL PRIMARY KEY,
  capability_name   TEXT NOT NULL UNIQUE,
  description       TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('reasoning','coding','vision','retrieval','tool-use','io','context')),
  -- catalog hygiene fields
);

-- Models — registered LLMs
CREATE TABLE model.model (
  model_id          TEXT PRIMARY KEY,                 -- 'claude-opus-4-7' | 'gpt-5' | 'codex-large'
  provider_id       TEXT NOT NULL REFERENCES agency.agency_provider,
  display_name      TEXT NOT NULL,
  context_window    INT NOT NULL CHECK (context_window > 0),
  -- Pricing: BOTH per-1k (back-compat) AND per-1M (forward standard); orchestrator uses per-1M if non-null
  cost_in_per_1k    NUMERIC(10,6),
  cost_out_per_1k   NUMERIC(10,6),
  cost_in_per_m     NUMERIC(10,6),
  cost_out_per_m    NUMERIC(10,6),
  cache_hit_per_1k  NUMERIC(10,6),                    -- prompt-caching providers (Claude, Gemini)
  cache_write_per_1k NUMERIC(10,6),
  capabilities      TEXT[] NOT NULL DEFAULT '{}',     -- references model_capability.capability_name
  is_enabled        BOOLEAN NOT NULL DEFAULT true,
  metadata          JSONB NOT NULL DEFAULT '{}',      -- provider-specific quirks (max_output_tokens, vision_limits, snapshot_pin, …)
  -- catalog hygiene fields
  CONSTRAINT cost_pricing_required CHECK (cost_in_per_1k IS NOT NULL OR cost_in_per_m IS NOT NULL)
);

-- Routes — the actual unit of dispatch selection
CREATE TABLE model.model_route (
  route_id              TEXT PRIMARY KEY,             -- 'claude-opus-default' | 'claude-opus-fast' | 'cheap-codex'
  model_id              TEXT NOT NULL REFERENCES model.model,
  display_name          TEXT NOT NULL,
  cli_path              TEXT,                          -- optional override (e.g., enterprise CLI binary)
  rate_limit_rpm        INT CHECK (rate_limit_rpm IS NULL OR rate_limit_rpm > 0),
  rate_limit_tpm        INT CHECK (rate_limit_tpm IS NULL OR rate_limit_tpm > 0),
  rate_limit_concurrent INT CHECK (rate_limit_concurrent IS NULL OR rate_limit_concurrent > 0),
  priority              INT NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
  cost_multiplier       NUMERIC(4,2) NOT NULL DEFAULT 1.0 CHECK (cost_multiplier > 0),
  fallback_route_id     TEXT REFERENCES model.model_route, -- explicit fallback chain (per AI Engineer #5)
  fallback_condition    TEXT CHECK (fallback_condition IN ('rate_limit','model_unavailable','capability_mismatch','timeout')),
  is_enabled            BOOLEAN NOT NULL DEFAULT true,
  metadata              JSONB NOT NULL DEFAULT '{}',
  -- catalog hygiene fields
);

CREATE INDEX model_route_priority ON model.model_route (priority)
  WHERE is_enabled = true AND lifecycle_status = 'active';

-- Per-host route policy: explicit (host, route) rows with is_allowed
CREATE TABLE model.host_model_policy (
  policy_id      BIGSERIAL PRIMARY KEY,
  host_id        BIGINT NOT NULL REFERENCES core.host ON DELETE CASCADE,
  route_id       TEXT NOT NULL REFERENCES model.model_route ON DELETE CASCADE,
  is_allowed     BOOLEAN NOT NULL,
  deny_reason    TEXT,                                  -- audit when is_allowed=false (data-residency, budget cap, …)
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to   TIMESTAMPTZ,
  owner_did      TEXT NOT NULL,
  notes          TEXT,
  UNIQUE (host_id, route_id)
);

CREATE INDEX host_model_policy_allowed ON model.host_model_policy (host_id, route_id)
  WHERE is_allowed = true AND effective_to IS NULL;
```

---

## 3. Cost snapshotting (mutable schema, immutable history)

Models and routes are **mutable** (cost changes weekly when providers reprice; rate limits update). Audit trail comes from `governance.decision_log` events on every UPDATE, not row versioning.

To prevent in-flight dispatches from being charged at a new price mid-task, **dispatch captures a cost snapshot** at claim time:

```sql
-- in <tenant>.dispatch.work_claim
cost_snapshot JSONB  -- {model_id, route_id, cost_in_per_m, cost_out_per_m, cache_hit_per_1k, snapshot_at}
```

`<tenant>.efficiency.cost_ledger` rows reference the snapshot, not the live model row. Historical cost reports stay consistent across pricing updates.

---

## 4. AI-agent specifics

### Token economics granularity

`observability.agent_execution_span` (P604) carries per-call breakdowns:

```
input_tokens_fresh          -- × cost_in_per_m
input_tokens_cached         -- × cache_hit_per_1k
image_tokens                -- provider-specific multiplier
output_tokens               -- × cost_out_per_m
cache_creation_tokens       -- × cache_write_per_1k
cost_breakdown_jsonb        -- { fresh: $, cached: $, images: $, ... }
```

`model.metadata` carries per-provider economics:

```jsonc
{
  "anthropic": {
    "cache_ttl_hours": 5,
    "cache_write_multiplier": 1.25,
    "max_output_tokens": 8192,
    "vision_per_image_tokens": 1568
  },
  "openai": { ... }
}
```

### Capability vocabulary (v1 base set, ~8 entries)

`long-context`, `tool-use`, `vision`, `code-review`, `structured-output`, `reasoning`, `streaming`, `cache-aware`. New capabilities require Tier-A self-evo proposal. Prevents drift; capability-to-cost mapping stays auditable.

### Routing explainability (queryable "why?")

Every routing decision writes `observability.model_routing_outcome` with **structured fields**, not just a `selection_reason TEXT`:

```sql
selection_reason_kind       TEXT  -- 'capability_match' | 'host_policy_constraint' | 'cost_optimization' | 'latency_target' | 'fallback'
selection_reason_code       TEXT  -- machine-readable composite code
candidate_routes_scored     JSONB -- [{route_id, score, capability_match, capacity_available, p99_latency_ms, cost_estimate, policy_allowed, rank_reason}]
evaluation_policy_id        TEXT  -- hash of policy version used (replay)
```

This makes "why did my proposal get sonnet instead of opus" answerable in one query.

### Three autonomous-agent gotchas

1. **Context-window exhaustion mid-task** — child spawns inherit context budget. Briefing carries `estimated_context_budget_tokens`; orchestrator refuses to spawn if `estimated_budget > context_tokens_remaining`. Logs to `decision_explainability`.
2. **Model deprecation breaking in-flight spawns** — between `deprecated_at` and `retire_after`, a model is **usable for existing leases only** (renewal-time check). At `retire_after`, in-flight leases auto-roll-forward to the declared `fallback_route_id`. Every auto-rollforward writes to `governance.decision_log`.
3. **Credential leakage via tracebacks** — credential errors logged as structured `{credential_id, vault_provider, outcome}` only. No vault paths or values in error messages. CI lint rejects `err.toString()` near credential code.

### Model versioning (snapshot pin without row explosion)

Three-tier scheme:
1. Logical name = primary key (`claude-opus-4-7`)
2. Provider snapshot pin in `metadata.provider_snapshot` (`claude-opus-4-7-20251001`)
3. Per-dispatch override in `briefing.model_snapshot_pin` (rare; for strict reproducibility)

Default behavior: provider returns latest snapshot; dispatch contract logs the actual snapshot received.

---

## 5. Bootstrap seed (Anthropic + xiaomi/nous + OpenAI/codex)

```sql
-- Capabilities first
INSERT INTO model.model_capability (capability_name, description, category, owner_did) VALUES
  ('long-context',      '>100k token context window',                   'context',     'did:hive:bootstrap'),
  ('tool-use',          'Function calling / MCP / structured tools',    'tool-use',    'did:hive:bootstrap'),
  ('vision',            'Image and video input',                         'vision',      'did:hive:bootstrap'),
  ('code-review',       'Diff analysis with structured output',          'coding',      'did:hive:bootstrap'),
  ('structured-output', 'JSON Schema / typed output enforcement',        'io',          'did:hive:bootstrap'),
  ('reasoning',         'Explicit chain-of-thought / extended thinking', 'reasoning',   'did:hive:bootstrap'),
  ('streaming',         'Token-by-token output streaming',               'io',          'did:hive:bootstrap'),
  ('cache-aware',       'Prompt caching support',                         'context',     'did:hive:bootstrap');

-- Models (representative Claude family; codex / xiaomi added by their respective onboard proposals)
INSERT INTO model.model (model_id, provider_id, display_name, context_window, cost_in_per_m, cost_out_per_m,
                         cache_hit_per_1k, cache_write_per_1k, capabilities, owner_did) VALUES
  ('claude-opus-4-7',   'claude-code', 'Claude Opus 4.7',   200000, 15.0, 75.0, 1.5,  18.75,
    ARRAY['long-context','tool-use','code-review','reasoning','cache-aware','streaming'], 'did:hive:bootstrap'),
  ('claude-sonnet-4-6', 'claude-code', 'Claude Sonnet 4.6', 200000,  3.0, 15.0, 0.3,   3.75,
    ARRAY['long-context','tool-use','code-review','cache-aware','streaming'],             'did:hive:bootstrap'),
  ('claude-haiku-4-5',  'claude-code', 'Claude Haiku 4.5',  200000,  0.8,  4.0, 0.08,  1.0,
    ARRAY['tool-use','streaming'],                                                         'did:hive:bootstrap');

-- Routes
INSERT INTO model.model_route (route_id, model_id, display_name, priority, cost_multiplier, owner_did) VALUES
  ('claude-opus-default',   'claude-opus-4-7',   'Opus — standard',     200, 1.0, 'did:hive:bootstrap'),
  ('claude-opus-fast',      'claude-opus-4-7',   'Opus — priority',      50, 1.2, 'did:hive:bootstrap'),
  ('claude-sonnet-default', 'claude-sonnet-4-6', 'Sonnet — standard',   150, 1.0, 'did:hive:bootstrap'),
  ('claude-sonnet-cheap',   'claude-sonnet-4-6', 'Sonnet — batch',      250, 0.9, 'did:hive:bootstrap'),
  ('claude-haiku-default',  'claude-haiku-4-5',  'Haiku — standard',    100, 1.0, 'did:hive:bootstrap');

-- Fallback chains: opus → sonnet → haiku on rate-limit
UPDATE model.model_route SET fallback_route_id='claude-sonnet-default', fallback_condition='rate_limit'
  WHERE route_id IN ('claude-opus-default','claude-opus-fast');
UPDATE model.model_route SET fallback_route_id='claude-haiku-default', fallback_condition='rate_limit'
  WHERE route_id IN ('claude-sonnet-default','claude-sonnet-cheap');
```

---

## 6. Migration from v1 (`roadmap.model_routes`, `roadmap.host_model_policy`)

| v1                                        | v3                                | Field changes                                                                            |
|-------------------------------------------|-----------------------------------|------------------------------------------------------------------------------------------|
| `roadmap.model_routes`                    | `model.model_route` + `model.model` (split) | Models extracted to dedicated table; per-model fields no longer duplicated per route |
| `roadmap.host_model_policy.allowed_providers` (TEXT[]) | `model.host_model_policy` (per-row) | Array → explicit row per (host, route) with `is_allowed` boolean + `deny_reason`     |
| Implicit fallback in code                 | `model_route.fallback_route_id` + `fallback_condition` | Now declarative, queryable, observable via `model_routing_outcome`         |

Migration script outline ships in P595 implementation; orphan-count = 0 acceptance gate.

---

## 7. Bounded-context boundary + anti-features

**Reads from** `agency.agency_provider` (provider_id), `core.host` (host_id), `model_capability` (vocabulary).

**Read by** `agency.agency_capacity` (current_route_id), orchestrator's `dispatch/selector` module, observability rollups.

**MUST NOT contain:**
1. Per-call telemetry (latency, token counts, errors) — those live in `observability.agent_execution_span`
2. Current agency load per route — that's `agency.agency_capacity.available_slots`
3. In-flight dispatch counters — derived from `<tenant>.dispatch.work_claim`, not stored here
4. Cached grant/policy decisions — application cache layer (§7.5), not in DB
5. Route weights for scoring — live in `core.runtime_flag` or PolicyEvaluator config, not in `model_route`
6. Provider-specific behavior flags as columns — they go in `metadata` JSONB

---

## 8. Federation (v2 path, deferred)

```sql
-- v2 only; not in v1 schema
model.model_availability (
  model_id          TEXT NOT NULL REFERENCES model.model,
  region_id         TEXT NOT NULL,
  is_available      BOOLEAN NOT NULL,
  cost_variance_pct NUMERIC,         -- e.g., +10% cross-region
  latency_offset_ms INT,
  PRIMARY KEY (model_id, region_id)
);
```

`model.model` rows stay global (one definition); availability + cost variance per region. `select_route` becomes region-aware. Defer until any tenant requires multi-region.

---

## 9. Acceptance criteria for P595

- [ ] `database/ddl/hivecentral/004-model.sql` defines 4 tables + 2 views + bootstrap seed for capability vocabulary + Claude family models/routes
- [ ] CHECK constraint enforces at least one cost-pricing column populated
- [ ] `host_model_policy` is per-row with `is_allowed` boolean + `deny_reason` (no array fields)
- [ ] `fallback_route_id` + `fallback_condition` columns on `model_route` for declared fallback chains
- [ ] `cost_snapshot JSONB` column added to dispatch.work_claim DDL (cross-schema; coordinated with P603/dispatch design)
- [ ] Bootstrap seeds 8 base capabilities and Claude opus/sonnet/haiku routes
- [ ] Migration script from `roadmap.model_routes` + `roadmap.host_model_policy` runs idempotently; orphan count = 0
- [ ] `observability.model_routing_outcome` schema reserves the structured fields (selection_reason_kind, candidate_routes_scored, evaluation_policy_id) — coordination point with P604

---

## 10. Open questions

1. **Routing-decision lifecycle** — when an operator marks a model deprecated, should the platform automatically open a Tier-A migration proposal to projects still routing to it? Recommend: yes, governance compliance check writes one row per affected project.
2. **Per-project cost overrides** — negotiated pricing for a specific project. Recommend: not in `model.model_route` (keeps catalog clean); lives in `project.project_budget_policy` cost-multiplier override field.
3. **Capability matching strictness** — superset (route has ≥ requested caps; default) vs exact (no overkill). Recommend: superset, with a `capability_overkill_penalty` in scorer to discourage running opus when haiku suffices.
4. **Rate-limit invariant under priority** — should higher-priority routes always have ≥ rate limits than lower-priority? Recommend: yes, document in CONVENTIONS.md to prevent priority inversion.
5. **Cost-update audit cadence** — every UPDATE to model/route writes a `governance.decision_log` event (kind=`model_pricing_change`). At what rate does this become noisy? Recommend: rate-limit pricing updates to 1/day per route via runtime_flag.

---

## Appendix — Squad transcript

PM, Backend Architect, AI Engineer, Software Architect outputs merged. Convergence: dual per-1k + per-1M pricing, route as scheduling unit (not model), explicit (host, route) policy rows, declarative fallback chains, application-side selector with structured policy trace, mutable schema with cost snapshots in dispatch contract, three autonomous-agent gotchas (context exhaustion, deprecation rollforward, credential redaction). All within established v3 patterns; no new architectural primitives required.
