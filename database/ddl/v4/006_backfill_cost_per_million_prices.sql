-- P246: Backfill per-million pricing for existing routes and metadata
--
-- Strategy
--   1. Anthropic models: write canonical published per-M pricing
--      including cache_write (~125% of input) and cache_hit (~10% of
--      input). This intentionally corrects stale per-1k values where
--      they diverge from canonical (e.g. claude-haiku-4-5 was carrying
--      Haiku 3.5's $0.25/$1.25 per M; published Haiku 4.5 is $1/$5).
--      Once present, the per-million path in agent-spawner.ts wins via
--      COALESCE, so legacy per-1k columns are no longer authoritative
--      for these rows.
--   2. Non-Anthropic providers (openai, google, xiaomi, nous, github):
--      mechanical lift — cost_per_million_* := cost_per_1k_* * 1000.
--      Cache columns stay NULL because these providers either don't
--      expose cache pricing in the same shape (Google Gemini storage
--      pricing is per-token-per-hour, out of scope for v1) or don't
--      have prompt-cache pricing at all (xiaomi via nous, github
--      copilot covered by subscription).
--
-- Idempotent: COALESCE with the existing column lets the script re-run
-- without clobbering values that were set by a later operator action.
--
-- Apply as admin (touches model_routes [admin-owned] and
-- model_metadata [andy-owned]; admin is a member of andy with
-- superuser, so a single session covers both).

BEGIN;

-- ---------- Anthropic canonical pricing (USD per 1M tokens) ----------
-- Source: Anthropic public price page (input / output / cache_hit / cache_write).
--   claude-opus-4-6:    15  / 75  / 1.50 / 18.75
--   claude-sonnet-4-6:   3  / 15  / 0.30 /  3.75
--   claude-haiku-4-5:    1  /  5  / 0.10 /  1.25

UPDATE roadmap.model_routes
   SET cost_per_million_input        = COALESCE(cost_per_million_input,        15.000000),
       cost_per_million_output       = COALESCE(cost_per_million_output,       75.000000),
       cost_per_million_cache_hit    = COALESCE(cost_per_million_cache_hit,     1.500000),
       cost_per_million_cache_write  = COALESCE(cost_per_million_cache_write,  18.750000)
 WHERE route_provider = 'anthropic' AND model_name = 'claude-opus-4-6';

UPDATE roadmap.model_routes
   SET cost_per_million_input        = COALESCE(cost_per_million_input,         3.000000),
       cost_per_million_output       = COALESCE(cost_per_million_output,       15.000000),
       cost_per_million_cache_hit    = COALESCE(cost_per_million_cache_hit,     0.300000),
       cost_per_million_cache_write  = COALESCE(cost_per_million_cache_write,   3.750000)
 WHERE route_provider = 'anthropic' AND model_name = 'claude-sonnet-4-6';

UPDATE roadmap.model_routes
   SET cost_per_million_input        = COALESCE(cost_per_million_input,         1.000000),
       cost_per_million_output       = COALESCE(cost_per_million_output,        5.000000),
       cost_per_million_cache_hit    = COALESCE(cost_per_million_cache_hit,     0.100000),
       cost_per_million_cache_write  = COALESCE(cost_per_million_cache_write,   1.250000)
 WHERE route_provider = 'anthropic' AND model_name = 'claude-haiku-4-5';

-- Mirror catalog table.
UPDATE roadmap.model_metadata
   SET cost_per_million_input        = COALESCE(cost_per_million_input,        15.000000),
       cost_per_million_output       = COALESCE(cost_per_million_output,       75.000000),
       cost_per_million_cache_hit    = COALESCE(cost_per_million_cache_hit,     1.500000),
       cost_per_million_cache_write  = COALESCE(cost_per_million_cache_write,  18.750000)
 WHERE provider = 'anthropic' AND model_name = 'claude-opus-4-6';

UPDATE roadmap.model_metadata
   SET cost_per_million_input        = COALESCE(cost_per_million_input,         3.000000),
       cost_per_million_output       = COALESCE(cost_per_million_output,       15.000000),
       cost_per_million_cache_hit    = COALESCE(cost_per_million_cache_hit,     0.300000),
       cost_per_million_cache_write  = COALESCE(cost_per_million_cache_write,   3.750000)
 WHERE provider = 'anthropic' AND model_name = 'claude-sonnet-4-6';

UPDATE roadmap.model_metadata
   SET cost_per_million_input        = COALESCE(cost_per_million_input,         1.000000),
       cost_per_million_output       = COALESCE(cost_per_million_output,        5.000000),
       cost_per_million_cache_hit    = COALESCE(cost_per_million_cache_hit,     0.100000),
       cost_per_million_cache_write  = COALESCE(cost_per_million_cache_write,   1.250000)
 WHERE provider = 'anthropic' AND model_name = 'claude-haiku-4-5';

-- ---------- Mechanical lift for non-Anthropic providers ----------
-- per_M = per_1k * 1000. Cache columns intentionally left NULL.
-- Skip rows already populated (idempotent COALESCE pattern).

UPDATE roadmap.model_routes
   SET cost_per_million_input  = COALESCE(cost_per_million_input,  cost_per_1k_input  * 1000),
       cost_per_million_output = COALESCE(cost_per_million_output, cost_per_1k_output * 1000)
 WHERE route_provider IN ('openai','google','xiaomi','nous','github')
   AND (cost_per_million_input IS NULL OR cost_per_million_output IS NULL);

UPDATE roadmap.model_metadata
   SET cost_per_million_input  = COALESCE(cost_per_million_input,  cost_per_1k_input  * 1000),
       cost_per_million_output = COALESCE(cost_per_million_output, cost_per_1k_output * 1000)
 WHERE provider IN ('openai','google','xiaomi','nous','github')
   AND cost_per_1k_input  IS NOT NULL
   AND cost_per_1k_output IS NOT NULL
   AND (cost_per_million_input IS NULL OR cost_per_million_output IS NULL);

COMMIT;
