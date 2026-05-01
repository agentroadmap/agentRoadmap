import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import {
	type CubicCleanupFs,
	CubicCleanupService,
	type QueryRunner,
} from "../../src/core/orchestration/cubic-cleanup.ts";

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
	return {
		rows,
		rowCount: rows.length,
		command: "SELECT",
		oid: 0,
		fields: [],
	};
}

class FakeFs implements CubicCleanupFs {
	existing = new Set<string>();
	dirty = new Map<string, string>();
	removed: string[] = [];
	moved: Array<{ from: string; to: string }> = [];
	worktreeRemoved: string[] = [];
	mkdirs: string[] = [];

	async exists(path: string): Promise<boolean> {
		return this.existing.has(path);
	}

	async remove(path: string): Promise<void> {
		this.removed.push(path);
		this.existing.delete(path);
	}

	async mkdir(path: string): Promise<void> {
		this.mkdirs.push(path);
	}

	async move(from: string, to: string): Promise<void> {
		this.moved.push({ from, to });
		this.existing.delete(from);
		this.existing.add(to);
	}

	async gitStatus(path: string): Promise<string> {
		return this.dirty.get(path) ?? "";
	}

	async gitWorktreeRemove(path: string): Promise<void> {
		this.worktreeRemoved.push(path);
		this.existing.delete(path);
	}
}

describe("P526 cubic cleanup automation", () => {
	test("detectOrphanCubics classifies active registry rows with missing worktrees as rule 4", async () => {
		const fakeFs = new FakeFs();
		const queries: string[] = [];
		const query: QueryRunner = async <T extends QueryResultRow>(
			sql: string,
		): Promise<QueryResult<T>> => {
			queries.push(sql);
			return result([
				{
					cubic_id: "cubic-missing",
					status: "active",
					phase: "build",
					agent_identity: "agent-one",
					worktree_path: "/tmp/agenthive-p526/missing",
					created_at: "2026-05-01T12:00:00.000Z",
					activated_at: "2026-05-01T12:00:00.000Z",
					completed_at: null,
					last_activity_at: "2026-05-01T12:01:00.000Z",
				},
			] as unknown as T[]);
		};

		const service = new CubicCleanupService({
			query,
			fs: fakeFs,
			now: () => new Date("2026-05-01T12:10:00.000Z"),
		});

		const orphans = await service.detectOrphanCubics();

		assert.equal(orphans.length, 1);
		assert.equal(orphans[0].orphan_rule, 4);
		assert.equal(orphans[0].reason, "active_registry_missing_worktree");
		assert.ok(queries[0].includes("FROM roadmap.cubics"));
	});

	test("forceReapCubic preserves dirty worktrees and writes audit evidence", async () => {
		const fakeFs = new FakeFs();
		const worktreePath = "/tmp/agenthive-p526/dirty";
		fakeFs.existing.add(worktreePath);
		fakeFs.dirty.set(worktreePath, "?? scratch.txt\n");

		const auditActions: string[] = [];
		const updates: string[] = [];
		const query: QueryRunner = async <T extends QueryResultRow>(
			sql: string,
			params?: unknown[],
		): Promise<QueryResult<T>> => {
			if (
				sql.includes("FROM roadmap.cubics c") &&
				sql.includes("WHERE c.cubic_id = $1")
			) {
				return result([
					{
						cubic_id: "cubic-dirty",
						status: "active",
						phase: "build",
						agent_identity: "agent-one",
						worktree_path: worktreePath,
						created_at: "2026-05-01T12:00:00.000Z",
						activated_at: "2026-05-01T12:00:00.000Z",
						completed_at: null,
						last_activity_at: "2026-05-01T12:01:00.000Z",
					},
				] as unknown as T[]);
			}
			if (sql.includes("UPDATE roadmap_proposal.proposal_lease")) {
				return result([{ proposal_id: 527 }] as unknown as T[]);
			}
			if (sql.includes("UPDATE roadmap.cubics")) {
				updates.push(sql);
				return result([] as T[]);
			}
			if (sql.includes("INSERT INTO roadmap.cubic_cleanup_audit")) {
				auditActions.push(String(params?.[1]));
				return result([] as T[]);
			}
			throw new Error(`Unexpected SQL: ${sql}`);
		};

		const service = new CubicCleanupService({
			query,
			fs: fakeFs,
			orphansRoot: "/tmp/agenthive-p526/orphans",
			now: () => new Date("2026-05-01T12:40:00.000Z"),
		});

		const reap = await service.forceReapCubic({
			cubicId: "cubic-dirty",
			reason: "operator requested cleanup",
			actor: "operator-test",
		});

		assert.equal(reap.action, "PRESERVED");
		assert.equal(reap.dirty, true);
		assert.equal(reap.lease_release_count, 1);
		assert.equal(fakeFs.moved.length, 1);
		assert.equal(fakeFs.moved[0].from, worktreePath);
		assert.ok(
			fakeFs.moved[0].to.startsWith("/tmp/agenthive-p526/orphans/cubic-dirty-"),
		);
		assert.deepEqual(auditActions, ["LEASE_RELEASED", "FORCE_REAP"]);
		assert.equal(updates.length, 1);
	});

	test("reapOrphanCubics deletes clean closed-registry worktrees after rule 3 classification", async () => {
		const fakeFs = new FakeFs();
		const worktreePath = "/tmp/agenthive-p526/clean";
		fakeFs.existing.add(worktreePath);

		const deletes: string[] = [];
		const auditActions: string[] = [];
		const query: QueryRunner = async <T extends QueryResultRow>(
			sql: string,
			params?: unknown[],
		): Promise<QueryResult<T>> => {
			if (sql.includes("FROM roadmap.cubics c") && sql.includes("ORDER BY")) {
				return result([
					{
						cubic_id: "cubic-clean",
						status: "completed",
						phase: "ship",
						agent_identity: "agent-one",
						worktree_path: worktreePath,
						created_at: "2026-05-01T12:00:00.000Z",
						activated_at: "2026-05-01T12:00:00.000Z",
						completed_at: "2026-05-01T12:10:00.000Z",
						last_activity_at: "2026-05-01T12:10:00.000Z",
					},
				] as unknown as T[]);
			}
			if (sql.includes("UPDATE roadmap_proposal.proposal_lease")) {
				return result([] as T[]);
			}
			if (sql.includes("DELETE FROM roadmap.cubics")) {
				deletes.push(String(params?.[0]));
				return result([] as T[]);
			}
			if (sql.includes("INSERT INTO roadmap.cubic_cleanup_audit")) {
				auditActions.push(String(params?.[1]));
				return result([] as T[]);
			}
			throw new Error(`Unexpected SQL: ${sql}`);
		};

		const service = new CubicCleanupService({
			query,
			fs: fakeFs,
			now: () => new Date("2026-05-01T12:20:00.000Z"),
		});

		const report = await service.reapOrphanCubics({ actor: "reaper-test" });

		assert.equal(report.total_orphans, 1);
		assert.equal(report.deleted, 1);
		assert.equal(report.results[0].orphan_rule, 3);
		assert.deepEqual(fakeFs.worktreeRemoved, [worktreePath]);
		assert.deepEqual(deletes, ["cubic-clean"]);
		assert.deepEqual(auditActions, ["DELETED"]);
	});
});
