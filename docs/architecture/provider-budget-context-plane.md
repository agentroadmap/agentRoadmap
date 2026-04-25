# Provider, Budget, and Context Governance Plane

**Status:** Architecture (P414 component)

**Audience:** Platform architects, service developers, MCP tool builders, TUI/web dashboard implementers.

**Purpose:** Define how AgentHive manages heterogeneous AI providers, enforces token/spend budgets across organizational scopes, routes models based on capability and cost, and controls LLM context windows within budget constraints. This plane is **control-database-resident** and must be visible across projects, hosts, agencies, and UI surfaces.

---

## 1. Provider Account Model

A **provider account** is the credential-scoped billing container for a specific AI provider. It is the unit at which credentials are rotated, budgets are capped, and cost is aggregated.

### Core Entity: `provider_account`

| Field | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `provider_account_id` | UUID | control | Unique identifier |
| `provider` | TEXT | control | Provider family: `anthropic`, `openai`, `google`, `xiaomi`, `nous`, `github`, `ollama` |
| `account_name` | TEXT | control | Human-friendly name (e.g. `anthropic-console-1`, `openai-org-staging`) |
| `plan_type` | ENUM | control | `token_plan`, `api_key_plan`, `subscription`, `local` |
| `credential_ref` | TEXT | control | Vault path or env var reference (e.g. `vault:agenthive/anthropic/console-1`, `env:NOUS_API_KEY`) — never raw secrets |
| `base_url` | TEXT | control | Override endpoint, if not provider default |
| `owner_scope` | ENUM | control | `global` \| `project` \| `agency` — controls visibility |
| `owner_id` | UUID | control | project_id, agency_id, or NULL for global |
| `credential_status` | ENUM | control | `active`, `rotating`, `expired`, `revoked`, `missing` |
| `created_at` | TIMESTAMP | control | When account was registered |
| `expires_at` | TIMESTAMP | control | Credential expiration, or NULL for no expiry |
| `last_rotated_at` | TIMESTAMP | control | Last time credential was rotated |
| `notes` | TEXT | control | Operational metadata (billing account, contact, policy notes) |

### Plan Type: Token Plan

Prepaid token bucket with hard ceiling.

| Field | Type | Semantics |
| :--- | :--- | :--- |
| `plan_token_budget.total_token_budget` | BIGINT | Total tokens prepaid (e.g. 1M, 10M) |
| `plan_token_budget.consumed_tokens` | BIGINT | Tokens used to date |
| `plan_token_budget.remaining` | COMPUTED | `total - consumed` |
| `plan_token_budget.expires_at` | TIMESTAMP | Plan expires and is no longer usable |
| `plan_token_budget.refill_cadence` | ENUM | `monthly`, `quarterly`, `annually`, `never` |
| `plan_token_budget.next_refill_at` | TIMESTAMP | When the next refill will occur |

**Pre-flight check:**
```sql
SELECT remaining FROM plan_token_budget
WHERE provider_account_id = $1
  AND remaining >= requested_tokens
  AND expires_at > now();
-- Fails if result is empty or remaining < requested_tokens.
```

### Plan Type: API Key Plan

Pay-as-you-go metering with soft spending cap.

| Field | Type | Semantics |
| :--- | :--- | :--- |
| `api_key_plan.api_key_env` | TEXT | Environment variable holding the key (e.g. `OPENAI_API_KEY`) |
| `api_key_plan.rate_limit_rpm` | INT | Requests per minute; None = uncapped |
| `api_key_plan.rate_limit_tpm` | INT | Tokens per minute; None = uncapped |
| `api_key_plan.monthly_spend_cap_usd` | DECIMAL | Soft cap; can be exceeded momentarily |
| `api_key_plan.current_month_spend_usd` | DECIMAL | YTD spend in current calendar month |
| `api_key_plan.is_frozen` | BOOLEAN | If true, no new spawns use this account |
| `api_key_plan.freeze_reason` | TEXT | Why frozen (e.g. `cap_exceeded`, `rate_limit_hit`) |

**Pre-flight check:**
```sql
SELECT monthly_spend_cap_usd, current_month_spend_usd
FROM api_key_plan
WHERE provider_account_id = $1
  AND is_frozen = false
  AND (monthly_spend_cap_usd IS NULL OR current_month_spend_usd < monthly_spend_cap_usd);
-- Budget enforcer (tool/budget-enforcer) listens on spending_log_insert trigger,
-- aggregates daily/monthly, and sets is_frozen if cap exceeded.
```

### Plan Type: Subscription

Flat-fee plan with rate limits but no per-token visibility.

| Field | Type | Semantics |
| :--- | :--- | :--- |
| `subscription.plan_name` | TEXT | e.g. `Claude Code Pro`, `GitHub Copilot for Business` |
| `subscription.rate_limit_rpm` | INT | Requests per minute |
| `subscription.rate_limit_tpm` | INT | Tokens per minute |
| `subscription.monthly_cost_usd` | DECIMAL | Flat fee (for observability only) |
| `subscription.renews_at` | TIMESTAMP | When the subscription renews |

**Billing:** Spend is opportunity cost of token quota consumed, not direct $/token. Still tracked for context budget purposes via `spending_log` using estimated per-token rates.

### Plan Type: Local

No billing, only compute cost (Ollama, local model servers).

| Field | Type | Semantics |
| :--- | :--- | :--- |
| `local.ollama_base_url` | TEXT | e.g. `http://localhost:11434` |
| `local.models` | TEXT[] | Available local models |

**Billing:** Token usage tracked in `spending_log` with `cost_usd = 0` for budget accounting, but entries are recorded to include in context policy and concurrency limits.

---

## 2. Model Catalog vs. Model Route

AgentHive separates **static model metadata** (catalog) from **runtime executable policy** (route).

### Model Catalog: `model_catalog`

Descriptive, provider-published metadata. Single record per unique model across all providers.

| Field | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `model_name` | TEXT | control | `claude-sonnet-4-6`, `gpt-4o`, `xiaomi/mimo-v2-pro` |
| `model_provider` | TEXT | control | `anthropic`, `openai`, `google`, `xiaomi` |
| `context_window` | INT | control | Max input tokens (e.g. 200k) |
| `output_limit` | INT | control | Max output tokens (e.g. 4k) |
| `training_cutoff` | DATE | control | Last training data |
| `capabilities` | TEXT[] | control | `['reasoning', 'coding', 'vision', 'tool_use']` |
| `objective_rating` | NUMERIC | control | LMSYS Elo-like scale (1200–1330) |
| `status` | ENUM | control | `available`, `deprecated`, `deprecated_soon`, `test_only` |
| `published_at` | TIMESTAMP | control | When provider published this model |

### Model Route: `model_route`

The **executable runtime policy**. Binds a model to a provider account, CLI, and cost structure. One model can have multiple routes.

| Field | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `route_id` | UUID | control | Unique route identifier |
| `model_name` | TEXT | control | FK to `model_catalog` |
| `route_provider` | TEXT | control | Which provider (e.g. `anthropic`, `nous`) |
| `provider_account_id` | UUID | control | FK to `provider_account` |
| `agent_provider` | TEXT | control | Which CLI uses this route: `claude`, `hermes`, `copilot`, `ollama` |
| `agent_cli` | TEXT | control | Executable name: `claude`, `codex`, `hermes`, `copilot-cli` |
| `cli_path` | TEXT | control | Full path to CLI (e.g. `/usr/local/bin/claude`) |
| `api_spec` | TEXT | control | API protocol: `anthropic`, `openai`, `gemini`, `custom` |
| `base_url` | TEXT | control | Override endpoint for this route |
| `priority` | INT | control | Resolution order (0 = highest) |
| `is_default` | BOOLEAN | control | Only one per `agent_provider` |
| `is_enabled` | BOOLEAN | control | Route is available for spawning |
| `cost_per_million_input` | DECIMAL | control | USD per 1M input tokens |
| `cost_per_million_output` | DECIMAL | control | USD per 1M output tokens |
| `cost_per_million_cache_write` | DECIMAL | control | USD per 1M cache-write tokens |
| `cost_per_million_cache_hit` | DECIMAL | control | USD per 1M cache-read tokens |
| `cache_pricing` | ENUM | control | `included`, `separate`, `free` |
| `spawn_toolsets` | TEXT | control | Comma-separated toolsets granted to spawned agents (e.g. `web,terminal,file`) |
| `spawn_delegate` | BOOLEAN | control | If true, spawned agents can delegate further |
| `api_key_env` | TEXT | control | Primary env var for API key |
| `api_key_fallback_env` | TEXT | control | Fallback env var (OpenAI-compatible) |
| `base_url_env` | TEXT | control | Env var to override base URL |
| `capabilities` | TEXT[] | control | Capabilities advertised for this route (inherited or customized) |
| `objective_rating` | NUMERIC | control | Rating override per route (or use model catalog) |
| `created_at` | TIMESTAMP | control | When route was registered |
| `updated_at` | TIMESTAMP | control | Last update |

### Resolution: `resolveModelRoute()`

When an agent must be spawned, the runtime calls `resolveModelRoute(model_hint, agent_provider, host)`:

```sql
SELECT * FROM model_route
WHERE model_name = $1
  AND agent_provider = $2
  AND is_enabled = true
  AND api_key_env IS NOT NULL  -- credential is accessible
  AND EXISTS (
    SELECT 1 FROM host_model_policy
    WHERE host_name = $3
      AND allowed_route_providers @> ARRAY[route_provider]
  )
ORDER BY priority ASC
LIMIT 1;
-- Fails closed: if no route matches, spawner warns [P235] and falls back to provider default.
```

**P235 Integration:** Platform-Aware Model Constraints enforce that a model hint from one CLI (e.g. `claude-sonnet-4-6` on Claude Code) cannot leak to another platform (e.g. Hermes). The query's `agent_provider` filter ensures platform isolation.

---

## 3. Token Plan vs. API Key Plan Budget Enforcement

Budget checks happen at **two gates**: before claim and before spawn. Different plan types use different mechanics.

### Gate 1: Pre-Claim Budget Check

Before an agent can claim a work offer, all budget scopes must have headroom.

**Token Plan:**
```sql
WITH budget_check AS (
  SELECT
    'global' AS scope_type,
    COALESCE(SUM(ptp.remaining), 0) AS remaining
  FROM provider_account pa
    LEFT JOIN plan_token_budget ptp ON pa.provider_account_id = ptp.provider_account_id
  WHERE pa.owner_scope = 'global'
    AND ptp.expires_at > now()
  UNION ALL
  SELECT
    'project' AS scope_type,
    COALESCE(SUM(ptp.remaining), 0)
  FROM provider_account pa
    LEFT JOIN plan_token_budget ptp ON pa.provider_account_id = ptp.provider_account_id
  WHERE pa.owner_scope = 'project'
    AND pa.owner_id = $project_id
    AND ptp.expires_at > now()
)
SELECT * FROM budget_check WHERE remaining >= $estimated_tokens;
-- Fails if any scope has remaining < estimated_tokens.
```

**API Key Plan (soft check):**
```sql
SELECT pa.provider_account_id
FROM provider_account pa
  LEFT JOIN api_key_plan akp ON pa.provider_account_id = akp.provider_account_id
WHERE pa.owner_id = $project_id
  AND (akp.monthly_spend_cap_usd IS NULL OR akp.current_month_spend_usd < akp.monthly_spend_cap_usd)
  AND akp.is_frozen = false;
-- Soft fail: can proceed even if near cap; budget enforcer will freeze if overage detected.
```

### Gate 2: Pre-Spawn Budget Check

Before the CLI is invoked, confirm credentials are active and budget is still available.

```sql
SELECT
  pa.provider_account_id,
  pa.credential_status,
  CASE
    WHEN pa.plan_type = 'token_plan'
      THEN (SELECT remaining FROM plan_token_budget WHERE provider_account_id = pa.provider_account_id)
    WHEN pa.plan_type = 'api_key_plan'
      THEN (SELECT monthly_spend_cap_usd - current_month_spend_usd FROM api_key_plan WHERE provider_account_id = pa.provider_account_id)
    ELSE NULL
  END AS budget_remaining
FROM provider_account pa
WHERE pa.provider_account_id = $selected_account_id
  AND pa.credential_status = 'active'
  AND (pa.expires_at IS NULL OR pa.expires_at > now());
-- Fails if credential_status != 'active' or credential is expired.
```

### Spend Tracking and Enforcement

Every run records tokens and cost to `spending_log(agent_identity, proposal_id, dispatch_id, cost_usd, input_tokens, output_tokens, cache_tokens, timestamp)`.

**Budget Enforcer** (`tool/budget-enforcer`) listens on `pg_notify('spending_log_insert')`:

1. Aggregates daily spend per scope (global, project, agency, provider_account, route)
2. Checks against hard daily/monthly caps
3. If exhausted:
   - Sets `api_key_plan.is_frozen = true`
   - Inserts escalation log entry
   - Notifies Hermes (Andy) to pause or request contingency
4. Token plans decrement `plan_token_budget.consumed_tokens` synchronously
5. On plan refill cadence, `plan_token_budget.remaining` resets

---

## 4. Credential Vault & Rotation

Secrets are stored outside the database. The DB stores only **references** and **metadata**.

### Credential Reference Patterns

| Pattern | Storage | Rotation | Access |
| :--- | :--- | :--- | :--- |
| `vault:namespace/path` | HashiCorp Vault | API-driven | Spawner requests at runtime |
| `env:ENV_VAR_NAME` | Environment variables (systemd, shell) | Manual or CI/CD | Spawner reads from process environment |
| `sops:path/to/secret.yaml` | SOPS-encrypted file in repo | git-crypt or CI/CD | Spawner decrypts with key |
| `1password:item-id` | 1Password vault | 1Password agent | Spawner queries 1Password agent |

### Credential Lifecycle

| Phase | Action | Owner | Notes |
| :--- | :--- | :--- | :--- |
| **Provision** | Create provider_account row with `credential_ref` and status=`active` | Platform engineer | Credential already exists in vault/env |
| **Active** | Spawner resolves `credential_ref` at spawn time | Runtime (spawner) | Fails closed if ref missing or malformed |
| **Rotating** | New credential provisioned in vault/env; status updated to `rotating` | Platform engineer | Old credential still accepted during grace window |
| **Expired** | status set to `expired`; spawner refuses | Automation (cron) or manual | Can be re-activated by changing status |
| **Revoked** | Credential manually invalidated in vault; status set to `revoked` | Platform engineer (security incident) | Spawner immediately refuses |

### Pre-Spawn Credential Check

```sql
SELECT pa.credential_ref, pa.credential_status, pa.expires_at
FROM provider_account pa
WHERE pa.provider_account_id = $account_id
  AND pa.credential_status IN ('active', 'rotating');
-- Fails if status = 'expired', 'revoked', 'missing'.

-- Spawner then:
-- 1. Resolve credential_ref to actual secret (vault lookup, env read, etc.)
-- 2. Inject into spawned process
-- 3. If resolution fails, escalate security incident
```

### Rotation Workflow

1. New credential generated in vault/env
2. provider_account.credential_status set to `rotating`
3. Spawner accepts both old and new credentials (try primary, then fallback)
4. Old credential revoked in vault/env
5. After observation period (e.g., 24 hours), status set to `active` (point to new credential only)
6. On next spawn, old credential is no longer in scope

---

## 5. Context Policy Plane

Context policy belongs in the control database because it determines how agents are packaged and how much budget is consumed.

### Core Entity: `context_policy`

| Field | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `policy_id` | UUID | control | Unique identifier |
| `scope_type` | ENUM | control | `global`, `project`, `agency`, `proposal` |
| `scope_id` | UUID | control | project_id, agency_id, proposal_id, or NULL for global |
| `max_prompt_tokens` | INT | control | Maximum tokens in system + user messages (before LLM response) |
| `max_history_tokens` | INT | control | Maximum tokens from prior messages in thread |
| `retrieval_policy` | ENUM | control | `none`, `kb_topk`, `kb_vector`, `full_proposal_chain` |
| `retrieval_topk` | INT | control | Number of KB rows to include (if retrieval_policy != `none`) |
| `summarization_policy` | ENUM | control | `none`, `rolling_summary`, `hierarchical`, `smart_drop` |
| `attachment_policy_max_files` | INT | control | Max files per request |
| `attachment_policy_max_bytes_per_file` | INT | control | Max bytes per file (e.g. 10MB) |
| `attachment_policy_allowed_mimetypes` | TEXT[] | control | Whitelist (e.g. `['application/pdf', 'text/plain']`) |
| `truncation_behavior` | ENUM | control | `head`, `tail`, `smart_drop` |
| `created_at` | TIMESTAMP | control | When policy was created |
| `updated_at` | TIMESTAMP | control | Last update |

### Policy Application

When **PipelineCron** or **OfferProvider** assembles a spawn payload:

1. Look up `context_policy` for all applicable scopes (global → project → agency → proposal)
2. Use highest-specificity policy (proposal > agency > project > global)
3. Apply retrieval policy to fetch KB rows or proposal history
4. Apply summarization policy to compress context
5. Apply truncation behavior if total tokens exceed `max_prompt_tokens`
6. Count final prompt tokens and add to run record for spend tracking

**Example:** A proposal in agency X, project Y has:
- Global policy: `max_prompt_tokens = 100k, retrieval = none`
- Project policy: `max_prompt_tokens = 80k, retrieval = kb_topk, retrieval_topk = 10`
- Agency policy: `summarization = rolling_summary`
- Proposal policy: (none)

**Result:** Use project policy (highest specificity), add agency's rolling summary, fetch top-10 KB rows, cap at 80k tokens total.

---

## 6. Cross-Project / Cross-Host Routing Rules

Route resolution is a **seven-gate pipeline**. Each gate must pass; failure closes the spawn.

### The Seven Gates

| Gate | Check | Fails If |
| :--- | :--- | :--- |
| **1. Project Subscription** | Does this provider account's scope grant access to this project? | provider_account.owner_scope = 'agency' but agency not subscribed to project |
| **2. Host Policy** | Does the host allow this route_provider? | host_model_policy.allowed_route_providers does not include route.route_provider |
| **3. Capability Match** | Does the route advertise all required_capabilities? | route.capabilities missing any in offer.required_capabilities |
| **4. Provider Account Scope** | Is this provider_account visible to this project? | provider_account.owner_scope = 'global' ✓, 'project' + owner_id = project_id ✓, 'agency' + subscription ✓ |
| **5. Budget Headroom** | Do all budget scopes have remaining budget? | global, project, agency, provider_account, route, proposal, or dispatch budget exhausted |
| **6. Route Availability** | Is the route enabled, credential active, endpoint reachable? | route.is_enabled = false \| credential_status != 'active' \| health check fails |
| **7. Concurrency Ceiling** | Is the agency under max_concurrent_claims for this scope? | agency.max_concurrent_claims exceeded (proposal, project, or global scope) |

**Pseudocode:**

```typescript
async function routeOffer(offer, agency, host): Route {
  // Gate 1: Project subscription
  if (!isAgencySubscribedTo(agency, offer.project_id)) {
    escalate('ProjectSubscriptionMissing', offer, agency);
    return null;
  }

  // Gate 2: Host policy
  const hostPolicy = await getHostModelPolicy(host);
  const allowedProviders = hostPolicy.allowed_route_providers;
  const candidates = await queryRoutes({
    modelName: offer.modelHint,
    agentProvider: agency.preferred_provider,
    routeProviders: allowedProviders,
    isEnabled: true
  });
  if (candidates.length === 0) {
    escalate('NoHostRoutePolicyMatch', offer, host);
    return null;
  }

  // Gate 3: Capability match
  const capableRoutes = candidates.filter(r => 
    offerRequiredCapabilities.every(cap => r.capabilities.includes(cap))
  );
  if (capableRoutes.length === 0) {
    escalate('CapabilityMissing', offer, candidates);
    return null;
  }

  // Gate 4: Provider account scope
  const visibleAccounts = capableRoutes
    .map(r => r.provider_account_id)
    .filter(aid => isAccountVisibleTo(aid, offer.project_id));
  if (visibleAccounts.length === 0) {
    escalate('ProviderAccountNotVisible', offer);
    return null;
  }

  // Gate 5: Budget headroom
  for (const scope of ['global', 'project', 'agency', 'provider_account', 'route', 'proposal', 'dispatch']) {
    if (!(await hasBudgetHeadroom(scope, offer))) {
      escalate('BudgetExhausted', offer, scope);
      return null;
    }
  }

  // Gate 6: Route availability
  for (const route of capableRoutes) {
    const credential = await resolveCredential(route.credential_ref);
    if (!credential || credential.status !== 'active') {
      continue;
    }
    if (!(await isHealthy(route.base_url))) {
      continue;
    }
    // Route is viable.
    // Gate 7: Concurrency ceiling
    const activeClaims = await countActiveClaims(agency.agency_id, offer.project_id);
    if (activeClaims >= agency.max_concurrent_claims) {
      escalate('ConcurrencyCeiling', offer, agency);
      return null;
    }
    return route;
  }

  // No route passed all gates.
  escalate('NoRoutePassed', offer, capableRoutes);
  return null;
}
```

---

## 7. Observability Surface

The TUI, web, and mobile control panels need these views and metrics.

### Per-Provider-Account Dashboard

```sql
SELECT
  pa.account_name,
  pa.plan_type,
  pa.credential_status,
  CASE
    WHEN pa.plan_type = 'token_plan'
      THEN json_build_object(
        'total', ptp.total_token_budget,
        'consumed', ptp.consumed_tokens,
        'remaining', ptp.total_token_budget - ptp.consumed_tokens,
        'expires_at', ptp.expires_at,
        'next_refill_at', ptp.next_refill_at
      )
    WHEN pa.plan_type = 'api_key_plan'
      THEN json_build_object(
        'monthly_cap_usd', akp.monthly_spend_cap_usd,
        'current_month_spend_usd', akp.current_month_spend_usd,
        'is_frozen', akp.is_frozen,
        'freeze_reason', akp.freeze_reason
      )
  END AS plan_details,
  COALESCE(SUM(sl.cost_usd), 0) FILTER (WHERE sl.timestamp > now() - interval '24 hours') AS cost_24h,
  COALESCE(SUM(sl.cost_usd), 0) FILTER (WHERE DATE_TRUNC('month', sl.timestamp) = DATE_TRUNC('month', now())) AS cost_month_to_date
FROM provider_account pa
  LEFT JOIN plan_token_budget ptp ON pa.provider_account_id = ptp.provider_account_id
  LEFT JOIN api_key_plan akp ON pa.provider_account_id = akp.provider_account_id
  LEFT JOIN spending_log sl ON pa.provider_account_id = sl.provider_account_id
GROUP BY pa.provider_account_id;
```

### Per-Route Usage and Cost

```sql
SELECT
  mr.model_name,
  mr.route_provider,
  mr.agent_provider,
  COUNT(*) AS usage_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (sl.completed_at - sl.started_at)))::numeric, 2) AS avg_latency_sec,
  SUM(sl.input_tokens) AS total_input_tokens,
  SUM(sl.output_tokens) AS total_output_tokens,
  ROUND(SUM(sl.cost_usd)::numeric, 2) AS total_cost_usd,
  ROUND((SUM(CASE WHEN sl.success THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100), 1) AS success_rate_pct
FROM spending_log sl
  JOIN model_route mr ON sl.route_id = mr.route_id
WHERE sl.timestamp > now() - interval '30 days'
GROUP BY mr.route_id
ORDER BY total_cost_usd DESC;
```

### Per-Project Spend Rollup

```sql
SELECT
  p.project_id,
  p.slug,
  COALESCE(SUM(sl.cost_usd) FILTER (WHERE DATE_TRUNC('day', sl.timestamp) = now()::date), 0) AS cost_today_usd,
  COALESCE(SUM(sl.cost_usd) FILTER (WHERE DATE_TRUNC('month', sl.timestamp) = DATE_TRUNC('month', now())), 0) AS cost_month_to_date_usd,
  JSONB_OBJECT_AGG(mr.route_provider, SUM(sl.cost_usd)) FILTER (WHERE mr.route_provider IS NOT NULL) AS cost_by_route_provider
FROM control_project.project p
  LEFT JOIN spending_log sl ON p.project_id = sl.project_id
  LEFT JOIN model_route mr ON sl.route_id = mr.route_id
WHERE sl.timestamp > now() - interval '30 days'
GROUP BY p.project_id;
```

### Per-Agency Health and Utilization

```sql
SELECT
  a.agency_id,
  a.identity,
  COUNT(DISTINCT sd.dispatch_id) AS active_claims,
  a.max_concurrent_claims,
  ROUND((COUNT(DISTINCT sd.dispatch_id)::numeric / a.max_concurrent_claims * 100), 1) AS utilization_pct,
  COUNT(DISTINCT CASE WHEN sl.success THEN sd.dispatch_id END)::INT AS successful_runs,
  COUNT(DISTINCT CASE WHEN NOT sl.success THEN sd.dispatch_id END)::INT AS failed_runs,
  ROUND(SUM(sl.cost_usd)::numeric, 2) AS total_cost_usd,
  ROUND(AVG(sl.input_tokens + sl.output_tokens)::numeric, 0) AS avg_tokens_per_run
FROM workforce.agency a
  LEFT JOIN workforce.squad_dispatch sd ON a.agency_id = sd.agency_id AND sd.dispatch_status = 'active'
  LEFT JOIN spending_log sl ON sd.dispatch_id = sl.dispatch_id AND sl.timestamp > now() - interval '24 hours'
GROUP BY a.agency_id;
```

### Per-Host Route Availability and Policy

```sql
SELECT
  h.host_name,
  h.allowed_route_providers,
  COUNT(DISTINCT mr.route_id) AS available_routes,
  JSONB_OBJECT_AGG(mr.model_name, json_build_object(
    'agent_cli', mr.agent_cli,
    'is_default', mr.is_default,
    'is_enabled', mr.is_enabled,
    'objective_rating', mr.objective_rating
  )) AS models
FROM runtime.host h
  LEFT JOIN model_route mr ON h.allowed_route_providers @> ARRAY[mr.route_provider]
    AND mr.is_enabled = true
GROUP BY h.host_id;
```

---

## 8. Implementation Phasing

This provider/budget/context plane integrates with the broader control-plane architecture (P410–P427).

### Phase 1: Boundary Clarification (P410, P414)

- Identify which tables belong to control vs. project (this is mostly done)
- Document provider_account, plan_type, credential_ref patterns
- Define context_policy scope hierarchy
- Prepare DDL for provider_account, plan_token_budget, api_key_plan, context_policy tables

### Phase 2: Control Database Bootstrap (P411)

- Create `agenthive_control` database
- Create `control_models` schema
- Migrate model_catalog, model_routes, host_model_policy
- Create provider_account, plan_token_budget, api_key_plan, credential rotation metadata tables
- Create context_policy tables

### Phase 3: Route Resolution & Spawn Hardening (P414, P235)

- Implement `resolveModelRoute(model_hint, agent_provider, host)` in agent-spawner.ts
- Wire pre-claim and pre-spawn budget checks into OfferProvider
- Integrate credential resolution (vault/env lookup) into spawner
- Add health checks for route availability

### Phase 4: Budget Enforcement Automation (P414)

- Implement budget-enforcer tool agent to listen on spending_log_insert
- Build daily/monthly aggregation queries per scope
- Implement cap enforcement and freeze logic
- Add escalation triggers for near-cap warnings

### Phase 5: Context Policy Application (P414, P231)

- Implement context-builder to apply context_policy during spawn payload assembly
- Add retrieval_policy (KB fetch, proposal history) to context builder
- Add summarization_policy (rolling summary, hierarchical) to context builder
- Wire token counting into spending_log

### Phase 6: Observability & Control Panels (P415)

- Implement TUI dashboard queries for provider/budget/context views
- Implement web API endpoints for spend rollups and route availability
- Add stop/cancel/drain controls to TUI and web
- Build per-project and per-agency dashboards

### Phase 7: Enforcement & Hardening (P418, P419, P420)

- Enforce all seven routing gates with fail-closed semantics
- Implement concurrency ceiling checks per scope
- Implement dispatch retry semantics (no infinite reissuance)
- Add comprehensive integration tests for policy failures

---

## 9. Non-Negotiable Invariants

1. **Credentials never live in the database.** Only `credential_ref` and metadata.
2. **Provider accounts are the billing unit.** No shared API keys; one account per plan type.
3. **Routes are runtime policy.** A model can have multiple routes; always query the route table, never hardcode.
4. **Budget checks happen before claim AND before spawn.** Dual gates prevent double-booking.
5. **Context policy is hierarchical.** Proposal > agency > project > global, with explicit defaults.
6. **All seven routing gates must pass.** Fail closed on any gate; escalate immediately.
7. **Spend is recorded immediately.** Synchronous spending_log writes, not eventual-consistent.
8. **Concurrency is bounded.** Agency max_concurrent_claims is a hard limit.
9. **Credential status is the source of truth.** Spawner obeys credential_status enum; security incidents set it immediately.
10. **Routes are host-policy-aware.** fn_check_spawn_policy enforces allowed_route_providers before spawn.

---

## 10. Cross-References

| Document | Purpose |
| :--- | :--- |
| `/data/code/AgentHive/docs/architecture/control-plane-multi-project-architecture.md` | Multi-database architecture; control-plane vs. project-database ownership |
| `/data/code/AgentHive/CONVENTIONS.md` §12 | Model-to-workflow phase mapping; design intent for which models to use when |
| `/data/code/AgentHive/CONVENTIONS.md` §13 | Financial governance; token ROI and burn rate accountability |
| `/data/code/AgentHive/docs/glossary.md` | Entries: Model Routes, Host Model Policy, Per-Million Pricing, Spending Cap, Spending Log, Budget Allowance, Platform-Aware Model Constraints, Provider Account, Token Efficiency |
| `/data/code/AgentHive/database/migrations/039-model-routes-credential-control.sql` | Credential env var mapping, spawn toolsets, route enablement |
| `/data/code/AgentHive/database/migrations/040-model-routes-defaults-ratings.sql` | Default models per agent_provider, capabilities, objective ratings, cache costs |

---

**Document Status:** Approved for P414 implementation phase. This document captures the architectural contracts; implementation proposals (P414a–P414e) will detail schema, queries, and code changes.
