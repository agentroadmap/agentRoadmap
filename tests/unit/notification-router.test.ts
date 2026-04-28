import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	listTransports,
	registerTransportForTest,
	resolveTransport,
} from "../../src/core/notifications/transport-registry.ts";
import {
	severityAtLeast,
	type NotificationTransport,
	type Severity,
	TransportError,
} from "../../src/core/notifications/types.ts";

describe("severity rank", () => {
	it("CRITICAL >= ALERT", () => {
		assert.equal(severityAtLeast("CRITICAL", "ALERT"), true);
	});
	it("INFO < CRITICAL", () => {
		assert.equal(severityAtLeast("INFO", "CRITICAL"), false);
	});
	it("equal severity satisfies the bar", () => {
		assert.equal(severityAtLeast("ALERT", "ALERT"), true);
	});
	it("rank gates work for every level", () => {
		const ranks: Severity[] = ["INFO", "ALERT", "URGENT", "CRITICAL"];
		for (let i = 0; i < ranks.length; i++) {
			for (let j = 0; j < ranks.length; j++) {
				assert.equal(
					severityAtLeast(ranks[i], ranks[j]),
					i >= j,
					`expected ${ranks[i]} >= ${ranks[j]} to be ${i >= j}`,
				);
			}
		}
	});
});

describe("transport registry", () => {
	it("includes the four built-in adapters", () => {
		const names = new Set(listTransports());
		for (const expected of ["discord_webhook", "log_only", "in_app", "mcp_agent"]) {
			assert.equal(names.has(expected), true, `missing transport: ${expected}`);
		}
	});

	it("resolveTransport returns null for unknown", () => {
		assert.equal(resolveTransport("does_not_exist"), null);
	});

	it("registerTransportForTest swaps in and undo restores", () => {
		const captured: string[] = [];
		const testTransport: NotificationTransport = {
			name: "log_only",
			async send({ envelope }) {
				captured.push(envelope.kind);
			},
		};
		const undo = registerTransportForTest(testTransport);
		try {
			const adapter = resolveTransport("log_only");
			assert.ok(adapter);
			assert.equal(adapter, testTransport);
		} finally {
			undo();
		}
		const restored = resolveTransport("log_only");
		assert.ok(restored);
		assert.notEqual(restored, testTransport);
	});
});

describe("TransportError", () => {
	it("captures transport name and cause", () => {
		const err = new TransportError("discord_webhook", new Error("boom"));
		assert.equal(err.transport, "discord_webhook");
		assert.match(err.message, /discord_webhook/);
		assert.match(err.message, /boom/);
	});
});
