-- Migration 017: Daily Efficiency View & Combined Metrics
-- Purpose: Add daily granularity and combined metrics for better token tracking
-- Prerequisites: metrics.token_efficiency table (migration 014)

-- ── Agent Group Role ───────────────────────────────────────────────────────

DO $$
DECLARE
  member_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'roadmap_agent') THEN
    CREATE ROLE roadmap_agent NOLOGIN;
  END IF;

  FOREACH member_name IN ARRAY ARRAY[
    'agent_andy',
    'agent_bob',
    'agent_carter',
    'agent_claude_one',
    'agent_copilot_one',
    'agent_gemini_one',
    'agent_gilbert',
    'agent_openclaw_alpha',
    'agent_openclaw_beta',
    'agent_openclaw_gamma',
    'agent_read',
    'agent_skeptic',
    'agent_write',
    'agent_xiaomi_one',
    'andy',
    'claude',
    'gary'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = member_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', member_name);
    END IF;
    EXECUTE format('GRANT roadmap_agent TO %I', member_name);
  END LOOP;
END $$;

-- ── Daily Efficiency View ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW metrics.v_daily_efficiency AS
SELECT
  date_trunc('day', recorded_at)                          AS day,
  agent_role,
  model,
  count(*)                                                AS invocations,
  sum(input_tokens)                                       AS total_input_tokens,
  sum(output_tokens)                                      AS total_output_tokens,
  sum(cache_read_tokens)                                  AS total_cache_read_tokens,
  round(avg(cache_hit_rate), 3)                           AS avg_cache_hit_rate,
  sum(cost_microdollars)                                  AS total_cost_microdollars,
  round(CAST(sum(cost_microdollars) AS numeric) / 1000000, 4) AS total_cost_usd
FROM metrics.token_efficiency
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 5 DESC;

COMMENT ON VIEW metrics.v_daily_efficiency IS
  'Daily token efficiency by agent and model. Use for cost tracking and optimization.';

-- ── Weekly Efficiency View ────────────────────────────────────────────────

CREATE OR REPLACE VIEW metrics.v_weekly_efficiency AS
SELECT
  date_trunc('week', recorded_at)                         AS week_start,
  agent_role,
  model,
  count(*)                                                AS invocations,
  sum(input_tokens)                                       AS total_input_tokens,
  sum(output_tokens)                                      AS total_output_tokens,
  sum(cache_read_tokens)                                  AS total_cache_read_tokens,
  round(avg(cache_hit_rate), 3)                           AS avg_cache_hit_rate,
  sum(cost_microdollars)                                  AS total_cost_microdollars,
  round(CAST(sum(cost_microdollars) AS numeric) / 1000000, 4) AS total_cost_usd
FROM metrics.token_efficiency
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 5 DESC;

COMMENT ON VIEW metrics.v_weekly_efficiency IS
  'Weekly token efficiency by agent and model. Use for week-over-week cost tracking.';

-- ── Combined Metrics View ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW metrics.v_combined_metrics AS
SELECT
  d.day,
  d.agent_role,
  d.model,
  d.invocations,
  d.total_input_tokens,
  d.total_output_tokens,
  d.total_cache_read_tokens,
  d.avg_cache_hit_rate,
  d.total_cost_usd,
  -- Calculate tokens per dollar
  CASE WHEN d.total_cost_usd > 0 
    THEN round((d.total_input_tokens + d.total_output_tokens) / d.total_cost_usd, 0)
    ELSE 0 
  END AS tokens_per_dollar,
  -- Calculate efficiency score (higher is better)
  CASE WHEN d.total_input_tokens > 0
    THEN round(CAST(d.total_cache_read_tokens AS numeric) / d.total_input_tokens * 100, 1)
    ELSE 0
  END AS cache_efficiency_pct,
  -- Weekly trend
  w.invocations AS weekly_invocations,
  w.total_cost_usd AS weekly_cost_usd
FROM metrics.v_daily_efficiency d
LEFT JOIN metrics.v_weekly_efficiency w 
  ON d.agent_role = w.agent_role 
  AND d.model = w.model
  AND date_trunc('week', d.day) = w.week_start
ORDER BY d.day DESC, d.total_cost_usd DESC;

COMMENT ON VIEW metrics.v_combined_metrics IS
  'Combined daily + weekly metrics for comprehensive token efficiency analysis.';

-- ── Agent Performance View ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW metrics.v_agent_performance AS
SELECT
  agent_role,
  model,
  sum(invocations) AS total_invocations,
  sum(total_input_tokens) AS lifetime_input_tokens,
  sum(total_output_tokens) AS lifetime_output_tokens,
  round(avg(avg_cache_hit_rate), 3) AS overall_cache_hit_rate,
  sum(total_cost_usd) AS lifetime_cost_usd,
  round(sum(total_cost_usd) / NULLIF(sum(invocations), 0), 6) AS cost_per_invocation,
  round((sum(total_input_tokens) + sum(total_output_tokens)) / NULLIF(sum(total_cost_usd), 0), 0) AS tokens_per_dollar
FROM metrics.v_daily_efficiency
GROUP BY 1, 2
ORDER BY lifetime_cost_usd DESC;

COMMENT ON VIEW metrics.v_agent_performance IS
  'Lifetime agent performance metrics for ROI analysis.';

-- ── Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT ON metrics.v_daily_efficiency TO roadmap_agent;
GRANT SELECT ON metrics.v_weekly_efficiency TO roadmap_agent;
GRANT SELECT ON metrics.v_combined_metrics TO roadmap_agent;
GRANT SELECT ON metrics.v_agent_performance TO roadmap_agent;

-- ── Sample Queries ─────────────────────────────────────────────────────────
-- Daily efficiency for today:
--   SELECT * FROM metrics.v_daily_efficiency WHERE day = date_trunc('day', now());
--
-- Combined metrics for xiaomi agent:
--   SELECT * FROM metrics.v_combined_metrics WHERE agent_role = 'xiaomi';
--
-- Top 10 most expensive agents:
--   SELECT * FROM metrics.v_agent_performance ORDER BY lifetime_cost_usd DESC LIMIT 10;
