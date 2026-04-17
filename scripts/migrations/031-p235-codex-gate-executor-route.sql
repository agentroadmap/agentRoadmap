-- P235 follow-up: gate executors must not depend on Claude Code auth.
--
-- Codex CLI on this host supports ChatGPT-account models such as gpt-5.4,
-- while codex-mini-latest is rejected. Prefer gpt-5.4 for codex worktrees
-- and keep codex-mini disabled unless an API-key environment is explicitly used.

INSERT INTO roadmap.model_metadata (
    model_name,
    provider,
    cost_per_1k_input,
    cost_per_1k_output,
    context_window,
    is_active
) VALUES (
    'gpt-5.4',
    'openai',
    0.005,
    0.020,
    1047576,
    true
)
ON CONFLICT (model_name) DO UPDATE
SET is_active = true,
    updated_at = now();

INSERT INTO roadmap.model_routes (
    model_name,
    route_provider,
    agent_provider,
    cost_per_1k_input,
    cost_per_1k_output,
    plan_type,
    priority,
    is_enabled,
    base_url,
    api_spec,
    notes
) VALUES (
    'gpt-5.4',
    'openai',
    'codex',
    0,
    0,
    'chatgpt',
    1,
    true,
    'https://api.openai.com/v1',
    'openai',
    'P235: ChatGPT-account compatible Codex CLI gate executor route.'
)
ON CONFLICT (model_name, route_provider, agent_provider) DO UPDATE
SET priority = EXCLUDED.priority,
    is_enabled = EXCLUDED.is_enabled,
    base_url = EXCLUDED.base_url,
    api_spec = EXCLUDED.api_spec,
    notes = EXCLUDED.notes;

UPDATE roadmap.model_routes
SET is_enabled = false,
    priority = 99,
    notes = COALESCE(notes || ' ', '') ||
        'Disabled by P235 follow-up: rejected by Codex CLI with ChatGPT account.'
WHERE agent_provider = 'codex'
  AND model_name = 'codex-mini-latest';

UPDATE roadmap.model_routes
SET is_enabled = false,
    priority = 99,
    notes = COALESCE(notes || ' ', '') ||
        'Disabled by P235 follow-up: Xiaomi/Nous routes must not be launched through Claude CLI auth.'
WHERE agent_provider = 'claude'
  AND route_provider IN ('xiaomi', 'nous');
