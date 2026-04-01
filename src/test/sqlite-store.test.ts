import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../core/sqlite-store.ts";
import type { Proposal } from "../types/index.ts";

describe("SqliteStore readiness filtering", () => {
	let TEST_DIR: string;
	let store: SqliteStore;

	before(async () => {
		TEST_DIR = join(tmpdir(), `roadmap-sqlite-test-${Date.now()}`);
		mkdirSync(TEST_DIR, { recursive: true });
		store = new SqliteStore(TEST_DIR);
		await store.ensureInitialized();
	});

	after(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("filters proposals by readiness", async () => {
		// 1. Ready proposal (Potential, unassigned, no deps)
		const proposal1: Proposal = {
			id: "proposal-1",
			title: "Ready Proposal",
			status: "Potential",
			assignee: [],
			dependencies: [],
			createdDate: "2026-03-16",
			labels: []
		};

		// 2. Blocked proposal (Potential, unassigned, depends on proposal-1)
		const proposal2: Proposal = {
			id: "proposal-2",
			title: "Blocked Proposal",
			status: "Potential",
			assignee: [],
			dependencies: ["proposal-1"],
			createdDate: "2026-03-16",
			labels: []
		};

		// 3. Assigned proposal (Potential, assigned, no deps)
		const proposal3: Proposal = {
			id: "proposal-3",
			title: "Assigned Proposal",
			status: "Potential",
			assignee: ["@agent"],
			dependencies: [],
			createdDate: "2026-03-16",
			labels: []
		};

		// 4. Terminal proposal (Complete)
		const proposal4: Proposal = {
			id: "proposal-4",
			title: "Complete Proposal",
			status: "Complete",
			assignee: [],
			dependencies: [],
			createdDate: "2026-03-16",
			labels: []
		};

		store.upsertProposal(proposal1, Date.now(), "Ready Proposal Body");
		store.upsertProposal(proposal2, Date.now(), "Blocked Proposal Body");
		store.upsertProposal(proposal3, Date.now(), "Assigned Proposal Body");
		store.upsertProposal(proposal4, Date.now(), "Complete Proposal Body");

		// Query all proposals
		const all = store.queryProposals({});
		assert.strictEqual(all.length, 4);
		
		const readyProposalsAll = all.filter(s => s.ready);
		assert.strictEqual(readyProposalsAll.length, 1);
		assert.strictEqual(readyProposalsAll[0].id, "proposal-1");

		// Query specifically with ready filter
		const ready = store.queryProposals({ ready: true });
		assert.strictEqual(ready.length, 1);
		assert.strictEqual(ready[0].id, "proposal-1");
		assert.strictEqual(ready[0].ready, true);

		// Now mark proposal-1 as Complete and check if proposal-2 becomes ready
		const proposal1Complete = { ...proposal1, status: "Complete" };
		store.upsertProposal(proposal1Complete, Date.now(), "Ready Proposal Body Complete");

		const readyAfterUpdate = store.queryProposals({ ready: true });
		// proposal-1 is now complete (terminal), so not ready.
		// proposal-2 depends on proposal-1 (complete), so it should be ready now.
		assert.strictEqual(readyAfterUpdate.length, 1);
		assert.strictEqual(readyAfterUpdate[0].id, "proposal-2");
		assert.strictEqual(readyAfterUpdate[0].ready, true);
	});
});
