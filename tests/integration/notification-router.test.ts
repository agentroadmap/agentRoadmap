/**
 * P674 integration test — exercises the full drain loop against the live DB.
 *
 * Skipped automatically when DATABASE_URL or a test DB is unavailable.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Client } from "pg";

import { NotificationRouter } from "../../src/core/notifications/router.ts";
import {
	registerTransportForTest,
} from "../../src/core/notifications/transport-registry.ts";
import { closePool, getPool } from "../../src/infra/postgres/pool.ts";
import type { NotificationTransport } from "../../src/core/notifications/types.ts";

const SHOULD_SKIP =
	!process.env.DATABASE_URL && !process.env.PGUSER;

const skip = (msg = "no DB credentials in env"): { skip: string } => ({ skip: msg });

const TEST_KIND = `__router_test_${Date.now()}`;

describe("notification router (integration)", () => {
	if (SHOULD_SKIP) {
		it("skipped — set DATABASE_URL to enable", skip());
		return;
	}

	let router: NotificationRouter | null = null;
	const undoStack: Array<() => void> = [];

	beforeEach(async () => {
		const pool = getPool();
		await pool.query(
			`INSERT INTO roadmap.notification_route (kind, severity_min, transport, target, notes)
			 VALUES ($1, 'INFO', 'log_only', NULL, 'integration test route')
			 ON CONFLICT DO NOTHING`,
			[TEST_KIND],
		);
	});

	afterEach(async () => {
		while (undoStack.length) undoStack.pop()!();
		if (router) {
			await router.stop();
			router = null;
		}
		const pool = getPool();
		await pool.query(`DELETE FROM roadmap.notification_route WHERE kind = $1`, [TEST_KIND]);
		await pool.query(`DELETE FROM roadmap.notification_queue WHERE kind = $1`, [TEST_KIND]);
		await closePool();
	});

	it("drains a pending row via the registered transport within 2s", async () => {
		const seen: string[] = [];
		const captureTransport: NotificationTransport = {
			name: "log_only",
			async send({ envelope }) {
				seen.push(`${envelope.kind}:${envelope.queueId}`);
			},
		};
		undoStack.push(registerTransportForTest(captureTransport));

		const pool = getPool();
		router = new NotificationRouter({
			pool,
			listenerFactory: async () => {
				const cfg = (pool as unknown as { options: Record<string, unknown> }).options;
				const c = new Client({
					host: cfg.host as string,
					port: cfg.port as number,
					user: cfg.user as string,
					password: cfg.password as string,
					database: cfg.database as string,
				});
				await c.connect();
				return c;
			},
			log: () => {},
			warn: () => {},
			error: () => {},
		});
		await router.run();

		const { rows } = await pool.query<{ id: string }>(
			`INSERT INTO roadmap.notification_queue
			   (proposal_id, severity, kind, title, body, metadata)
			 VALUES (NULL, 'INFO', $1, 'integration', 'body', '{}'::jsonb)
			 RETURNING id`,
			[TEST_KIND],
		);
		const queueId = rows[0]?.id;
		assert.ok(queueId, "expected an inserted id");

		// Wait up to 2s for dispatch.
		const deadline = Date.now() + 2_000;
		while (Date.now() < deadline && seen.length === 0) {
			await new Promise((r) => setTimeout(r, 50));
		}

		assert.equal(seen.length, 1, `expected 1 dispatch, saw ${seen.length}`);
		assert.equal(seen[0], `${TEST_KIND}:${queueId}`);

		const status = await pool.query<{ status: string }>(
			`SELECT status FROM roadmap.notification_queue WHERE id = $1`,
			[queueId],
		);
		assert.equal(status.rows[0]?.status, "sent");
	});

	it("escalates when transport always throws", async () => {
		const failing: NotificationTransport = {
			name: "log_only",
			async send() {
				throw new Error("simulated failure");
			},
		};
		undoStack.push(registerTransportForTest(failing));

		const pool = getPool();
		router = new NotificationRouter({
			pool,
			listenerFactory: async () => {
				const cfg = (pool as unknown as { options: Record<string, unknown> }).options;
				const c = new Client({
					host: cfg.host as string,
					port: cfg.port as number,
					user: cfg.user as string,
					password: cfg.password as string,
					database: cfg.database as string,
				});
				await c.connect();
				return c;
			},
			log: () => {},
			warn: () => {},
			error: () => {},
		});
		await router.run();

		const { rows } = await pool.query<{ id: string }>(
			`INSERT INTO roadmap.notification_queue
			   (proposal_id, severity, kind, title, body, metadata)
			 VALUES (NULL, 'CRITICAL', $1, 'fail', 'body', '{}'::jsonb)
			 RETURNING id`,
			[TEST_KIND],
		);
		const queueId = rows[0]?.id;

		// Allow up to 60s for 5 attempts × backoff (1+4+12+32 ≈ 49s) — but stop early if status flips.
		const deadline = Date.now() + 60_000;
		let finalStatus = "pending";
		while (Date.now() < deadline) {
			const r = await pool.query<{ status: string; dispatch_attempts: number }>(
				`SELECT status, dispatch_attempts FROM roadmap.notification_queue WHERE id = $1`,
				[queueId],
			);
			finalStatus = r.rows[0]?.status ?? "pending";
			if (finalStatus === "failed") break;
			await new Promise((r) => setTimeout(r, 500));
		}

		assert.equal(finalStatus, "failed");

		// Verify a dispatch_failed escalation row was enqueued.
		const esc = await pool.query<{ id: string }>(
			`SELECT id FROM roadmap.notification_queue
			  WHERE kind = 'notification_dispatch_failed'
			    AND metadata @> jsonb_build_object('original_queue_id', $1::bigint)`,
			[queueId],
		);
		assert.equal(esc.rows.length, 1, "expected one dispatch_failed escalation row");
	});
});
