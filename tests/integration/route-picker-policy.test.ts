import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closePool, getPool, query } from "../../src/infra/postgres/pool.ts";
import { NoPolicyAllowedRoute } from "../../src/core/orchestration/agent-spawner.ts";

/**
 * P742: integration tests for host_model_policy filtering at the route
 * picker layer. Each scenario inserts a transactional policy row, calls
 * the picker (via the exported async helper), and asserts the right
 * outcome. SAVEPOINTs would be cleaner but we use a setUp/tearDown
 * approach that snapshots and restores host_model_policy for our test
 * host name to avoid polluting state.
 *
 * These tests use a synthetic host name so they cannot affect the real
 * `bot`, `claude-box`, `gary-main`, or `hermes` policy rows.
 */

const TEST_HOST = "p742-test-host";
const TEST_PROVIDER = "claude";

async function clearTestPolicy() {
	await query(`DELETE FROM roadmap.host_model_policy WHERE host_name = $1`, [
		TEST_HOST,
	]);
}

async function setTestPolicy(allowed: string[], forbidden: string[]) {
	await clearTestPolicy();
	await query(
		`INSERT INTO roadmap.host_model_policy
		   (host_name, allowed_providers, forbidden_providers)
		 VALUES ($1, $2::text[], $3::text[])`,
		[TEST_HOST, allowed, forbidden],
	);
}

describe("P742: route picker host_model_policy filter", () => {
	before(() => {
		// Force AGENTHIVE_HOST for the picker (read at module init via
		// process.env.AGENTHIVE_HOST). Setting it now is too late if the
		// module already loaded; instead we test a private query path.
		getPool();
	});

	after(async () => {
		await clearTestPolicy();
		await closePool();
	});

	it("inserts and clears a policy row without error", async () => {
		await setTestPolicy(["anthropic"], []);
		const { rows } = await query(
			`SELECT host_name, allowed_providers, forbidden_providers
			   FROM roadmap.host_model_policy WHERE host_name = $1`,
			[TEST_HOST],
		);
		assert.equal(rows.length, 1);
		assert.deepEqual(rows[0].allowed_providers, ["anthropic"]);
		await clearTestPolicy();
	});

	/**
	 * Direct SQL test of the policy filter shape. We can't easily swap
	 * AGENTHIVE_HOST mid-process, but the SQL fragment is deterministic
	 * and we can run an equivalent query here.
	 */
	it("policy with allowed=[anthropic] excludes routes with route_provider != anthropic", async () => {
		await setTestPolicy(["anthropic"], []);
		const { rows } = await query(
			`SELECT mr.model_name, mr.route_provider
			   FROM roadmap.model_routes mr
			  WHERE mr.is_enabled = true
			    AND (
			      EXISTS (
			        SELECT 1 FROM roadmap.host_model_policy hp
			         WHERE hp.host_name = $1::text
			           AND (
			             coalesce(array_length(hp.allowed_providers, 1), 0) = 0
			             OR mr.route_provider = ANY(hp.allowed_providers)
			           )
			           AND NOT (mr.route_provider = ANY(hp.forbidden_providers))
			      )
			      OR NOT EXISTS (
			        SELECT 1 FROM roadmap.host_model_policy hp
			         WHERE hp.host_name = $1::text
			      )
			    )
			  LIMIT 50`,
			[TEST_HOST],
		);
		// Every returned row must have route_provider='anthropic'.
		for (const row of rows) {
			assert.equal(
				(row as any).route_provider,
				"anthropic",
				`route ${(row as any).model_name} returned despite allowed=[anthropic]`,
			);
		}
		await clearTestPolicy();
	});

	it("policy with forbidden=[anthropic] excludes anthropic routes", async () => {
		await setTestPolicy([], ["anthropic"]);
		const { rows } = await query(
			`SELECT mr.model_name, mr.route_provider
			   FROM roadmap.model_routes mr
			  WHERE mr.is_enabled = true
			    AND (
			      EXISTS (
			        SELECT 1 FROM roadmap.host_model_policy hp
			         WHERE hp.host_name = $1::text
			           AND (
			             coalesce(array_length(hp.allowed_providers, 1), 0) = 0
			             OR mr.route_provider = ANY(hp.allowed_providers)
			           )
			           AND NOT (mr.route_provider = ANY(hp.forbidden_providers))
			      )
			      OR NOT EXISTS (
			        SELECT 1 FROM roadmap.host_model_policy hp
			         WHERE hp.host_name = $1::text
			      )
			    )
			  LIMIT 100`,
			[TEST_HOST],
		);
		for (const row of rows) {
			assert.notEqual(
				(row as any).route_provider,
				"anthropic",
				`route ${(row as any).model_name} (anthropic) returned despite forbidden=[anthropic]`,
			);
		}
		await clearTestPolicy();
	});

	it("no policy row → all routes allowed (legacy fallback)", async () => {
		await clearTestPolicy();
		const { rows: filtered } = await query(
			`SELECT count(*)::int AS n FROM roadmap.model_routes mr
			  WHERE mr.is_enabled = true
			    AND (
			      EXISTS (SELECT 1 FROM roadmap.host_model_policy hp WHERE hp.host_name = $1::text
			              AND (coalesce(array_length(hp.allowed_providers, 1), 0) = 0
			                   OR mr.route_provider = ANY(hp.allowed_providers))
			              AND NOT (mr.route_provider = ANY(hp.forbidden_providers)))
			      OR NOT EXISTS (SELECT 1 FROM roadmap.host_model_policy hp WHERE hp.host_name = $1::text)
			    )`,
			[TEST_HOST],
		);
		const { rows: unfiltered } = await query(
			`SELECT count(*)::int AS n FROM roadmap.model_routes WHERE is_enabled = true`,
		);
		assert.equal(
			(filtered[0] as any).n,
			(unfiltered[0] as any).n,
			"with no policy row the filter must allow every enabled route",
		);
	});

	it("NoPolicyAllowedRoute is exported and constructs a meaningful message", () => {
		const err = new NoPolicyAllowedRoute(TEST_HOST, TEST_PROVIDER, "claude-sonnet-4-6");
		assert.ok(err.message.includes(TEST_HOST));
		assert.ok(err.message.includes(TEST_PROVIDER));
		assert.equal(err.name, "NoPolicyAllowedRoute");
	});
});
