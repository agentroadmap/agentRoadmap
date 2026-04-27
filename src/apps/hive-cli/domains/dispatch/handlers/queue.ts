/**
 * Handler for `hive dispatch queue`
 *
 * Shows proposals awaiting dispatch (work queue).
 * Read-only; uses direct DB query.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface DispatchQueueOptions {
  limit?: string;
}

export async function handleDispatchQueue(
  options: DispatchQueueOptions
): Promise<Record<string, unknown>> {
  const pool = getPool();
  const limit = Math.min(parseInt(options.limit || "20"), 100);

  try {
    const { rows } = await pool.query(
      `SELECT
        p.proposal_id,
        p.display_id,
        p.title,
        p.state,
        p.maturity,
        p.created_at,
        (SELECT COUNT(*) FROM roadmap_dispatch.squad_dispatch sd
         WHERE sd.proposal_id = p.proposal_id AND sd.dispatch_status != 'cancelled'
        ) as active_dispatches
      FROM roadmap_proposal.proposal p
      WHERE p.state = 'develop'
        AND p.gate_scanner_paused = false
        AND NOT EXISTS (
          SELECT 1 FROM roadmap_dispatch.squad_dispatch sd
          WHERE sd.proposal_id = p.proposal_id
            AND sd.dispatch_status IN ('active', 'assigned')
        )
      ORDER BY p.created_at ASC
      LIMIT $1`,
      [limit]
    );

    return {
      proposals: rows,
      count: rows.length,
    };
  } catch (err) {
    if (err instanceof Error) {
      throw Errors.remoteFailure(`Failed to query work queue: ${err.message}`, {
        error: err.message,
      });
    }
    throw err;
  }
}
