-- P246: Per-million pricing + cache read/write cost columns
--
-- Why now: src/core/orchestration/agent-spawner.ts and
-- src/apps/mcp-server/tools/spending/pg-handlers.ts already reference
-- cost_per_million_input/output/cache_write/cache_hit and gate behavior
-- behind supportsPerMillionRoutePricing(). The probe queries
-- information_schema for the columns; they don't exist, so the probe
-- returns false and the per-million path is dead code. This migration
-- adds the columns so the live code activates. Backfill data lives in
-- migration 006 (two-phase pattern: clean rollback of data without
-- losing the schema).
--
-- Units: dollars per million tokens. Anthropic-style pricing:
--   input/output = base; cache_write ≈ 125% of input; cache_hit ≈ 10%
--   of input. OpenAI's cached-input maps to cache_hit (~50% of input).
--   Providers without cache pricing leave the cache columns NULL
--   (NULL = "no cache pricing", distinct from 0 = "free").
--
-- Precision: numeric(12,6). Largest realistic price is ~$100/M (Opus
-- write); smallest is ~$0.000800/M for nous-routed xiaomi. (12,6)
-- handles both ends with sub-cent granularity.
--
-- Ownership: model_metadata is owned by andy, model_routes by admin.
-- admin is a superuser and member of andy, so a single ALTER session
-- can touch both. Apply as admin (or andy).

BEGIN;

ALTER TABLE roadmap.model_metadata
    ADD COLUMN IF NOT EXISTS cost_per_million_input        numeric(12,6),
    ADD COLUMN IF NOT EXISTS cost_per_million_output       numeric(12,6),
    ADD COLUMN IF NOT EXISTS cost_per_million_cache_write  numeric(12,6),
    ADD COLUMN IF NOT EXISTS cost_per_million_cache_hit    numeric(12,6);

ALTER TABLE roadmap.model_metadata
    DROP CONSTRAINT IF EXISTS model_metadata_cost_per_million_nonnegative,
    ADD  CONSTRAINT model_metadata_cost_per_million_nonnegative CHECK (
        (cost_per_million_input       IS NULL OR cost_per_million_input       >= 0) AND
        (cost_per_million_output      IS NULL OR cost_per_million_output      >= 0) AND
        (cost_per_million_cache_write IS NULL OR cost_per_million_cache_write >= 0) AND
        (cost_per_million_cache_hit   IS NULL OR cost_per_million_cache_hit   >= 0)
    );

ALTER TABLE roadmap.model_routes
    ADD COLUMN IF NOT EXISTS cost_per_million_input        numeric(12,6),
    ADD COLUMN IF NOT EXISTS cost_per_million_output       numeric(12,6),
    ADD COLUMN IF NOT EXISTS cost_per_million_cache_write  numeric(12,6),
    ADD COLUMN IF NOT EXISTS cost_per_million_cache_hit    numeric(12,6);

ALTER TABLE roadmap.model_routes
    DROP CONSTRAINT IF EXISTS model_routes_cost_per_million_nonnegative,
    ADD  CONSTRAINT model_routes_cost_per_million_nonnegative CHECK (
        (cost_per_million_input       IS NULL OR cost_per_million_input       >= 0) AND
        (cost_per_million_output      IS NULL OR cost_per_million_output      >= 0) AND
        (cost_per_million_cache_write IS NULL OR cost_per_million_cache_write >= 0) AND
        (cost_per_million_cache_hit   IS NULL OR cost_per_million_cache_hit   >= 0)
    );

COMMENT ON COLUMN roadmap.model_routes.cost_per_million_input        IS 'USD per 1M input tokens (uncached prompt portion).';
COMMENT ON COLUMN roadmap.model_routes.cost_per_million_output       IS 'USD per 1M output tokens.';
COMMENT ON COLUMN roadmap.model_routes.cost_per_million_cache_write  IS 'USD per 1M tokens for prompt-cache writes (Anthropic ~125% of input). NULL = provider has no separate cache-write price.';
COMMENT ON COLUMN roadmap.model_routes.cost_per_million_cache_hit    IS 'USD per 1M tokens for prompt-cache reads/hits (Anthropic ~10%, OpenAI cached-input ~50% of input). NULL = no cache pricing.';

COMMENT ON COLUMN roadmap.model_metadata.cost_per_million_input        IS 'USD per 1M input tokens (catalog price; routes table is the source of truth for billing).';
COMMENT ON COLUMN roadmap.model_metadata.cost_per_million_output       IS 'USD per 1M output tokens (catalog price).';
COMMENT ON COLUMN roadmap.model_metadata.cost_per_million_cache_write  IS 'USD per 1M tokens for prompt-cache writes (catalog price).';
COMMENT ON COLUMN roadmap.model_metadata.cost_per_million_cache_hit    IS 'USD per 1M tokens for prompt-cache hits (catalog price).';

-- GRANTs cascade: roadmap_agent has SELECT on model_routes, agent_read
-- has SELECT on model_metadata, agent_write has SELECT+UPDATE on
-- model_metadata. Table-level grants automatically cover new columns.

COMMIT;
