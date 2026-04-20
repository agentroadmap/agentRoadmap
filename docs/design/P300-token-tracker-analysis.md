# TOKEN TRACKER ANALYSIS — P300 Multi-Project Architecture
**Agent:** hermes/token-tracker
**Date:** 2026-04-20
**Proposal:** P300 (DEVELOP, maturity=new)

---

## 1. Connection Pool Cost Analysis

| Metric | Current | Proposed |
|--------|---------|----------|
| Pools | 1 singleton (5 conns) | metaPool(5) + N projectPools(5 each) |
| Max connections | 5 | 55 (10 projects × 5 + meta 5) |
| Postgres limit | 100 | 100 (45 conn margin) |

Pool cap at 10 projects is safe. Monitor approaching 8+.

## 2. Token Impact by Phase

| Phase | Effort | Token Estimate | Cost Model |
|-------|--------|---------------|------------|
| 1a (Migrations) | ~2h | LOW — mechanical SQL | xiaomi/mimo-v2-pro |
| 1b (PoolManager) | ~4h | MEDIUM — ~200 LOC TS | xiaomi/mimo-v2-pro |
| 2 (Routing) | ~5h | MEDIUM — fn_claim, spawner | xiaomi/mimo-v2-pro |
| 3 (Polish) | ~3h | LOW — MCP wrappers | xiaomi/mimo-v2-pro |
| 4 (Migration) | ~5h | HIGH — E2E, backward compat | xiaomi/mimo-v2-pro |
| **Total** | **~19h** | **150K-250K tokens** | **$10 budget** |

## 3. Cost Optimization Wins

- Lazy pool creation prevents startup connection storms
- Pool reaping after 5min idle reduces idle cost
- Central squad_dispatch avoids multi-DB polling overhead
- Default project_id=1 is zero-cost backward compat

## 4. Token Waste Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pool config DB read on every getProjectPool() | MEDIUM | Cache config in memory, reload on health failure |
| project_id on every MCP call | LOW | Cache project context at MCP server level |
| fn_claim JOIN to provider_registry | MEDIUM | Index on (agency_id, is_active) in provider_registry |
| Two-tier pool routing overhead | LOW | Meta pool always active, project pools lazy |

## 5. Recommended Budget Allocation

| Phase | Budget | Model Recommendation |
|-------|--------|---------------------|
| Phase 1 | $2.00 | xiaomi/mimo-v2-pro (mechanical work) |
| Phase 2 | $3.00 | xiaomi/mimo-v2-pro (routing logic) |
| Phase 3 | $1.50 | xiaomi/mimo-v2-pro (polish) |
| Phase 4 | $3.50 | xiaomi/mimo-v2-pro (E2E testing) |
| **Total** | **$10.00** | All phases use xiaomi models |

## 6. Efficiency Score: 8/10

Design is well-optimized. Two-tier pool avoids wasted connections. Lazy creation is the key win. Only concern is the JOIN overhead in fn_claim — ensure proper indexing before deployment.

## 7. Recommendations

1. Add index: `CREATE INDEX idx_provider_registry_agency_active ON roadmap_workforce.provider_registry(agency_id) WHERE is_active = true;`
2. Cache project configs in PoolManager memory, not per-request DB reads
3. Set pool idle timeout to 5 minutes (300s) as designed
4. Monitor connection count approaching 8+ projects
5. Consider connection pooling per-project with max=3 (not 5) to extend headroom

## 8. Verdict: PROCEED

No blocking efficiency concerns. Design is sound for 10-project scale. Index the provider_registry before Phase 2 deployment.
