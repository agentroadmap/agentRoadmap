-- Migration 025: Model Registry — Multi-Route Access Table
--
-- Problem: model_metadata.provider assumed one model = one access route.
-- Reality: a model (e.g. xiaomi/mimo-v2-pro) may be reached via multiple routes:
--   - nous      → Hermes/openclaw agents, pay-per-use API
--   - xiaomi    → Claude Code CLI, token plan (free quota) first, then API key
--
-- Solution: keep model_metadata as the capability catalog (UNIQUE model_name,
-- FK dependencies intact), and add model_routes for access details.
--
-- model_routes columns:
--   model_name      FK → model_metadata(model_name)
--   route_provider  who serves this route: 'nous','xiaomi','anthropic','google','openai'
--   agent_provider  which AgentProvider enum may use this route: 'claude','gemini','copilot','openclaw'
--   cost_per_1k_input / cost_per_1k_output  — 0 for token_plan quota
--   plan_type       'token_plan' | 'api_key' | 'free' | null
--   priority        lower = try first (1=token plan, 10=api_key fallback)
--   is_enabled      disable without deleting

BEGIN;

CREATE TABLE IF NOT EXISTS roadmap.model_routes (
  id                  BIGSERIAL PRIMARY KEY,
  model_name          TEXT        NOT NULL REFERENCES roadmap.model_metadata(model_name),
  route_provider      TEXT        NOT NULL,
  agent_provider      TEXT        NOT NULL,   -- 'claude' | 'gemini' | 'copilot' | 'openclaw'
  cost_per_1k_input   NUMERIC     NOT NULL DEFAULT 0,
  cost_per_1k_output  NUMERIC     NOT NULL DEFAULT 0,
  plan_type           TEXT,                  -- 'token_plan' | 'api_key' | 'free' | null
  priority            INT         NOT NULL DEFAULT 10,
  is_enabled          BOOLEAN     NOT NULL DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_name, route_provider, agent_provider)
);

COMMENT ON TABLE roadmap.model_routes IS
  'Access routes per model. A model may have multiple routes (provider × cost profile × plan type).';
COMMENT ON COLUMN roadmap.model_routes.priority IS
  'Route selection order — lower wins. 1 = token plan (free quota first), 10 = pay-as-you-go.';
COMMENT ON COLUMN roadmap.model_routes.agent_provider IS
  'AgentProvider enum value that may use this route (claude/gemini/copilot/openclaw).';

-- ── Seed routes for existing models ────────────────────────────────────────

-- Claude models (Anthropic API, used by claude agents via Claude Code CLI)
INSERT INTO roadmap.model_routes (model_name, route_provider, agent_provider, cost_per_1k_input, cost_per_1k_output, plan_type, priority)
SELECT model_name, 'anthropic', 'claude',
  COALESCE(cost_per_1k_input, 0), COALESCE(cost_per_1k_output, 0),
  'api_key', 10
FROM roadmap.model_metadata
WHERE provider = 'anthropic'
ON CONFLICT (model_name, route_provider, agent_provider) DO NOTHING;

-- Google models (gemini agents)
INSERT INTO roadmap.model_routes (model_name, route_provider, agent_provider, cost_per_1k_input, cost_per_1k_output, plan_type, priority)
SELECT model_name, 'google', 'gemini',
  COALESCE(cost_per_1k_input, 0), COALESCE(cost_per_1k_output, 0),
  'api_key', 10
FROM roadmap.model_metadata
WHERE provider = 'google'
ON CONFLICT (model_name, route_provider, agent_provider) DO NOTHING;

-- OpenAI models (copilot agents)
INSERT INTO roadmap.model_routes (model_name, route_provider, agent_provider, cost_per_1k_input, cost_per_1k_output, plan_type, priority)
SELECT model_name, 'openai', 'copilot',
  COALESCE(cost_per_1k_input, 0), COALESCE(cost_per_1k_output, 0),
  'api_key', 10
FROM roadmap.model_metadata
WHERE provider = 'openai'
ON CONFLICT (model_name, route_provider, agent_provider) DO NOTHING;

-- mimo-v2-pro: nous route (openclaw/Hermes agents, pay-per-use)
INSERT INTO roadmap.model_routes (model_name, route_provider, agent_provider, cost_per_1k_input, cost_per_1k_output, plan_type, priority, notes)
VALUES
  ('xiaomi/mimo-v2-pro',  'nous', 'openclaw', 0.000200, 0.000800, 'api_key',    10, 'Hermes agent via Nous API'),
  ('xiaomi/mimo-v2-omni', 'nous', 'openclaw', 0.000200, 0.000800, 'api_key',    10, 'Hermes agent via Nous API')
ON CONFLICT (model_name, route_provider, agent_provider) DO NOTHING;

-- mimo-v2-pro: xiaomi route (Claude Code CLI, token plan first)
INSERT INTO roadmap.model_routes (model_name, route_provider, agent_provider, cost_per_1k_input, cost_per_1k_output, plan_type, priority, notes)
VALUES
  ('xiaomi/mimo-v2-pro',  'xiaomi', 'claude', 0.000000, 0.000000, 'token_plan', 1, 'Xiaomi token plan — free quota; falls back to api_key when exhausted'),
  ('xiaomi/mimo-v2-omni', 'xiaomi', 'claude', 0.000000, 0.000000, 'token_plan', 1, 'Xiaomi token plan — free quota; falls back to api_key when exhausted')
ON CONFLICT (model_name, route_provider, agent_provider) DO NOTHING;

-- ── Grant read access ────────────────────────────────────────────────────────
GRANT SELECT ON roadmap.model_routes TO roadmap_agent;

COMMIT;
