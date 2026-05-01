-- ============================================================
-- P595: model DDL for hiveCentral
-- Central model catalog, routing table, and per-host model
-- access policies for the two-tier control plane.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (rw on model_route, r on model/host_model_policy),
--             agenthive_observability (r everywhere),
--             agenthive_agency (r on model/model_route/host_model_policy)
-- Min PG:     14  (required for CREATE OR REPLACE TRIGGER)
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS control_model;

COMMENT ON SCHEMA control_model IS
  'Model catalog layer for hiveCentral: registered LLM/tool models, routing table '
  'mapping model IDs to hosts and API endpoints, and per-host allowlist/denylist '
  'policies. The orchestrator resolves model_route at dispatch time; agencies use '
  'the resolved path to spawn the correct process.';

-- ============================================================
-- control_model.set_updated_at() — trigger function
-- Uses clock_timestamp() so updated_at advances within a transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION control_model.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- control_model.model — registered model catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS control_model.model (
  id                        BIGSERIAL    PRIMARY KEY,
  model_id                  TEXT         UNIQUE NOT NULL,   -- 'claude-sonnet-4', 'gpt-4o-mini', etc.
  provider                  TEXT         NOT NULL,          -- 'anthropic', 'openai', 'google', etc.
  display_name              TEXT         NOT NULL,
  tier                      TEXT         NOT NULL DEFAULT 'standard'
                                         CHECK (tier IN ('frontier','standard','budget')),
  context_window            INT,                            -- max context tokens; NULL if unknown
  supports_tools            BOOLEAN      NOT NULL DEFAULT false,
  supports_vision           BOOLEAN      NOT NULL DEFAULT false,
  cost_per_million_input    NUMERIC(12,4),                  -- USD; NULL if not publicly priced
  cost_per_million_output   NUMERIC(12,4),
  -- Catalog hygiene:
  owner_did                 TEXT         NOT NULL,
  lifecycle_status          TEXT         NOT NULL DEFAULT 'active'
                                         CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at             TIMESTAMPTZ,
  retire_after              TIMESTAMPTZ,
  notes                     TEXT,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_provider_active
  ON control_model.model (provider)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS model_tier_active
  ON control_model.model (tier)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS model_deprecated_at
  ON control_model.model (deprecated_at);

COMMENT ON TABLE control_model.model IS
  'Catalog of all LLM and tool-model identifiers known to this installation. '
  'model_id is the canonical handle used in roadmap.yaml, spawn policies, and '
  'dispatch. tier drives host_model_policy enforcement (max_tier). '
  'Rows are never hard-deleted — set lifecycle_status = ''retired'' with deprecated_at.';

COMMENT ON COLUMN control_model.model.model_id IS
  'Canonical model handle, e.g. ''claude-sonnet-4'', ''gpt-4o-mini''. '
  'Used by spawn policies, routing, and cost accounting.';

COMMENT ON COLUMN control_model.model.tier IS
  'frontier = top-of-range, highest cost; standard = mid-tier production; '
  'budget = cost-optimised, lower capability. Used by host_model_policy.max_tier.';

COMMENT ON COLUMN control_model.model.context_window IS
  'Maximum input+output token context window. NULL means unspecified or variable.';

COMMENT ON COLUMN control_model.model.cost_per_million_input IS
  'USD cost per 1 M input tokens at list price. NULL for models without public pricing.';

CREATE OR REPLACE TRIGGER set_updated_at_model
  BEFORE UPDATE ON control_model.model
  FOR EACH ROW EXECUTE FUNCTION control_model.set_updated_at();

-- ============================================================
-- control_model.model_route — host-specific routing entries
-- ============================================================
CREATE TABLE IF NOT EXISTS control_model.model_route (
  id               BIGSERIAL    PRIMARY KEY,
  route_name       TEXT         UNIQUE NOT NULL,            -- 'claude-sonnet-bot', 'gpt4o-hostA1'
  model_id         BIGINT       NOT NULL
                               REFERENCES control_model.model (id) ON DELETE RESTRICT,
  host             TEXT         NOT NULL,                   -- host_name from core.host
  cli_path         TEXT,                                    -- absolute path to CLI binary, if applicable
  api_key_env      TEXT,                                    -- env var name holding the API key secret
  base_url         TEXT,                                    -- override base URL (proxies, local endpoints)
  spawn_toolsets   TEXT,                                    -- space-separated toolset slugs to load on spawn
  priority         INT          NOT NULL DEFAULT 100,       -- lower = preferred; used when multiple routes match
  -- Catalog hygiene:
  owner_did        TEXT         NOT NULL,
  lifecycle_status TEXT         NOT NULL DEFAULT 'active'
                               CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at    TIMESTAMPTZ,
  retire_after     TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_route_model_host_active
  ON control_model.model_route (model_id, host, priority)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS model_route_host_active
  ON control_model.model_route (host)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS model_route_deprecated_at
  ON control_model.model_route (deprecated_at);

COMMENT ON TABLE control_model.model_route IS
  'Routing table mapping a model to a host-specific invocation path. The orchestrator '
  'selects the lowest-priority active route for a (model_id, host) pair at dispatch. '
  'api_key_env names the environment variable the spawning process reads — the secret '
  'itself is never stored here; use control_credential.credential for that.';

COMMENT ON COLUMN control_model.model_route.route_name IS
  'Human-readable routing entry name, unique across all routes.';

COMMENT ON COLUMN control_model.model_route.host IS
  'Logical host label matching core.host.host_name. Soft FK (not a REFERENCES) '
  'to keep model_route bootstrappable before core.host is populated.';

COMMENT ON COLUMN control_model.model_route.cli_path IS
  'Absolute path to the CLI binary on the named host, e.g. /usr/local/bin/claude. '
  'NULL for pure-API routes that do not spawn a subprocess.';

COMMENT ON COLUMN control_model.model_route.api_key_env IS
  'Name of the environment variable that holds the API key, '
  'e.g. ANTHROPIC_API_KEY. The value is injected by the credential subsystem at spawn.';

COMMENT ON COLUMN control_model.model_route.priority IS
  'Route selection priority. Lower value wins. When multiple active routes exist for '
  'the same (model_id, host), the lowest priority row is selected.';

CREATE OR REPLACE TRIGGER set_updated_at_model_route
  BEFORE UPDATE ON control_model.model_route
  FOR EACH ROW EXECUTE FUNCTION control_model.set_updated_at();

-- ============================================================
-- control_model.host_model_policy — per-host access policy
-- ============================================================
-- Simplified: no full lifecycle hygiene fields needed for a policy
-- row that is always replaced rather than versioned. created_at and
-- updated_at are sufficient; UNIQUE(host) enforces one policy per host.
CREATE TABLE IF NOT EXISTS control_model.host_model_policy (
  id                BIGSERIAL    PRIMARY KEY,
  host              TEXT         NOT NULL,                  -- host_name from core.host
  policy_mode       TEXT         NOT NULL DEFAULT 'allowlist'
                                 CHECK (policy_mode IN ('allowlist','denylist','open')),
  allowed_providers TEXT[],                                 -- populated when policy_mode = 'allowlist'
  denied_providers  TEXT[],                                 -- populated when policy_mode = 'denylist'
  max_tier          TEXT
                                 CHECK (max_tier IN ('frontier','standard','budget')),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (host)
);

CREATE INDEX IF NOT EXISTS host_model_policy_mode
  ON control_model.host_model_policy (policy_mode);

COMMENT ON TABLE control_model.host_model_policy IS
  'Per-host model access policy. Exactly one row per host (enforced by UNIQUE). '
  'policy_mode = ''allowlist'' restricts to allowed_providers; ''denylist'' blocks '
  'denied_providers; ''open'' permits all. max_tier caps the model tier that may '
  'be routed to this host (NULL = no cap). The orchestrator evaluates this policy '
  'before selecting a model_route.';

COMMENT ON COLUMN control_model.host_model_policy.policy_mode IS
  'allowlist: only providers in allowed_providers are permitted. '
  'denylist: all providers except those in denied_providers are permitted. '
  'open: no provider restriction (max_tier still applies if set).';

COMMENT ON COLUMN control_model.host_model_policy.max_tier IS
  'Maximum model tier allowed on this host. NULL = no cap. '
  'Prevents high-cost frontier models from being routed to budget hosts.';

CREATE OR REPLACE TRIGGER set_updated_at_host_model_policy
  BEFORE UPDATE ON control_model.host_model_policy
  FOR EACH ROW EXECUTE FUNCTION control_model.set_updated_at();

-- ============================================================
-- Views
-- ============================================================
CREATE OR REPLACE VIEW control_model.v_active_routes AS
SELECT
  r.route_name,
  r.host,
  r.priority,
  m.model_id,
  m.provider,
  m.display_name,
  m.tier,
  m.context_window,
  m.supports_tools,
  m.supports_vision,
  r.cli_path,
  r.api_key_env,
  r.base_url,
  r.spawn_toolsets
FROM control_model.model_route r
JOIN control_model.model m ON m.id = r.model_id
WHERE r.lifecycle_status = 'active'
  AND m.lifecycle_status = 'active'
ORDER BY r.host, r.priority;

COMMENT ON VIEW control_model.v_active_routes IS
  'Active routing entries with joined model metadata. Ordered by (host, priority) '
  'for direct use by the orchestrator dispatch path.';

CREATE OR REPLACE VIEW control_model.v_host_routing AS
SELECT
  r.host,
  r.route_name,
  r.priority,
  m.model_id,
  m.provider,
  m.tier,
  p.policy_mode,
  p.allowed_providers,
  p.denied_providers,
  p.max_tier
FROM control_model.model_route r
JOIN control_model.model m           ON m.id = r.model_id
LEFT JOIN control_model.host_model_policy p ON p.host = r.host
WHERE r.lifecycle_status = 'active'
  AND m.lifecycle_status = 'active';

COMMENT ON VIEW control_model.v_host_routing IS
  'Route + policy join. The orchestrator uses this to evaluate whether a candidate '
  'route passes the host policy before dispatching.';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA control_model TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA control_model TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON control_model.model_route        TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON control_model.host_model_policy  TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA control_model TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA control_model TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA control_model TO agenthive_observability;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA control_model TO agenthive_agency;
    GRANT SELECT ON control_model.model,
                    control_model.model_route,
                    control_model.host_model_policy,
                    control_model.v_active_routes,
                    control_model.v_host_routing TO agenthive_agency;
  END IF;
END $$;

\echo 'control_model schema applied.'
