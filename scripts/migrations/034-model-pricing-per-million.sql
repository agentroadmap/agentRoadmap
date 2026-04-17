-- Migration 034: Model Pricing — Per-Million Token Fields
--
-- Adds per-million pricing columns to the model catalog and route tables while
-- keeping the legacy per-1k columns for compatibility with older clients.

BEGIN;

ALTER TABLE roadmap.model_metadata
  ADD COLUMN IF NOT EXISTS cost_per_million_input numeric(14,6),
  ADD COLUMN IF NOT EXISTS cost_per_million_output numeric(14,6),
  ADD COLUMN IF NOT EXISTS cost_per_million_cache_write numeric(14,6),
  ADD COLUMN IF NOT EXISTS cost_per_million_cache_hit numeric(14,6);

COMMENT ON COLUMN roadmap.model_metadata.cost_per_million_input IS
  'USD per 1M input tokens';
COMMENT ON COLUMN roadmap.model_metadata.cost_per_million_output IS
  'USD per 1M output tokens';
COMMENT ON COLUMN roadmap.model_metadata.cost_per_million_cache_write IS
  'USD per 1M cache write tokens';
COMMENT ON COLUMN roadmap.model_metadata.cost_per_million_cache_hit IS
  'USD per 1M cache hit/read tokens';

UPDATE roadmap.model_metadata
SET cost_per_million_input = COALESCE(cost_per_million_input, cost_per_1k_input * 1000),
    cost_per_million_output = COALESCE(cost_per_million_output, cost_per_1k_output * 1000);

ALTER TABLE roadmap.model_routes
  ADD COLUMN IF NOT EXISTS cost_per_million_input numeric(14,6),
  ADD COLUMN IF NOT EXISTS cost_per_million_output numeric(14,6),
  ADD COLUMN IF NOT EXISTS cost_per_million_cache_write numeric(14,6),
  ADD COLUMN IF NOT EXISTS cost_per_million_cache_hit numeric(14,6);

COMMENT ON COLUMN roadmap.model_routes.cost_per_million_input IS
  'USD per 1M input tokens for this route';
COMMENT ON COLUMN roadmap.model_routes.cost_per_million_output IS
  'USD per 1M output tokens for this route';
COMMENT ON COLUMN roadmap.model_routes.cost_per_million_cache_write IS
  'USD per 1M cache write tokens for this route';
COMMENT ON COLUMN roadmap.model_routes.cost_per_million_cache_hit IS
  'USD per 1M cache hit/read tokens for this route';

UPDATE roadmap.model_routes
SET cost_per_million_input = COALESCE(cost_per_million_input, cost_per_1k_input * 1000),
    cost_per_million_output = COALESCE(cost_per_million_output, cost_per_1k_output * 1000);

COMMIT;
