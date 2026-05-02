import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getProviderHealth } from "../../src/apps/mcp-server/tools/provider/health.ts";
import { softSortProviderHealthCandidates } from "../../src/core/orchestration/agent-spawner.ts";
import { HealthCache } from "../../src/core/provider-health/cache.ts";
import { HealthChecker } from "../../src/core/provider-health/checker.ts";

describe("provider health cache", () => {
	it("returns entries within TTL and null after expiry", () => {
		let now = 1_000;
		const cache = new HealthCache(30_000, () => now);

		cache.set("provider-a", "model-a", {
			status: "ok",
			checkedAt: now,
			latencyMs: 42,
		});

		assert.deepEqual(cache.get("provider-a", "model-a"), {
			status: "ok",
			checkedAt: 1_000,
			latencyMs: 42,
		});

		now = 31_001;
		assert.equal(cache.get("provider-a", "model-a"), null);
	});
});

describe("provider_health MCP handler", () => {
	it("returns cached status and latency without querying DB", async () => {
		let queried = false;
		const result = await getProviderHealth(
			{ provider: "provider-a", model: "model-a" },
			{
				getCachedEntry: () => ({
					status: "ok",
					checkedAt: 1_000,
					latencyMs: 12,
				}),
				query: async () => {
					queried = true;
					return { rows: [] };
				},
			},
		);

		assert.equal(queried, false);
		assert.equal(result.status, "ok");
		assert.equal(result.latencyMs, 12);
	});

	it("returns unknown stale when cache and DB are empty", async () => {
		const result = await getProviderHealth(
			{ provider: "provider-a", model: "model-a" },
			{
				getCachedEntry: () => null,
				query: async () => ({ rows: [] }),
			},
		);

		assert.deepEqual(result, { status: "unknown", stale: true });
	});
});

describe("HealthChecker", () => {
	it("writes one provider_health_log row per probe", async () => {
		const inserts: unknown[][] = [];
		const checker = new HealthChecker({
			now: () => 10_000,
			query: async (sql: string, params?: unknown[]) => {
				if (sql.includes("FROM roadmap.model_routes")) {
					return {
						rows: [
							{
								route_provider: "provider-a",
								model_name: "model-a",
								base_url: "https://example.invalid/v1",
								api_spec: "openai",
							},
							{
								route_provider: "provider-b",
								model_name: "model-b",
								base_url: "https://example.invalid/v1",
								api_spec: "openai",
							},
						],
					};
				}
				inserts.push(params ?? []);
				return { rows: [] };
			},
			probe: async (route) => ({
				status: route.routeProvider === "provider-a" ? "ok" : "timeout",
				latencyMs: route.routeProvider === "provider-a" ? 10 : 500,
			}),
		});

		await checker.runOnce();

		assert.equal(inserts.length, 2);
		assert.equal(inserts[0][0], "provider-a");
		assert.equal(inserts[1][0], "provider-b");
	});
});

describe("route resolver provider health ordering", () => {
	const rows = [
		{ route_provider: "slow", model_name: "model-a", priority: 1 },
		{ route_provider: "healthy", model_name: "model-a", priority: 2 },
		{ route_provider: "unknown", model_name: "model-a", priority: 3 },
	];

	it("soft-sorts error and timeout providers to the end", () => {
		const sorted = softSortProviderHealthCandidates(rows, (provider) =>
			provider === "slow"
				? { status: "timeout", checkedAt: 1_000 }
				: provider === "healthy"
					? { status: "ok", checkedAt: 1_000 }
					: null,
		);

		assert.deepEqual(
			sorted.map((row) => row.route_provider),
			["healthy", "unknown", "slow"],
		);
	});

	it("keeps degraded providers as last-resort candidates", () => {
		const sorted = softSortProviderHealthCandidates(rows, () => ({
			status: "error",
			checkedAt: 1_000,
		}));

		assert.deepEqual(
			sorted.map((row) => row.route_provider),
			["slow", "healthy", "unknown"],
		);
	});
});
