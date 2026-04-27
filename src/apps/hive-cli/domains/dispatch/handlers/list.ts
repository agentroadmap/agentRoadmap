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
    // Real schema: roadmap_workforce.squad_dispatch keyed on `id` (bigint).
    // No agency FK — agency association lives on `agent_registry`. Join
    // through agent_identity for the agent display name; squad_dispatch
    // also stores `agent_identity` directly so the join is optional.
    let query = `
      SELECT
        d.id::text AS dispatch_id,
        d.proposal_id::text AS proposal_id,
        d.agent_identity,
        d.squad_name,
        d.dispatch_role,
        d.dispatch_status AS status,
        d.offer_status,
        d.assigned_at AS created_at,
        COALESCE(d.last_renewed_at, d.assigned_at) AS last_activity_at
      FROM roadmap_workforce.squad_dispatch d
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
      query += ` AND d.proposal_id = $${paramIndex}::bigint`;
      params.push(options.proposal);
      paramIndex++;
    }

    query += ` ORDER BY d.assigned_at DESC LIMIT $${paramIndex}`;
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
