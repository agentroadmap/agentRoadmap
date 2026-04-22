-- P226: Tier spending report view
-- Fixes skeptic-beta m1: uses model_routes (live table), not model_registry (doesn't exist).
-- Provides cost tracking per tier for token-tracker agent (AC #9).
--
-- This view joins agent_runs to model_routes for tier-based cost analysis.
-- If agent_runs table doesn't exist yet, this view still creates successfully
-- (returns empty until agent_runs is populated).

BEGIN;

CREATE OR REPLACE VIEW roadmap_efficiency.tier_spending_report AS
SELECT
    mr.tier,
    COALESCE(mr.model_name, 'unknown') as model_name,
    mr.route_provider,
    COUNT(ar.id) as run_count,
    AVG(COALESCE(ar.tokens_in, 0) + COALESCE(ar.tokens_out, 0))::INTEGER as avg_tokens,
    SUM(COALESCE(ar.cost_usd, 0)) as total_cost_usd,
    AVG(COALESCE(ar.cost_usd, 0)) as avg_cost_usd,
    MIN(ar.started_at) as first_run,
    MAX(ar.started_at) as last_run
FROM roadmap.model_routes mr
LEFT JOIN roadmap_workforce.agent_runs ar
    ON ar.model_used = mr.model_name
WHERE mr.is_enabled = true
GROUP BY mr.tier, mr.model_name, mr.route_provider
ORDER BY
    CASE mr.tier
        WHEN 'frontier' THEN 1
        WHEN 'mid' THEN 2
        WHEN 'lower' THEN 3
        WHEN 'tool' THEN 4
    END,
    total_cost_usd DESC NULLS LAST;

-- Summary view for dashboard
CREATE OR REPLACE VIEW roadmap_efficiency.tier_cost_summary AS
SELECT
    tier,
    COUNT(DISTINCT model_name) as model_count,
    SUM(run_count) as total_runs,
    SUM(total_cost_usd) as total_cost_usd,
    AVG(avg_tokens)::INTEGER as overall_avg_tokens
FROM roadmap_efficiency.tier_spending_report
WHERE run_count > 0
GROUP BY tier
ORDER BY
    CASE tier
        WHEN 'frontier' THEN 1
        WHEN 'mid' THEN 2
        WHEN 'lower' THEN 3
        WHEN 'tool' THEN 4
    END;

COMMIT;
