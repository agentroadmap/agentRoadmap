import assert from "node:assert/strict";
import { describe, it, after, before } from "node:test";
import { getPool, closePool } from "../../src/infra/postgres/pool.ts";

/**
 * P741 (HF-J + HF-F): integration assertions that migration 070 actually
 * landed and the trigger / function bodies contain the expected branches.
 * Static schema check — runs against the live DB.
 */
describe("P741 migration 070: lease release + notify suppression", () => {
	let pool: ReturnType<typeof getPool>;

	before(() => {
		pool = getPool();
	});

	after(async () => {
		await closePool();
	});

	it("trigger trg_release_leases_on_transition exists on roadmap_proposal.proposal", async () => {
		const { rows } = await pool.query(
			`SELECT trigger_name FROM information_schema.triggers
			  WHERE trigger_name = 'trg_release_leases_on_transition'
			    AND event_object_schema = 'roadmap_proposal'
			    AND event_object_table = 'proposal'`,
		);
		assert.ok(rows.length >= 1, "trigger missing — migration 070 not applied");
	});

	it("fn_release_leases_on_transition exists in roadmap schema", async () => {
		const { rows } = await pool.query(
			`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
			  WHERE n.nspname = 'roadmap' AND p.proname = 'fn_release_leases_on_transition'`,
		);
		assert.equal(rows.length, 1, "fn_release_leases_on_transition not found");
	});

	it("roadmap_proposal.fn_lease_clear_maturity_on_release contains gate_transitioned branch", async () => {
		const { rows } = await pool.query(
			`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
			  WHERE n.nspname = 'roadmap_proposal'
			    AND p.proname = 'fn_lease_clear_maturity_on_release'`,
		);
		assert.equal(rows.length, 1, "function not found");
		const src = String(rows[0].prosrc);
		assert.ok(
			src.includes("gate_transitioned"),
			"fn_lease_clear_maturity_on_release missing gate_transitioned branch — HF-J not applied to schema-bound version",
		);
	});

	it("fn_notify_gate_ready contains recent-decision suppression", async () => {
		const { rows } = await pool.query(
			`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
			  WHERE n.nspname = 'roadmap' AND p.proname = 'fn_notify_gate_ready'`,
		);
		assert.equal(rows.length, 1);
		const src = String(rows[0].prosrc);
		assert.ok(
			src.includes("recent_decision") || src.includes("v_recent_decision"),
			"fn_notify_gate_ready missing recent-decision suppression — HF-F not applied",
		);
		assert.ok(
			src.includes("gate_decision_log"),
			"fn_notify_gate_ready missing gate_decision_log lookup — HF-F not applied",
		);
		assert.ok(
			src.includes("10 minutes") || src.includes("10 min"),
			"fn_notify_gate_ready missing 10-minute window",
		);
	});
});
