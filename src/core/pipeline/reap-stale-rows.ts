/**
 * P269: Stale-row reaper.
 *
 * Recovers orphans left behind by abrupt stops (SIGKILL, OOM, host reboot):
 *   - transition_queue rows stuck in 'processing'
 *   - proposal_lease rows past expires_at without released_at
 *   - squad_dispatch rows stuck in 'assigned'/'active' past assigned_at + 20m
 *
 * Idempotent — safe to run from multiple services concurrently at boot.
 */

import type { Pool } from "pg";

export interface ReaperLogger {
	log: (msg: string) => void;
	warn: (msg: string) => void;
}

export interface ReapResult {
	transitions: number;
	leases: number;
	dispatches: number;
}

const TRANSITION_STALE_MIN = 15;
const LEASE_STALE_MIN = 10;
const DISPATCH_STALE_MIN = 20;

export async function reapStaleRows(
	pool: Pool,
	logger: ReaperLogger,
	tag = "Reaper",
): Promise<ReapResult> {
	const result: ReapResult = { transitions: 0, leases: 0, dispatches: 0 };

	try {
		const r = await pool.query(
			`UPDATE roadmap.transition_queue
			 SET status='pending',
			     processing_at=NULL,
			     last_error=COALESCE(last_error,'') || ' [reaped: stale processing >${TRANSITION_STALE_MIN}m]'
			 WHERE status='processing'
			   AND processing_at IS NOT NULL
			   AND processing_at < now() - ($1 || ' min')::interval
			 RETURNING id`,
			[String(TRANSITION_STALE_MIN)],
		);
		result.transitions = r.rowCount ?? 0;
	} catch (err) {
		logger.warn(
			`[${tag}] transition_queue reap failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	try {
		const r = await pool.query(
			`UPDATE roadmap_proposal.proposal_lease
			 SET released_at=now(),
			     release_reason=COALESCE(release_reason,'') || ' [reaped: lease expired without release]'
			 WHERE released_at IS NULL
			   AND expires_at IS NOT NULL
			   AND expires_at < now() - ($1 || ' min')::interval
			 RETURNING id`,
			[String(LEASE_STALE_MIN)],
		);
		result.leases = r.rowCount ?? 0;
	} catch (err) {
		logger.warn(
			`[${tag}] proposal_lease reap failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	try {
		const r = await pool.query(
			`UPDATE roadmap_workforce.squad_dispatch
			 SET dispatch_status='cancelled',
			     completed_at=now(),
			     metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('reaped_at', to_jsonb(now()), 'reaped_reason', 'stale dispatch >${DISPATCH_STALE_MIN}m')
			 WHERE dispatch_status IN ('assigned','active')
			   AND assigned_at IS NOT NULL
			   AND assigned_at < now() - ($1 || ' min')::interval
			   AND completed_at IS NULL
			 RETURNING id`,
			[String(DISPATCH_STALE_MIN)],
		);
		result.dispatches = r.rowCount ?? 0;
	} catch (err) {
		logger.warn(
			`[${tag}] squad_dispatch reap failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	if (result.transitions || result.leases || result.dispatches) {
		logger.log(
			`[${tag}] reaped: ${result.transitions} transition(s), ${result.leases} lease(s), ${result.dispatches} dispatch(es)`,
		);
	} else {
		logger.log(`[${tag}] no stale rows`);
	}

	return result;
}
