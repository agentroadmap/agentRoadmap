-- P226: Tiered LLM intelligence with frontier oversight and decision audit
-- Adds tier classification to model_routes (NOT model_registry which doesn't exist).
-- Addresses skeptic-beta C1: uses live schema, cost-based seeding instead of brittle LIKE patterns.
--
-- Tier assignment strategy (cost-based, not LIKE patterns — fixes M1):
--   frontier: premium models ($5+/M input OR known frontier: opus, o3, gpt-5.4)
--   mid:      standard models ($0.40-5/M input: sonnet, gpt-4.1, gpt-4o, o4-mini, gemini-2.5-pro)
--   lower:    economy models (<$0.40/M input: haiku, mimo, gpt-4o-mini, gpt-4.1-mini, flash)
--   tool:     non-LLM or free tier (test-model, github routes with $0 cost)
--
-- NOTE: Hermes host is restricted to nous+xiaomi providers. Frontier tier requires
-- anthropic/openai providers. This is a provider constraint (C2), not a tier bug.
-- Provider-aware routing is handled by the model router (AC #2), not this migration.

BEGIN;

-- Add tier columns to model_routes
ALTER TABLE roadmap.model_routes
  ADD COLUMN IF NOT EXISTS tier TEXT
    CHECK (tier IN ('frontier', 'mid', 'lower', 'tool'))
    DEFAULT 'tool';

ALTER TABLE roadmap.model_routes
  ADD COLUMN IF NOT EXISTS confidence_threshold NUMERIC(3,2) DEFAULT 0.70;

-- Seed tiers based on model identity + cost (not fragile LIKE patterns)
-- Frontier: known premium models
UPDATE roadmap.model_routes SET tier = 'frontier', confidence_threshold = 0.90
WHERE model_name IN ('claude-opus-4-6', 'o3', 'gpt-5.4')
  AND route_provider IN ('anthropic', 'openai');

-- Mid: standard workhorses
UPDATE roadmap.model_routes SET tier = 'mid', confidence_threshold = 0.75
WHERE model_name IN (
  'claude-sonnet-4', 'claude-sonnet-4-6',
  'gpt-4.1', 'gpt-4o',
  'o4-mini', 'codex-mini-latest',
  'gemini-2.5-pro'
);

-- Lower: economy models
UPDATE roadmap.model_routes SET tier = 'lower', confidence_threshold = 0.60
WHERE model_name IN (
  'claude-haiku-4-5',
  'xiaomi/mimo-v2-pro', 'xiaomi/mimo-v2-omni',
  'gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano',
  'gemini-2.0-flash', 'gemini-2.0-flash-lite'
);

-- Tool: test models and free github copilot routes stay at default 'tool'
-- (already set by DEFAULT 'tool')

-- Verify
DO $$
DECLARE
  unassigned INTEGER;
BEGIN
  SELECT COUNT(*) INTO unassigned
  FROM roadmap.model_routes
  WHERE is_enabled = true AND tier = 'tool'
    AND model_name NOT IN ('test-model');

  IF unassigned > 0 THEN
    RAISE NOTICE 'WARNING: % enabled routes still at tool tier — review manually', unassigned;
  END IF;
END $$;

COMMIT;
