/**
 * Handler for `hive stop route <id>`
 *
 * Disables a model route (is_enabled = false) to prevent new spawns.
 * Writes audit log row. Idempotent on retry.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface StopRouteOptions {
  reason?: string;
  yes?: boolean;
}

export async function handleStopRoute(
  id: string,
  options: StopRouteOptions
): Promise<Record<string, unknown>> {
  if (!id) {
    throw Errors.usage("Missing required argument: route_id");
  }

  const reason = options.reason || "Operator disable route";
  const operator = process.env.HIVE_OPERATOR_NAME || "cli-operator";

  const pool = getPool();

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if route exists
      const { rows: routeRows } = await client.query(
        `SELECT route_id, is_enabled FROM control_models.model_route
         WHERE route_id = $1`,
        [id]
      );

      if (routeRows.length === 0) {
        throw Errors.notFound(`Route ${id} not found`);
      }

      // Disable route
      await client.query(
        `UPDATE control_models.model_route
         SET is_enabled = false
         WHERE route_id = $1`,
        [id]
      );

      // Write audit log
      const { rows: auditRows } = await client.query(
        `INSERT INTO roadmap.operator_audit_log
         (operator_name, action, decision, target_kind, target_identity, failure_reason, created_at)
         VALUES ($1, 'stop_route', 'allow', 'route', $2, $3, now())
         RETURNING id`,
        [operator, id, reason]
      );

      const auditLogId = auditRows[0]?.id;

      await client.query("COMMIT");

      return {
        route_id: id,
        is_enabled: false,
        disabled_at: new Date().toISOString(),
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
        throw Errors.notFound(`Route ${id} not found`);
      }
      throw Errors.remoteFailure(`Failed to stop route: ${err.message}`, {
        route_id: id,
        error: err.message,
      });
    }
    throw err;
  }
}
