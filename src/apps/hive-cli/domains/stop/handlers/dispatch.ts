/**
 * Handler for `hive stop dispatch <id>`
 *
 * Soft-cancels a dispatch by marking it as cancelled in the DB.
 * Writes audit log row. Idempotent on retry.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface StopDispatchOptions {
  reason?: string;
  yes?: boolean;
}

export async function handleStopDispatch(
  id: string,
  options: StopDispatchOptions
): Promise<Record<string, unknown>> {
  if (!id) {
    throw Errors.usage("Missing required argument: dispatch_id");
  }

  const reason = options.reason || "Operator stop dispatch";
  const operator = process.env.HIVE_OPERATOR_NAME || "cli-operator";

  const pool = getPool();

  try {
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if dispatch exists
      const { rows: dispatchRows } = await client.query(
        `SELECT dispatch_id, dispatch_status FROM roadmap_dispatch.squad_dispatch WHERE dispatch_id = $1`,
        [id]
      );

      if (dispatchRows.length === 0) {
        throw Errors.notFound(`Dispatch ${id} not found`);
      }

      const dispatch = dispatchRows[0];

      // Update dispatch (soft-cancel)
      await client.query(
        `UPDATE roadmap_dispatch.squad_dispatch
         SET dispatch_status = 'cancelled',
             cancelled_by = $1,
             cancelled_at = now(),
             cancelled_reason = $2
         WHERE dispatch_id = $3`,
        [operator, reason, id]
      );

      // Write audit log
      const { rows: auditRows } = await client.query(
        `INSERT INTO roadmap.operator_audit_log
         (operator_name, action, decision, target_kind, target_identity, failure_reason, created_at)
         VALUES ($1, 'stop_dispatch', 'allow', 'dispatch', $2, $3, now())
         RETURNING id`,
        [operator, id, reason]
      );

      const auditLogId = auditRows[0]?.id;

      await client.query("COMMIT");

      return {
        dispatch_id: id,
        status: "cancelled",
        cancelled_by: operator,
        cancelled_at: new Date().toISOString(),
        cancelled_reason: reason,
        audit_log_id: auditLogId,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("not found")) {
        throw Errors.notFound(`Dispatch ${id} not found`);
      }
      throw Errors.remoteFailure(`Failed to stop dispatch: ${err.message}`, {
        dispatch_id: id,
        error: err.message,
      });
    }
    throw err;
  }
}
