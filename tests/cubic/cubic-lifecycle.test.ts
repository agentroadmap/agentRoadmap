/**
 * P196: Cubic Lifecycle Management — Acceptance Criteria Tests
 *
 * Tests idle detection, automatic cleanup, and resource reclamation.
 * Uses node:test (not vitest — not installed).
 */

import assert from "node:assert/strict";
import { describe, test, after } from "node:test";
import { mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { query } from "../../src/postgres/pool.ts";
import { CubicIdleDetector } from "../../src/core/orchestration/cubic-idle-detector.ts";
import { CubicCleanupService } from "../../src/core/orchestration/cubic-cleanup.ts";
import { PgCubicHandlers } from "../../src/apps/mcp-server/tools/cubic/pg-handlers.ts";

const WORKTREE_ROOT = "/data/code/worktree";
const TEST_PREFIX = "p196-test";
const AGENTHIVE_ROOT = "/data/code/AgentHive";

// Collect created cubic IDs for teardown
const createdIds: string[] = [];

async function createTestCubic(suffix: string): Promise<string> {
	const worktreePath = `${WORKTREE_ROOT}/${TEST_PREFIX}-${suffix}`;
	const { rows } = await query<{ cubic_id: string }>(
		`INSERT INTO roadmap.cubics (worktree_path, metadata)
		 VALUES ($1, $2)
		 RETURNING cubic_id`,
		[worktreePath, JSON.stringify({ test: true, p196: true })],
	);
	const id = rows[0].cubic_id;
	createdIds.push(id);
	return id;
}

// Global teardown — runs after all tests in this file
after(async () => {
	if (createdIds.length > 0) {
		await query(
			`DELETE FROM roadmap.cubics WHERE cubic_id = ANY($1::text[])`,
			[createdIds],
		);
	}
});

describe("P196: Cubic Lifecycle Management", () => {
	// AC-1: cubic_state table exists in roadmap schema
	test("AC-1: roadmap.cubic_state table exists", async () => {
		const { rows } = await query<{ table_name: string }>(
			`SELECT table_name
			 FROM information_schema.tables
			 WHERE table_schema = 'roadmap'
			   AND table_name = 'cubic_state'`,
		);
		assert.equal(rows.length, 1, "cubic_state must exist in roadmap schema");
	});

	// AC-1b: trigger auto-creates cubic_state row on INSERT into cubics
	test("AC-1b: INSERT into cubics auto-creates cubic_state row via trigger", async () => {
		const ts = Date.now();
		const cubicId = await createTestCubic(`trigger-${ts}`);

		const { rows } = await query<{
			lifecycle_status: string;
			phase: string;
		}>(
			`SELECT lifecycle_status, phase FROM roadmap.cubic_state WHERE cubic_id = $1`,
			[cubicId],
		);

		assert.equal(rows.length, 1, "trigger must create one cubic_state row");
		assert.equal(rows[0].lifecycle_status, "ACTIVE");
		assert.equal(rows[0].phase, "RUNNING");
	});

	// AC-2: detectIdleCubics returns cubics with activity older than 5 minutes
	test("AC-2: detectIdleCubics finds cubics idle for more than 5 minutes", async () => {
		const ts = Date.now();
		const cubicId = await createTestCubic(`idle-${ts}`);

		// Backdate activity 6 minutes and set non-RUNNING phase to satisfy query predicate
		await query(
			`UPDATE roadmap.cubic_state
			 SET last_activity_at = NOW() - '6 minutes'::interval,
			     phase = 'IDLE'
			 WHERE cubic_id = $1`,
			[cubicId],
		);

		const detector = new CubicIdleDetector();
		const idleCubics = await detector.detectIdleCubics();

		const found = idleCubics.some((c) => c.cubic_id === cubicId);
		assert.ok(
			found,
			`Cubic ${cubicId} (6 min activity age, phase=IDLE) must appear in detectIdleCubics()`,
		);
	});

	// AC-3: detectStaleCubics returns IDLE cubics older than 30 minutes
	test("AC-3: detectStaleCubics finds cubics in IDLE status older than 30 minutes", async () => {
		const ts = Date.now();
		const cubicId = await createTestCubic(`stale-${ts}`);

		await query(
			`UPDATE roadmap.cubic_state
			 SET lifecycle_status = 'IDLE',
			     last_activity_at = NOW() - '31 minutes'::interval,
			     idle_since = NOW() - '31 minutes'::interval,
			     phase = 'IDLE'
			 WHERE cubic_id = $1`,
			[cubicId],
		);

		const detector = new CubicIdleDetector();
		const staleCubics = await detector.detectStaleCubics();

		const found = staleCubics.some((c) => c.cubic_id === cubicId);
		assert.ok(
			found,
			`Cubic ${cubicId} (31 min idle) must appear in detectStaleCubics()`,
		);
	});

	// AC-4: removeWorktree removes the worktree directory from disk
	test("AC-4: removeWorktree deletes the cubic's worktree directory", async () => {
		const ts = Date.now();
		const suffix = `worktree-${ts}`;
		const cubicId = await createTestCubic(suffix);
		const worktreePath = `${WORKTREE_ROOT}/${TEST_PREFIX}-${suffix}`;

		mkdirSync(worktreePath, { recursive: true });
		assert.ok(existsSync(worktreePath), "directory must exist before test");

		const cleanup = new CubicCleanupService();
		await cleanup.removeWorktree(cubicId);

		assert.ok(!existsSync(worktreePath), "worktree directory must be removed");
	});

	// AC-5: expireCubic sets lifecycle_status to ARCHIVED
	test("AC-5: expireCubic sets cubic_state.lifecycle_status to ARCHIVED", async () => {
		const ts = Date.now();
		const cubicId = await createTestCubic(`expire-${ts}`);

		const cleanup = new CubicCleanupService();
		await cleanup.expireCubic(cubicId);

		const { rows } = await query<{ lifecycle_status: string }>(
			`SELECT lifecycle_status FROM roadmap.cubic_state WHERE cubic_id = $1`,
			[cubicId],
		);
		assert.equal(rows.length, 1, "cubic_state row must exist");
		assert.equal(rows[0].lifecycle_status, "ARCHIVED");
	});

	// AC-6: updateActivity resets idle tracking and promotes lifecycle_status to ACTIVE
	test("AC-6: updateActivity clears idle_since and sets lifecycle_status=ACTIVE", async () => {
		const ts = Date.now();
		const cubicId = await createTestCubic(`activity-${ts}`);

		const detector = new CubicIdleDetector();
		await detector.markIdle(cubicId);

		const before = new Date();
		await detector.updateActivity(cubicId);
		const after = new Date();

		const { rows } = await query<{
			lifecycle_status: string;
			idle_since: string | null;
			last_activity_at: string;
		}>(
			`SELECT lifecycle_status, idle_since, last_activity_at
			 FROM roadmap.cubic_state WHERE cubic_id = $1`,
			[cubicId],
		);

		assert.equal(rows.length, 1);
		assert.equal(rows[0].lifecycle_status, "ACTIVE");
		assert.equal(rows[0].idle_since, null, "idle_since must be cleared after updateActivity");

		const lastActivity = new Date(rows[0].last_activity_at);
		assert.ok(
			lastActivity >= before && lastActivity <= after,
			`last_activity_at (${lastActivity.toISOString()}) must be within the test window`,
		);
	});

	// AC-7: cubic_focus MCP tool invokes updateActivity on the cubic_state row
	test("AC-7: focusCubic handler updates cubic_state.last_activity_at via updateActivity", async () => {
		const ts = Date.now();
		const cubicId = await createTestCubic(`focus-${ts}`);

		// Backdate so the update is unambiguous
		await query(
			`UPDATE roadmap.cubic_state
			 SET last_activity_at = NOW() - '10 minutes'::interval,
			     lifecycle_status = 'IDLE',
			     phase = 'IDLE'
			 WHERE cubic_id = $1`,
			[cubicId],
		);

		// PgCubicHandlers.focusCubic does not use this.core — safe to pass null
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const handlers = new PgCubicHandlers(null as any);
		const result = await handlers.focusCubic({
			cubicId,
			agent: "test-agent",
			task: "p196 ac-7 test",
		});

		const text = (result.content[0] as { type: string; text: string }).text;
		assert.ok(!text.includes("⚠️"), `focusCubic should succeed, got: ${text}`);

		const { rows } = await query<{
			lifecycle_status: string;
			last_activity_at: string;
		}>(
			`SELECT lifecycle_status, last_activity_at
			 FROM roadmap.cubic_state WHERE cubic_id = $1`,
			[cubicId],
		);

		assert.equal(rows[0].lifecycle_status, "ACTIVE");

		const updatedAt = new Date(rows[0].last_activity_at);
		const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
		assert.ok(
			updatedAt > twoMinutesAgo,
			`last_activity_at must be recent after focusCubic; got ${updatedAt.toISOString()}`,
		);
	});

	// AC-8: cron script runs to completion without error
	test("AC-8: cubic-lifecycle-cron.ts executes and produces expected output", () => {
		const output = execSync(
			`cd ${AGENTHIVE_ROOT} && bun run scripts/cubic-lifecycle-cron.ts --dry-run`,
			{ encoding: "utf-8", timeout: 30_000 },
		);

		assert.ok(
			output.includes("[cubic-lifecycle]"),
			"script must emit [cubic-lifecycle] log lines",
		);
		assert.ok(
			output.includes("[cubic-lifecycle] Done."),
			"script must complete with Done. message",
		);
	});
});
