/**
 * Cubic Cleanup Service (P196)
 *
 * Handles cleanup of stale cubics:
 * 1. Expires cubics in the cubics table (status → 'expired')
 * 2. Archives cubic_state rows (lifecycle_status → 'ARCHIVED')
 * 3. Removes worktree directories (optional)
 * 4. Logs cleanup actions to audit_log
 *
 * Worktree paths follow: /data/code/worktree/<agent-identity>
 * or /data/code/.claude/cubics/<cubic-id>
 */

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { query } from "../../infra/postgres/pool.ts";
import { CubicIdleDetector, type IdleCubic } from "./cubic-idle-detector.ts";

export interface CleanupReport {
	timestamp: Date;
	total_stale: number;
	expired: number;
	worktrees_removed: number;
	errors: string[];
}

export class CubicCleanupService {
	private detector = new CubicIdleDetector();

	/**
	 * Full cleanup run: detect stale cubics → expire → archive → remove worktrees.
	 */
	async cleanupStaleCubics(options?: {
		removeWorktrees?: boolean;
		dryRun?: boolean;
	}): Promise<CleanupReport> {
		const removeWorktrees = options?.removeWorktrees ?? true;
		const dryRun = options?.dryRun ?? false;

		const staleCubics = await this.detector.detectStaleCubics();

		const report: CleanupReport = {
			timestamp: new Date(),
			total_stale: staleCubics.length,
			expired: 0,
			worktrees_removed: 0,
			errors: [],
		};

		for (const cubic of staleCubics) {
			try {
				if (!dryRun) {
					await this.expireCubic(cubic.cubic_id);
					report.expired++;

					if (removeWorktrees) {
						const removed = await this.removeWorktree(cubic.cubic_id);
						if (removed) report.worktrees_removed++;
					}
				}
			} catch (err) {
				report.errors.push(
					`Failed to cleanup ${cubic.cubic_id}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}

		return report;
	}

	/**
	 * Expire a single cubic: mark expired in cubics, ARCHIVED in cubic_state.
	 */
	async expireCubic(cubicId: string): Promise<void> {
		// Mark expired in main cubics table
		await query(
			`UPDATE roadmap.cubics
			 SET status = 'expired',
			     completed_at = COALESCE(completed_at, NOW())
			 WHERE cubic_id = $1
			   AND status NOT IN ('expired', 'complete')`,
			[cubicId],
		);

		// Mark ARCHIVED in cubic_state
		await this.detector.markArchived(cubicId);

		// Release any active leases for this cubic
		await query(
			`UPDATE roadmap.cubics
			 SET lock_holder = NULL,
			     lock_phase = NULL,
			     locked_at = NULL
			 WHERE cubic_id = $1`,
			[cubicId],
		);

		// Audit log — 'delete' is the closest valid action for expiry
		await query(
			`INSERT INTO roadmap.audit_log (entity_type, entity_id, action, changed_by)
			 VALUES ('cubic', $1, 'delete', 'cubic-cleanup-service')`,
			[cubicId],
		);
	}

	/**
	 * Remove worktree directory for a cubic.
	 * Checks multiple possible paths:
	 * - /data/code/worktree/<agent-identity> (from cubics.worktree_path)
	 * - /data/code/.claude/cubics/<cubic-id> (legacy)
	 */
	async removeWorktree(cubicId: string): Promise<boolean> {
		// Get worktree path from cubics table
		const { rows } = await query<{ worktree_path: string | null }>(
			`SELECT worktree_path FROM roadmap.cubics WHERE cubic_id = $1`,
			[cubicId],
		);

		const paths: string[] = [];

		if (rows[0]?.worktree_path) {
			paths.push(rows[0].worktree_path);
		}

		// Also check legacy path
		paths.push(`/data/code/.claude/cubics/${cubicId}`);

		let removed = false;
		for (const path of paths) {
			if (existsSync(path)) {
				try {
					await rm(path, { recursive: true, force: true });
					removed = true;
				} catch {
					// Non-fatal — directory may be in use or permissions issue
				}
			}
		}

		return removed;
	}

	/**
	 * Mark completed cubics in cubic_state.
	 * Syncs from cubics.status = 'complete'.
	 */
	async syncCompletedCubics(): Promise<number> {
		const { rows } = await query<{ cubic_id: string }>(
			`UPDATE roadmap.cubic_state cs
			 SET lifecycle_status = 'COMPLETED',
			     phase = 'COMPLETED'
			 FROM roadmap.cubics c
			 WHERE cs.cubic_id = c.cubic_id
			   AND c.status = 'complete'
			   AND cs.lifecycle_status NOT IN ('COMPLETED', 'ARCHIVED')
			 RETURNING cs.cubic_id`,
		);

		return rows.length;
	}

	/**
	 * Run the full idle detection → mark idle cycle.
	 */
	async markIdleCubics(): Promise<number> {
		const idleCubics = await this.detector.detectIdleCubics();

		for (const cubic of idleCubics) {
			await this.detector.markIdle(cubic.cubic_id);
		}

		return idleCubics.length;
	}

	/**
	 * Bulk-expire old cubics by age (regardless of cubic_state).
	 * Catches cubics that predate the cubic_state table.
	 */
	async expireOldCubics(olderThanMinutes = 60): Promise<number> {
		const { rows } = await query<{ cubic_id: string }>(
			`UPDATE roadmap.cubics
			 SET status = 'expired',
			     completed_at = COALESCE(completed_at, NOW())
			 WHERE status NOT IN ('expired', 'complete')
			   AND created_at < NOW() - ($1 || ' minutes')::interval
			 RETURNING cubic_id`,
			[olderThanMinutes.toString()],
		);

		// Sync cubic_state for expired cubics
		for (const row of rows) {
			await this.detector.markArchived(row.cubic_id);
		}

		return rows.length;
	}
}
