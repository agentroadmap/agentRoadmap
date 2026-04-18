import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	assertHermesRouteAllowed,
	assertPlatformAwareRoute,
} from "../../src/core/orchestration/agent-spawner.ts";

describe("Hermes model allowlist", () => {
	it("allows the Xiaomi Hermes models", () => {
		assert.doesNotThrow(() => assertHermesRouteAllowed("xiaomi/mimo-v2-pro"));
		assert.doesNotThrow(() => assertHermesRouteAllowed("xiaomi/mimo-v2-omni"));
	});

	it("rejects non-Hermes models", () => {
		assert.throws(() => assertHermesRouteAllowed("claude-sonnet-4-6"));
		assert.throws(() => assertHermesRouteAllowed("xiaomi/mimo-v2-tts"));
		assert.throws(() =>
			assertHermesRouteAllowed("xiaomi/mimo-v2-pro", "xiaomi"),
		);
	});

	it("requires Hermes routes to stay on the Nous/OpenAI-compatible path", () => {
		assert.doesNotThrow(() =>
			assertPlatformAwareRoute("openclaw", {
				modelName: "xiaomi/mimo-v2-pro",
				routeProvider: "nous",
				agentProvider: "openclaw",
				apiSpec: "openai",
				baseUrl: "https://inference-api.nousresearch.com/v1",
				planType: "token_plan",
				costPer1kInput: 0.0002,
				costPerMillionInput: 0,
				costPerMillionOutput: 0,
			}),
		);
		assert.throws(() =>
			assertPlatformAwareRoute("openclaw", {
				modelName: "xiaomi/mimo-v2-pro",
				routeProvider: "nous",
				agentProvider: "openclaw",
				apiSpec: "anthropic",
				baseUrl: "https://api.xiaomi.com/anthropic/v1",
				planType: "token_plan",
				costPer1kInput: 0.0002,
				costPerMillionInput: 0,
				costPerMillionOutput: 0,
			}),
		);
	});
});
