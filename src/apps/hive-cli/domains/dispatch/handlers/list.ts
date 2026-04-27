/**
 * Handler for `hive dispatch list`
 *
 * Lists all dispatches with optional filtering by status, proposal, etc.
 * Read-only; uses direct DB query.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface DispatchListOptions {
  status?: string;
  proposal?: string;
  limit?: string;
  cursor?: string;
}

export async function handleDispatchList(
  options: DispatchListOptions
): Promise<Record<string, unknown>> {
  const pool = getPool();
  const limit = Math.min(parseInt(options.limit || "20"), 100);

  try {
    let query = `
      SELECT
        d.dispatch_id,
        p.proposal_id,
        a.identity as agency_identity,
        d.dispatch_status as status,
        d.created_at,
        d.updated_at as last_activity_at
      FROM roadmap_dispatch.squad_dispatch d
      JOIN roadmap_proposal.proposal p ON d.proposal_id = p.proposal_id
      JOIN control_workforce.agency a ON d.agency_id = a.agency_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (options.status) {
      query += ` AND d.dispatch_status = $${paramIndex}`;
      params.push(options.status);
      paramIndex++;
    }

    if (options.proposal) {
      query += ` AND p.proposal_id = $${paramIndex}`;
      params.push(options.proposal);
      paramIndex++;
    }

    query += ` ORDER BY d.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1); // +1 to detect if there are more pages

    const result = await pool.query(query, params);

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ lastId: rows[rows.length - 1].dispatch_id })).toString("base64")
      : null;

    return {
      dispatches: rows,
      next_cursor: nextCursor,
    };
  } catch (err) {
    if (err instanceof Error) {
      throw Errors.remoteFailure(`Failed to list dispatches: ${err.message}`, {
        error: err.message,
      });
    }
    throw err;
  }
}
