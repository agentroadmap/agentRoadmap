/**
 * Handler for `hive dispatch show <id>`
 *
 * Shows full details of a dispatch.
 * Read-only; uses direct DB query.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface DispatchShowOptions {
  include?: string[];
}

export async function handleDispatchShow(
  id: string,
  options: DispatchShowOptions
): Promise<Record<string, unknown>> {
  if (!id) {
    throw Errors.usage("Missing required argument: dispatch_id");
  }

  const pool = getPool();

  try {
    const { rows: dispatchRows } = await pool.query(
      `SELECT
        d.dispatch_id,
        p.proposal_id,
        a.identity as agency_identity,
        d.dispatch_status as status,
        d.created_at,
        d.updated_at as last_activity_at,
        d.cancelled_by,
        d.cancelled_at,
        d.cancelled_reason
      FROM roadmap_dispatch.squad_dispatch d
      JOIN roadmap_proposal.proposal p ON d.proposal_id = p.proposal_id
      JOIN control_workforce.agency a ON d.agency_id = a.agency_id
      WHERE d.dispatch_id = $1`,
      [id]
    );

    if (dispatchRows.length === 0) {
      throw Errors.notFound(`Dispatch ${id} not found`);
    }

    const dispatch = dispatchRows[0];

    // Optionally expand relations
    if (options.include?.includes("offers")) {
      const { rows: offers } = await pool.query(
        `SELECT * FROM roadmap_dispatch.work_offer WHERE dispatch_id = $1`,
        [id]
      );
      dispatch.offers = offers;
    }

    return dispatch;
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) {
        throw Errors.notFound(`Dispatch ${id} not found`);
      }
      throw Errors.remoteFailure(`Failed to show dispatch: ${err.message}`, {
        dispatch_id: id,
        error: err.message,
      });
    }
    throw err;
  }
}
