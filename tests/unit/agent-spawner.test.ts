import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertHermesRouteAllowed } from "../../src/core/orchestration/agent-spawner.ts";

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
});
