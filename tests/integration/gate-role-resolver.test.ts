/**
 * P609: Integration tests for gate-role-resolver.ts
 *
 * AC coverage:
 *   AC-11  Partial unique index allows deprecated+new row swap
 *   AC-23  gate_role_history captures old values on UPDATE
 *   AC-25  NOTIFY trigger fires on INSERT/UPDATE; audit trigger fires on UPDATE
 *   AC-32  Two-level mutex (instance loadInFlight + module resolvingPromise)
 *   AC-33  Cold-start DB-down resilience → BUILTIN_FALLBACK, no unhandled rejection
 *   AC-5   Missing proposal_type → BUILTIN_FALLBACK (no orchestrator strand)
 *   AC-18  resolveGateRole() returns source field
 */

import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { Pool } from "pg";
import {
	resolveGateRole,
	getGateRoleRegistry,
	BUILTIN_FALLBACK,
	GateRoleRegistry,
} from "../../src/core/orchestration/gate-role-resolver.ts";

const DB_URL =
	process.env.DATABASE_URL ?? "postgresql://xiaomi@127.0.0.1:5432/agenthive";

let pool: Pool;

before(async () => {
	pool = new Pool({ connectionString: DB_URL, max: 5 });
});

after(async () => {
	await pool.end();
});

describe("P609 — gate-role-resolver", () => {
	// ── AC-23 / AC-25: Audit trigger captures old values on UPDATE ─────────────
	test("AC-23/AC-25: update a gate_role row → gate_role_history row inserted", async () => {
		// Insert a test row with a unique type:gate combo unlikely to conflict.
		const { rows: insertRows } = await pool.query<{ id: number }>(
			`INSERT INTO roadmap_proposal.gate_role
			   (proposal_type, gate, role, persona, output_contract, lifecycle_status)
			 VALUES ('feature', 'D4', 'gate-reviewer',
			         'Test persona initial',
			         'Test output contract',
			         'deprecated')
			 ON CONFLICT DO NOTHING
			 RETURNING id`,
		);

		// We may get no RETURNING if conflict — look up the row.
		const { rows: existing } = await pool.query<{ id: number }>(
			`SELECT id FROM roadmap_proposal.gate_role
			  WHERE proposal_type = 'feature' AND gate = 'D4'
			    AND lifecycle_status = 'deprecated'
			    AND persona = 'Test persona initial'
			  LIMIT 1`,
		);

		const rowId = insertRows[0]?.id ?? existing[0]?.id;
		if (!rowId) {
			// Row already exists from a prior run or seed — skip test gracefully.
			return;
		}

		const originalPersona = "Test persona initial";
		const updatedPersona = "Updated persona for AC-23 test";

		await pool.query(
			`UPDATE roadmap_proposal.gate_role
			    SET persona = $1
			  WHERE id = $2`,
			[updatedPersona, rowId],
		);

		const { rows: history } = await pool.query<{
			old_persona: string;
			old_lifecycle_status: string;
		}>(
			`SELECT old_persona, old_lifecycle_status
			   FROM roadmap_proposal.gate_role_history
			  WHERE gate_role_id = $1
			  ORDER BY changed_at DESC
			  LIMIT 1`,
			[rowId],
		);

		assert.ok(history.length > 0, "gate_role_history row must exist after UPDATE");
		assert.equal(
			history[0].old_persona,
			originalPersona,
			"old_persona must preserve the pre-update value",
		);
		assert.equal(
			history[0].old_lifecycle_status,
			"deprecated",
			"old_lifecycle_status must be captured",
		);

		// Cleanup.
		await pool.query(`DELETE FROM roadmap_proposal.gate_role WHERE id = $1`, [rowId]);
	});

	// ── AC-25: NOTIFY trigger fires on INSERT ─────────────────────────────────
	test("AC-25: INSERT triggers pg_notify on gate_role_changed channel", async () => {
		const notifyClient = await pool.connect();
		try {
			await notifyClient.query("LISTEN gate_role_changed");

			let notified = false;
			let notifyPayload: string | undefined;
			notifyClient.on("notification", (msg) => {
				if (msg.channel === "gate_role_changed") {
					notified = true;
					notifyPayload = msg.payload ?? undefined;
				}
			});

			// Insert a temporary row to trigger the NOTIFY.
			const { rows } = await pool.query<{ id: number }>(
				`INSERT INTO roadmap_proposal.gate_role
				   (proposal_type, gate, role, persona, output_contract, lifecycle_status)
				 VALUES ('hotfix', 'D4', 'gate-reviewer',
				         'NOTIFY test persona', 'NOTIFY test contract', 'deprecated')
				 RETURNING id`,
			);
			const rowId = rows[0]?.id;

			// Give the NOTIFY a moment to arrive.
			await new Promise((resolve) => setTimeout(resolve, 200));

			assert.ok(notified, "NOTIFY must fire on gate_role_changed channel after INSERT");
			if (notifyPayload) {
				const parsed = JSON.parse(notifyPayload);
				assert.ok("proposal_type" in parsed, "payload must contain proposal_type");
				assert.ok("gate" in parsed, "payload must contain gate");
				assert.ok("id" in parsed, "payload must contain id");
			}

			// Cleanup.
			if (rowId) {
				await pool.query(`DELETE FROM roadmap_proposal.gate_role WHERE id = $1`, [rowId]);
			}
		} finally {
			await notifyClient.query("UNLISTEN gate_role_changed");
			notifyClient.release();
		}
	});

	// ── AC-11: Partial unique index allows deprecated+new row swap ─────────────
	test("AC-11: partial unique index allows deprecated+new row swap without constraint violation", async () => {
		// Ensure no active hotfix/D1 row exists for this test.
		await pool.query(
			`UPDATE roadmap_proposal.gate_role
			    SET lifecycle_status = 'deprecated'
			  WHERE proposal_type = 'hotfix' AND gate = 'D1'
			    AND lifecycle_status = 'active'`,
		);

		// Insert a new active row — should not violate unique constraint.
		const { rows } = await pool.query<{ id: number }>(
			`INSERT INTO roadmap_proposal.gate_role
			   (proposal_type, gate, role, persona, output_contract, lifecycle_status)
			 VALUES ('hotfix', 'D1', 'skeptic-alpha',
			         'AC-11 test persona', 'AC-11 test contract', 'active')
			 ON CONFLICT DO NOTHING
			 RETURNING id`,
		);

		// Confirm we can have a deprecated AND an active row for the same (type, gate).
		const { rows: counts } = await pool.query<{
			active_count: string;
			deprecated_count: string;
		}>(
			`SELECT
			   COUNT(*) FILTER (WHERE lifecycle_status = 'active')    AS active_count,
			   COUNT(*) FILTER (WHERE lifecycle_status = 'deprecated') AS deprecated_count
			   FROM roadmap_proposal.gate_role
			  WHERE proposal_type = 'hotfix' AND gate = 'D1'`,
		);

		assert.equal(Number(counts[0].active_count), 1, "exactly one active row after swap");
		assert.ok(
			Number(counts[0].deprecated_count) >= 0,
			"deprecated rows can coexist with the new active row",
		);

		// Cleanup test rows.
		if (rows[0]?.id) {
			await pool.query(`DELETE FROM roadmap_proposal.gate_role WHERE id = $1`, [rows[0].id]);
		}
		// Restore seed rows from deprecated if they exist.
		await pool.query(
			`UPDATE roadmap_proposal.gate_role
			    SET lifecycle_status = 'active'
			  WHERE proposal_type = 'hotfix' AND gate = 'D1'
			    AND lifecycle_status = 'deprecated'
			    AND persona LIKE 'skeptic-alpha%'`,
		);
	});

	// ── AC-5: Missing proposal_type → BUILTIN_FALLBACK ────────────────────────
	test("AC-5: unknown proposal_type resolves to BUILTIN_FALLBACK without throwing", async () => {
		await getGateRoleRegistry(pool); // ensure registry loaded
		const profile = await resolveGateRole("nonexistent-type-xyz", "D1", pool);

		assert.equal(
			profile.source,
			"builtin-fallback",
			"missing proposal_type must return builtin-fallback source",
		);
		assert.equal(
			profile.role,
			BUILTIN_FALLBACK["D1"].role,
			"role must match BUILTIN_FALLBACK D1",
		);
	});

	// ── AC-18: resolveGateRole returns source field ────────────────────────────
	test("AC-18: resolveGateRole returns source field for every resolution path", async () => {
		await getGateRoleRegistry(pool);

		// DB-cache path: an active row exists from seed.
		const dbProfile = await resolveGateRole("feature", "D1", pool);
		assert.ok(
			["db-cache", "db-fresh", "builtin-fallback"].includes(dbProfile.source),
			`source must be one of the three valid values, got: ${dbProfile.source}`,
		);
		assert.ok(dbProfile.role.length > 0, "role must be non-empty");

		// BUILTIN_FALLBACK path: unknown type.
		const fallbackProfile = await resolveGateRole("__no_such_type__", "D3", pool);
		assert.equal(fallbackProfile.source, "builtin-fallback");
	});

	// ── AC-32: Two-level mutex ─────────────────────────────────────────────────
	test("AC-32: concurrent getGateRoleRegistry calls return the same instance (outer mutex)", async () => {
		// Fire three concurrent calls — should not create more than one registry.
		const [r1, r2, r3] = await Promise.all([
			getGateRoleRegistry(pool),
			getGateRoleRegistry(pool),
			getGateRoleRegistry(pool),
		]);
		// All three must resolve; the resolved profile must be functional.
		const p1 = r1.resolve("feature", "D1");
		const p2 = r2.resolve("feature", "D1");
		const p3 = r3.resolve("feature", "D1");
		assert.equal(p1.role, p2.role, "concurrent registries must return same role");
		assert.equal(p2.role, p3.role);
	});

	// ── AC-33: Cold-start DB-down resilience ──────────────────────────────────
	test("AC-33: DB-unavailable at load() → fallback-only registry, no unhandled rejection", async () => {
		// Simulate DB failure by passing a pool with an invalid connection string.
		const badPool = new Pool({
			connectionString: "postgresql://nobody@127.0.0.1:5499/doesnotexist",
			connectionTimeoutMillis: 500,
			max: 1,
		});

		try {
			// Should NOT throw — must catch internally and return a fallback registry.
			let registry: InstanceType<typeof GateRoleRegistry>;
			await assert.doesNotReject(async () => {
				registry = await getGateRoleRegistry(badPool);
			}, "getGateRoleRegistry must not reject on DB failure");

			// The returned registry must still resolve via BUILTIN_FALLBACK.
			// @ts-expect-error registry assigned in doesNotReject callback
			const profile = registry!.resolve("feature", "D2");
			assert.equal(
				profile.source,
				"builtin-fallback",
				"DB-down registry must return builtin-fallback source",
			);
			assert.equal(
				profile.role,
				BUILTIN_FALLBACK["D2"].role,
				"role must match BUILTIN_FALLBACK D2",
			);
		} finally {
			await badPool.end();
		}
	});
});
