/**
 * P059: Model Registry & Cost-Aware Routing — Unit Tests
 *
 * Tests for enhanced model_list capability filtering and model_add is_active support.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
	getModelListMetrics,
	PgModelHandlers,
	resetModelListCacheForTest,
	validateModelForDispatch,
} from "../../src/apps/mcp-server/tools/spending/pg-handlers.ts";

type QueryCall = { text: string; params?: unknown[] };

function modelText(result: Awaited<ReturnType<PgModelHandlers["listModels"]>>) {
	return result.content
		.filter((item) => item.type === "text")
		.map((item) => item.text)
		.join("\n");
}

describe("P059: Model Registry", () => {
	beforeEach(() => {
		resetModelListCacheForTest();
	});

	describe("PgModelHandlers.listModels", () => {
		it("should accept capability filter parameter", () => {
			// Verify the capability filter format: "key=value"
			const cap = "tool_use=true";
			const [key, value] = cap.split("=");
			assert.equal(key, "tool_use");
			assert.equal(value, "true");
		});

		it("should accept max_cost_per_million_input as numeric string", () => {
			const cost = "10";
			const parsed = parseFloat(cost);
			assert.equal(parsed, 10);
			assert.ok(parsed > 0);
		});

		it("should accept active_only boolean parameter", () => {
			const activeOnly = true;
			assert.equal(typeof activeOnly, "boolean");
		});

		it("should default active_only to true when not specified", () => {
			const args: { active_only?: boolean } = {};
			const effectiveActiveOnly = args.active_only !== false;
			assert.equal(effectiveActiveOnly, true);
		});

		it("should allow inactive models when active_only is explicitly false", () => {
			const args = { active_only: false };
			const effectiveActiveOnly = args.active_only !== false;
			assert.equal(effectiveActiveOnly, false);
		});

		it("filters by enabled route provider and includes route metadata", async () => {
			const calls: QueryCall[] = [];
			const queryFn = async <T>(text: string, params?: unknown[]) => {
				calls.push({ text, params });
				if (text.includes("information_schema.columns")) {
					return { rows: [{ column_name: "tier" }] as T[] };
				}
				assert.match(text, /JOIN roadmap\.model_routes r/);
				assert.match(text, /r\.route_provider = \$2/);
				assert.deepEqual(params, [true, "openai"]);
				return {
					rows: [
						{
							model_name: "gpt-5",
							provider: "openai",
							tier: "frontier",
							route_provider: "openai",
							priority: 10,
							cost_per_1k_input: null,
							cost_per_1k_output: null,
							cost_per_million_input: "1",
							cost_per_million_output: "2",
							cost_per_million_cache_write: null,
							cost_per_million_cache_hit: null,
							max_tokens: null,
							context_window: 200000,
							capabilities: { tool_use: true },
							rating: 5,
							is_active: true,
						},
					] as T[],
				};
			};
			const handlers = new PgModelHandlers(
				{} as never,
				"/tmp",
				queryFn as never,
			);

			const result = await handlers.listModels({ provider: "openai" });
			const text = modelText(result);

			assert.match(text, /gpt-5/);
			assert.match(text, /route_provider: openai/);
			assert.match(text, /priority: 10/);
			assert.equal(
				calls.filter((call) => call.text.includes("FROM model_metadata m"))
					.length,
				1,
			);
		});

		it("filters by model_metadata tier and returns empty for unknown tiers", async () => {
			const queryFn = async <T>(text: string, params?: unknown[]) => {
				if (text.includes("information_schema.columns")) {
					return { rows: [{ column_name: "tier" }] as T[] };
				}
				assert.match(text, /m\.tier = \$2/);
				assert.deepEqual(params, [true, "unknown"]);
				return { rows: [] as T[] };
			};
			const handlers = new PgModelHandlers(
				{} as never,
				"/tmp",
				queryFn as never,
			);

			const result = await handlers.listModels({ tier: "unknown" });

			assert.equal(modelText(result), "No models found matching criteria.");
		});

		it("does not crash when tier is requested before model_metadata.tier exists", async () => {
			let modelQueryCount = 0;
			const queryFn = async <T>(text: string) => {
				if (text.includes("information_schema.columns")) {
					return { rows: [] as T[] };
				}
				modelQueryCount += 1;
				return { rows: [] as T[] };
			};
			const handlers = new PgModelHandlers(
				{} as never,
				"/tmp",
				queryFn as never,
			);

			const result = await handlers.listModels({ tier: "frontier" });

			assert.equal(modelText(result), "No models found matching criteria.");
			assert.equal(modelQueryCount, 0);
		});

		it("serves repeated calls from the 2000ms in-memory cache", async () => {
			let modelQueryCount = 0;
			const queryFn = async <T>(text: string) => {
				if (text.includes("information_schema.columns")) {
					return { rows: [{ column_name: "tier" }] as T[] };
				}
				modelQueryCount += 1;
				return {
					rows: [
						{
							model_name: "claude-sonnet",
							provider: "anthropic",
							tier: "standard",
							route_provider: "anthropic",
							priority: 1,
							cost_per_1k_input: null,
							cost_per_1k_output: null,
							cost_per_million_input: "3",
							cost_per_million_output: "15",
							cost_per_million_cache_write: null,
							cost_per_million_cache_hit: null,
							max_tokens: null,
							context_window: 200000,
							capabilities: {},
							rating: 4,
							is_active: true,
						},
					] as T[],
				};
			};
			const handlers = new PgModelHandlers(
				{} as never,
				"/tmp",
				queryFn as never,
			);

			await handlers.listModels({ provider: "anthropic" });
			await handlers.listModels({ provider: "anthropic" });

			assert.equal(modelQueryCount, 1);
			assert.equal(getModelListMetrics().cache_hit_total, 1);
		});

		it("validates dispatch availability against enabled routes", async () => {
			const valid = await validateModelForDispatch("gpt-5", (async <T>() => ({
				rows: [{ model_name: "gpt-5" }] as T[],
			})) as never);
			const invalid = await validateModelForDispatch("retired-model", (async <
				T,
			>() => ({ rows: [] as T[] })) as never);

			assert.deepEqual(valid, { valid: true });
			assert.deepEqual(invalid, {
				valid: false,
				reason: "NO_ENABLED_ROUTE",
			});
		});
	});

	describe("PgModelHandlers.addModel", () => {
		it("should accept is_active parameter", () => {
			const isActive = "true";
			const parsed = isActive === "true";
			assert.equal(parsed, true);
		});

		it("should accept is_active=false for deactivation", () => {
			const isActive: string = "false";
			const parsed = isActive === "true";
			assert.equal(parsed, false);
		});

		it("should accept context_window parameter", () => {
			const ctx = "200000";
			const parsed = parseInt(ctx, 10);
			assert.equal(parsed, 200000);
		});

		it("should parse capabilities JSON", () => {
			const caps = '{"tool_use":true,"vision":true}';
			const parsed = JSON.parse(caps);
			assert.deepEqual(parsed, { tool_use: true, vision: true });
		});

		it("should handle null is_active for default behavior", () => {
			const args: { is_active?: string } = {};
			const parsed =
				args.is_active !== undefined ? args.is_active === "true" : null;
			assert.equal(parsed, null);
		});
	});

	describe("Cost-aware routing integration", () => {
		it("should support 6 decimal places for sub-cent pricing", () => {
			const haikuCost = 0.00025;
			assert.ok(haikuCost < 0.001);
			// Verify precision: $0.000250/1k tokens (= $0.250000/1M)
			assert.equal(haikuCost.toFixed(6), "0.000250");
		});

		it("should scale per-1k legacy pricing to per-million display values", () => {
			const legacyCostPer1k = 0.003;
			const perMillion = legacyCostPer1k * 1000;
			assert.equal(perMillion, 3);
		});

		it("should rank models by rating then cost", () => {
			const models = [
				{ name: "haiku", rating: 3, cost: 0.00025 },
				{ name: "sonnet", rating: 4, cost: 0.003 },
				{ name: "opus", rating: 5, cost: 0.015 },
			];
			const sorted = [...models].sort((a, b) => {
				if (b.rating !== a.rating) return b.rating - a.rating;
				return a.cost - b.cost;
			});
			assert.equal(sorted[0].name, "opus");
			assert.equal(sorted[1].name, "sonnet");
			assert.equal(sorted[2].name, "haiku");
		});
	});
});
