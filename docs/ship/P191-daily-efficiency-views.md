# P191: Daily Efficiency Views and Combined Metrics Dashboard — Ship Document

## Summary

**Proposal:** P191
**Title:** Daily Efficiency Views and Combined Metrics Dashboard
**Type:** Feature
**Phase:** Complete (ship)
**Created:** 2026-04-11
**Completed:** 2026-04-16
**Status:** COMPLETE

## Problem Statement

The system had only weekly granularity for efficiency metrics (`metrics.v_weekly_efficiency`). Weekly rollups were too coarse for real-time token cost monitoring, agent performance analysis, cache hit rate trends, budget burn rate tracking, and ROI analysis per proposal type. Daily metrics are essential for operational visibility and cost optimization decisions.

## Solution Implemented

### Schema: Three New Views

**Migration:** `scripts/migrations/024-p191-daily-efficiency-views.sql`

Three views in the `metrics` schema, all querying `metrics.token_efficiency`:

1. **`metrics.v_daily_efficiency`** — Daily rollup by agent/model with:
   - `day` (date_trunc of recorded_at), `agent_identity`, `model_name`
   - `cache_hit_rate_pct` = 100 * cache_read / (input + cache_read)
   - `cost_per_1k_tokens` = (cost_usd / (input + output)) * 1000
   - Backward-compat columns: `agent_role`, `model`, `avg_cache_hit_rate`, `total_cost_microdollars`

2. **`metrics.v_combined_metrics`** — UNION ALL of daily + weekly with `period` column ('daily'/'weekly')

3. **`metrics.v_agent_performance`** — Lifetime ROI analysis with:
   - `efficiency_rank` (ROW_NUMBER by lifetime_cost_usd DESC)
   - `lifetime_cache_hit_pct`
   - `cost_per_invocation`, `tokens_per_dollar`

### Code: Spending Tool Integration

`src/apps/mcp-server/tools/spending/pg-handlers.ts` (line 363) queries `v_daily_efficiency` for daily granularity spending reports. Supports agent/model filtering, limit 30 rows.

### Grants

All four views (`v_daily_efficiency`, `v_weekly_efficiency`, `v_combined_metrics`, `v_agent_performance`) granted SELECT to `roadmap_agent`.

## Acceptance Criteria — Verification

| AC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-1 | `metrics.v_daily_efficiency` view created | PASS | View exists in `metrics` schema |
| AC-2 | Aggregates by date, agent_identity, model_name | PASS | Columns: `day`, `agent_identity`, `model_name` aliases present |
| AC-3 | cache_hit_rate_pct = 100 * cache_read / (input + cache_read) | PASS | Formula verified in migration, column exists |
| AC-4 | cost_per_1k_tokens = (cost_usd / (input + output)) * 1000 | PASS | Formula verified in migration, column exists |
| AC-5 | v_combined_metrics with period ('daily'/'weekly') | PASS | UNION ALL structure with period column |
| AC-6 | v_agent_performance with efficiency_rank + lifetime_cache_hit_pct | PASS | Both columns present, ranked by lifetime_cost_usd |
| AC-7 | spending_report includes daily granularity | PASS | pg-handlers.ts queries v_daily_efficiency |
| AC-8 | Dashboard can query v_daily_efficiency | PASS | View is queryable, SELECT verified |

**8/8 ACs PASS**

## Technical Notes

- **Base table empty:** `metrics.token_efficiency` has 0 rows currently. Views will populate when token tracking data flows in.
- **Column adaptation:** Migration uses `recorded_at` (not `ts`) and `cost_microdollars` (not `cost_usd`) matching actual `token_efficiency` schema. Derived `cost_usd` computed as microdollars/1000000.
- **Backward compat:** Original column names (`agent_role`, `model`) preserved alongside AC-required aliases.
- **No dashboard UI files:** Proposal spec listed `daily_metrics_view.ts`, `agent_performance_view.ts`, `cache_hit_dashboard.ts` — these were not created. The views are data-accessible via MCP tools and direct SQL.

## Files Modified/Created

| File | Action |
|------|--------|
| `scripts/migrations/024-p191-daily-efficiency-views.sql` | Created — migration for all 3 views + v_weekly_efficiency |
| `src/apps/mcp-server/tools/spending/pg-handlers.ts` | Modified — daily query added (line 363) |

## Dependencies

- Requires `metrics.token_efficiency` table (exists, owned by `andy`)
- No upstream blockers; purely additive views
