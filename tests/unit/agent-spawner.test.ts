import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	assertHermesRouteAllowed,
	assertPlatformAwareRoute,
	buildSpawnProcessEnv,
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

	it("does not pass Anthropic credentials into Hermes workers", () => {
		const originalAnthropic = process.env.ANTHROPIC_API_KEY;
		const originalNous = process.env.NOUS_API_KEY;
		const originalOpenAI = process.env.OPENAI_API_KEY;
		process.env.ANTHROPIC_API_KEY = "anthropic-secret";
		process.env.NOUS_API_KEY = "nous-secret";
		process.env.OPENAI_API_KEY = "openai-secret";

		try {
			const env = buildSpawnProcessEnv({
				provider: "openclaw",
				worktree: "openclaw-hermes",
				route: {
					modelName: "xiaomi/mimo-v2-pro",
					routeProvider: "nous",
					agentProvider: "openclaw",
					apiSpec: "openai",
					baseUrl: "https://inference-api.nousresearch.com/v1",
					planType: "token_plan",
					costPer1kInput: 0.0002,
					costPerMillionInput: 0,
					costPerMillionOutput: 0,
				},
				agentEnv: { DATABASE_URL: "postgresql://example" },
				extraEnv: {},
			});

			assert.equal(env.ANTHROPIC_API_KEY, undefined);
			assert.equal(env.OPENAI_API_KEY, "nous-secret");
			assert.equal(env.NOUS_API_KEY, "nous-secret");
			assert.equal(env.AGENT_PROVIDER, "openclaw");
		} finally {
			if (originalAnthropic === undefined) {
				delete process.env.ANTHROPIC_API_KEY;
			} else {
				process.env.ANTHROPIC_API_KEY = originalAnthropic;
			}
			if (originalNous === undefined) {
				delete process.env.NOUS_API_KEY;
			} else {
				process.env.NOUS_API_KEY = originalNous;
			}
			if (originalOpenAI === undefined) {
				delete process.env.OPENAI_API_KEY;
			} else {
				process.env.OPENAI_API_KEY = originalOpenAI;
			}
		}
	});
});
