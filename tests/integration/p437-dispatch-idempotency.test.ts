/**
 * P437 dispatch idempotency integration test.
 *
 * Verifies the partial UNIQUE INDEX uniq_squad_dispatch_idempotency_alive
 * collapses concurrent identical postWorkOffer calls into one alive
 * squad_dispatch row plus an attempt_count >= 2.
 *
 * Requires a reachable Postgres with migration 061 applied.
 * Run: bun test tests/integration/p437-dispatch-idempotency.test.ts
 */

import { strict as assert } from "node:assert";
import { afterEach as afterAll, beforeEach as beforeAll, describe, it } from "node:test";
import { query, closePool } from "../../src/infra/postgres/pool.ts";
import { postWorkOffer } from "../../src/core/pipeline/post-work-offer.ts";

const TEST_TAG = `itest_p437_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

describe("P437 dispatch idempotency", () => {
	let testProposalId: number;

	beforeAll(async () => {
		const { rows } = await query<{ id: number }>(
			`INSERT INTO roadmap_proposal.proposal
			   (display_id, title, summary, type, status, maturity, project_id, audit)
			 VALUES ($1, $2, $3, 'feature', 'DEVELOP', 'mature', 1, '[]'::jsonb)
			 RETURNING id`,
			[
				`P_${TEST_TAG}`.slice(0, 16),
				`p437-itest ${TEST_TAG}`,
				"P437 idempotency test fixture",
			],
		);
		testProposalId = rows[0].id;
	});

	afterAll(async () => {
		await query(
			`DELETE FROM roadmap_workforce.squad_dispatch WHERE proposal_id = $1`,
			[testProposalId],
		);
		await query(`DELETE FROM roadmap_proposal.proposal WHERE id = $1`, [
			testProposalId,
		]);
		await closePool();
	});
	it("collapses three concurrent identical postWorkOffer calls into one alive dispatch row with attempt_count=3", async () => {
		// Fire three identical offers in parallel. The hashing inputs
		// (project_id, proposal_id, status, maturity, role, version) are all
		// the same → all three map to the same idempotency_key → only one
		// row survives in alive state, the other two DO UPDATE attempt_count.
		const results = await Promise.all([
			postWorkOffer({
				proposalId: testProposalId,
				squadName: `sq-${TEST_TAG}`,
				role: `role-${TEST_TAG}`,
				task: "first concurrent post",
			}),
			postWorkOffer({
				proposalId: testProposalId,
				squadName: `sq-${TEST_TAG}`,
				role: `role-${TEST_TAG}`,
				task: "second concurrent post",
			}),
			postWorkOffer({
				proposalId: testProposalId,
				squadName: `sq-${TEST_TAG}`,
				role: `role-${TEST_TAG}`,
				task: "third concurrent post",
			}),
		]);

		const ids = new Set(results.map((r) => r.dispatchId));
		assert.equal(ids.size, 1, "all three calls should return the same dispatchId");

		const replays = results.filter((r) => r.replay).length;
		assert.equal(replays, 2, "exactly two of the three calls should be flagged as replay");

		const { rows } = await query<{ count: string; max_attempt: string }>(
			`SELECT count(*)::text AS count, max(attempt_count)::text AS max_attempt
			 FROM roadmap_workforce.squad_dispatch
			 WHERE proposal_id = $1
			   AND dispatch_role = $2
			   AND dispatch_status IN ('open', 'assigned', 'active')`,
			[testProposalId, `role-${TEST_TAG}`],
		);
		assert.equal(rows[0].count, "1", "exactly one alive dispatch row should exist");
		assert.equal(
			rows[0].max_attempt,
			"3",
			"attempt_count should be incremented to 3",
		);
	});

	it("inserts a fresh row when the prior dispatch is closed (terminal state)", async () => {
		// Close the prior alive row → next postWorkOffer should INSERT a
		// fresh row, not DO UPDATE the closed one. The partial UNIQUE INDEX
		// only constrains alive states.
		await query(
			`UPDATE roadmap_workforce.squad_dispatch
			 SET dispatch_status = 'completed', completed_at = now()
			 WHERE proposal_id = $1 AND dispatch_role = $2`,
			[testProposalId, `role-${TEST_TAG}`],
		);

		const result = await postWorkOffer({
			proposalId: testProposalId,
			squadName: `sq-${TEST_TAG}`,
			role: `role-${TEST_TAG}`,
			task: "post-close fresh dispatch",
		});

		assert.equal(result.replay, false, "fresh post should not be a replay");
		assert.equal(result.attemptCount, 1, "fresh row starts at attempt 1");
	});
});
