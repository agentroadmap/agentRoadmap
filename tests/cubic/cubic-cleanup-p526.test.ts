import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import {
	type CubicCleanupFs,
	CubicCleanupService,
	checkCubicCreateBudget,
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

	test("reapOrphanCubics deletes clean active cubics with no active MCP slot as rule 1", async () => {
		const fakeFs = new FakeFs();
		const worktreePath = "/tmp/agenthive-p526/rule-1";
		fakeFs.existing.add(worktreePath);
		const mcpSlotChecks: unknown[][] = [];
		const deletes: string[] = [];
		const auditRules: unknown[] = [];
		const query: QueryRunner = async <T extends QueryResultRow>(
			sql: string,
			params?: unknown[],
		): Promise<QueryResult<T>> => {
			if (sql.includes("FROM roadmap.cubics c") && sql.includes("ORDER BY")) {
				return result([
					{
						cubic_id: "cubic-no-slot",
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
			if (sql.includes("endpoint_name = $1")) {
				mcpSlotChecks.push(params ?? []);
				return result([{ exists: false }] as unknown as T[]);
			}
			if (sql.includes("UPDATE roadmap_proposal.proposal_lease")) {
				return result([] as T[]);
			}
			if (sql.includes("DELETE FROM roadmap.cubics")) {
				deletes.push(String(params?.[0]));
				return result([] as T[]);
			}
			if (sql.includes("INSERT INTO roadmap.cubic_cleanup_audit")) {
				auditRules.push(params?.[2]);
				return result([] as T[]);
			}
			throw new Error(`Unexpected SQL: ${sql}`);
		};

		const service = new CubicCleanupService({
			query,
			fs: fakeFs,
			now: () => new Date("2026-05-01T12:10:00.000Z"),
		});

		const report = await service.reapOrphanCubics({ actor: "reaper-test" });

		assert.equal(report.deleted, 1);
		assert.equal(report.results[0].orphan_rule, 1);
		assert.equal(report.results[0].reason, "no_active_agent_slot");
		assert.deepEqual(mcpSlotChecks, [["cubic-no-slot:agent-one"]]);
		assert.deepEqual(fakeFs.worktreeRemoved, [worktreePath]);
		assert.deepEqual(deletes, ["cubic-no-slot"]);
		assert.deepEqual(auditRules, [1]);
	});

	test("reapOrphanCubics preserves dirty stale heartbeats with no active MCP reference as rule 2", async () => {
		const fakeFs = new FakeFs();
		const worktreePath = "/tmp/agenthive-p526/rule-2";
		fakeFs.existing.add(worktreePath);
		fakeFs.dirty.set(worktreePath, " M src/example.ts\n");
		const auditActions: string[] = [];
		const updates: string[] = [];
		const query: QueryRunner = async <T extends QueryResultRow>(
			sql: string,
			params?: unknown[],
		): Promise<QueryResult<T>> => {
			if (sql.includes("FROM roadmap.cubics c") && sql.includes("ORDER BY")) {
				return result([
					{
						cubic_id: "cubic-stale",
						status: "active",
						phase: "build",
						agent_identity: "agent-one",
						worktree_path: worktreePath,
						created_at: "2026-05-01T12:00:00.000Z",
						activated_at: "2026-05-01T12:00:00.000Z",
						completed_at: null,
						last_activity_at: "2026-05-01T12:00:00.000Z",
					},
				] as unknown as T[]);
			}
			if (sql.includes("metadata->>'current_cubic_id' = $1")) {
				assert.deepEqual(params, ["cubic-stale"]);
				return result([{ exists: false }] as unknown as T[]);
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
				if (params?.[1] === "PRESERVED") assert.equal(params?.[2], 2);
				return result([] as T[]);
			}
			throw new Error(`Unexpected SQL: ${sql}`);
		};

		const service = new CubicCleanupService({
			query,
			fs: fakeFs,
			orphansRoot: "/tmp/agenthive-p526/orphans",
			now: () => new Date("2026-05-01T12:31:00.000Z"),
		});

		const report = await service.reapOrphanCubics({ actor: "reaper-test" });

		assert.equal(report.preserved, 1);
		assert.equal(report.lease_releases, 1);
		assert.equal(report.results[0].orphan_rule, 2);
		assert.equal(report.results[0].reason, "stale_heartbeat_no_mcp_reference");
		assert.equal(fakeFs.moved.length, 1);
		assert.equal(fakeFs.moved[0].from, worktreePath);
		assert.deepEqual(auditActions, ["LEASE_RELEASED", "PRESERVED"]);
		assert.equal(updates.length, 1);
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

	test("checkCubicCreateBudget rejects over-quota hosts and allows after cleanup frees a slot", async () => {
		const activeCounts = [2, 1];
		const query: QueryRunner = async <T extends QueryResultRow>(
			sql: string,
			params?: unknown[],
		): Promise<QueryResult<T>> => {
			if (sql.includes("FROM roadmap.host_model_policy")) {
				assert.deepEqual(params, ["bot", 10]);
				return result([{ max_active: 2 }] as unknown as T[]);
			}
			if (sql.includes("FROM roadmap.cubics")) {
				assert.deepEqual(params, ["bot", "/tmp/agenthive-p526/%"]);
				return result([
					{ active_count: activeCounts.shift() ?? 0 },
				] as unknown as T[]);
			}
			throw new Error(`Unexpected SQL: ${sql}`);
		};

		const overQuota = await checkCubicCreateBudget({
			query,
			hostName: "bot",
			worktreeRoot: "/tmp/agenthive-p526",
		});
		const afterCleanup = await checkCubicCreateBudget({
			query,
			hostName: "bot",
			worktreeRoot: "/tmp/agenthive-p526",
		});

		assert.deepEqual(overQuota, {
			hostName: "bot",
			activeCount: 2,
			maxActive: 2,
			allowed: false,
		});
		assert.deepEqual(afterCleanup, {
			hostName: "bot",
			activeCount: 1,
			maxActive: 2,
			allowed: true,
		});
	});
});
