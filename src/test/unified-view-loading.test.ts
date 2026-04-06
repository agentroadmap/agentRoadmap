import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Core } from "../core/roadmap.ts";
import { loadProposalsForUnifiedView } from "../ui/unified-view.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

describe("loadProposalsForUnifiedView", () => {
	let testDir: string;
	let core: Core;

	beforeEach(() => {
		testDir = createUniqueTestDir("unified-view-load");
		core = new Core(testDir);
	});

	afterEach(async () => {
		try {
			await safeCleanup(testDir);
		} catch {
			// Ignore cleanup failures in tests
		}
	});

	it("uses provided loader progress and closes the loading screen", async () => {
		const updates: string[] = [];
		let closed = false;

		const result = await loadProposalsForUnifiedView(core, {
			proposalsLoader: async (updateProgress) => {
				updateProgress("step one");
				return { proposals: [], statuses: ["Potential", "Active"] };
			},
			loadingScreenFactory: async () => ({
				update: (msg: string) => {
					updates.push(msg);
				},
				close: async () => {
					closed = true;
				},
			}),
		});

		assert.ok(updates.includes("step one"));
		assert.strictEqual(closed, true);
		assert.deepStrictEqual(result.statuses, ["Potential", "Active"]);
	});
});
