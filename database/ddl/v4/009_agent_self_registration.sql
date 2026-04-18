-- Agent self-registration: routing metadata in agent_registry
--
-- Agents declare their CLI, provider, API spec, and supported models
-- when they first connect to AgentHive. This drives route selection
-- without hardcoded TypeScript logic.

BEGIN;

ALTER TABLE roadmap_workforce.agent_registry
    ADD COLUMN IF NOT EXISTS agent_cli TEXT,
    ADD COLUMN IF NOT EXISTS preferred_provider TEXT,
    ADD COLUMN IF NOT EXISTS api_spec TEXT,
    ADD COLUMN IF NOT EXISTS base_url TEXT,
    ADD COLUMN IF NOT EXISTS supported_models TEXT[];

COMMENT ON COLUMN roadmap_workforce.agent_registry.agent_cli IS
    'CLI tool this agent uses: claude, codex, hermes, gemini, etc. DB is source of truth.';
COMMENT ON COLUMN roadmap_workforce.agent_registry.preferred_provider IS
    'Default model provider: anthropic, nous, xiaomi, openai, google, github.';
COMMENT ON COLUMN roadmap_workforce.agent_registry.api_spec IS
    'API spec this agent CLI speaks: anthropic, openai, google. Drives endpoint selection.';
COMMENT ON COLUMN roadmap_workforce.agent_registry.supported_models IS
    'Models this agent can use. Empty array = any model for the provider.';

-- model_routes.agent_cli controls which CLI tool spawns for each route
ALTER TABLE roadmap.model_routes
    ADD COLUMN IF NOT EXISTS agent_cli TEXT;

COMMENT ON COLUMN roadmap.model_routes.agent_cli IS
    'CLI tool to spawn for this route: claude, codex, hermes, gemini, etc. Overrides api_spec-based detection.';

COMMIT;
