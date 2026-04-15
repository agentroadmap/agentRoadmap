import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildContextPackage,
	createDriftMonitor,
	estimateTokenCount,
	makeCacheKey,
	scoreRelevance,
} from "../../src/core/orchestration/token-efficiency.ts";

describe("P231: Token Efficiency", () => {
	it("estimates tokens at roughly one token per four chars", () => {
		assert.equal(estimateTokenCount("abcd"), 1);
		assert.equal(estimateTokenCount("abcdefgh"), 2);
	});

	it("builds a compact context package under the target budget", () => {
		const context = buildContextPackage({
			proposalId: "P231",
			taskType: "gate_review",
			taskSummary: "Review the token efficiency proposal",
			maxTokens: 2000,
			sections: [
				{
					title: "Proposal",
					priority: 1,
					body: "x".repeat(5000),
				},
				{
					title: "Acceptance Criteria",
					priority: 2,
					body: "y".repeat(5000),
				},
				{
					title: "Shared Memory",
					priority: 10,
					body: "z".repeat(5000),
				},
			],
		});

		assert.ok(estimateTokenCount(context) <= 2000);
		assert.ok(context.includes("proposal_id: P231"));
	});

	it("produces stable cache keys for equivalent payloads", () => {
		const keyA = makeCacheKey("proposal", { id: "P231", stage: "Draft" });
		const keyB = makeCacheKey("proposal", { stage: "Draft", id: "P231" });
		assert.equal(keyA, keyB);
	});

	it("scores related output higher than off-topic output", () => {
		const relevant = scoreRelevance(
			"Implement P231 token efficiency context construction and cache hits",
			"Implement P231 token efficiency",
		);
		const offTopic = scoreRelevance(
			"Write a poem about cats and sunsets",
			"Implement P231 token efficiency",
		);
		assert.ok(relevant > offTopic);
		assert.ok(offTopic < 0.5);
	});

	it("flags drift on low relevance output", () => {
		const monitor = createDriftMonitor("Implement P231 token efficiency", {
			checkEvery: 2,
			relevanceThreshold: 0.6,
			criticalThreshold: 0.3,
		});

		assert.equal(monitor.record("on topic"), null);
		const event = monitor.record("unrelated detour");
		assert.ok(event);
		assert.equal(event?.level, "critical");
	});
});
