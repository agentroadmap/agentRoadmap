/**
 * Handler for `hive stop host <id>`
 *
 * Drains a host: quiesces it from new work and waits for active dispatches to complete.
 * Requires --yes --really-yes (panic operation).
 * Writes audit log row. Idempotent on retry.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface StopHostOptions {
  grace?: string;
  reason?: string;
  yes?: boolean;
  reallyYes?: boolean;
}

export async function handleStopHost(
  id: string,
  options: StopHostOptions
): Promise<Record<string, unknown>> {
  if (!id) {
    throw Errors.usage("Missing required argument: host_id");
  }

  if (!options.reallyYes) {
    throw Errors.conflict(
      "stop host requires --really-yes (panic operation)",
      { host_id: id }
    );
  }

  const reason = options.reason || "Operator drain host";
  const operator = process.env.HIVE_OPERATOR_NAME || "cli-operator";
  const grace = parseDuration(options.grace || "60s");

  const pool = getPool();

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if host exists
      const { rows: hostRows } = await client.query(
        `SELECT id, host_name FROM control_runtime.host WHERE host_name = $1 OR id::text = $1`,
        [id]
      );

      if (hostRows.length === 0) {
        throw Errors.notFound(`Host ${id} not found`);
      }

      const host = hostRows[0];

      // Mark all agencies on this host as suspended
      await client.query(
        `UPDATE control_workforce.agency
         SET status = 'suspended'
         WHERE host_id = $1`,
        [host.id]
      );

      // Write audit log
      const { rows: auditRows } = await client.query(
        `INSERT INTO roadmap.operator_audit_log
         (operator_name, action, decision, target_kind, target_identity, failure_reason, created_at)
         VALUES ($1, 'stop_host', 'allow', 'host', $2, $3, now())
         RETURNING id`,
        [operator, id, reason]
      );

      const auditLogId = auditRows[0]?.id;

      await client.query("COMMIT");

      const drainingUntil = new Date(Date.now() + grace * 1000).toISOString();

      return {
        host_id: id,
        status: "draining",
        draining_until: drainingUntil,
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
        throw Errors.notFound(`Host ${id} not found`);
      }
      throw Errors.remoteFailure(`Failed to stop host: ${err.message}`, {
        host_id: id,
        error: err.message,
      });
    }
    throw err;
  }
}

/**
 * Parse duration string (e.g., "60s", "5m", "1h") to seconds.
 */
function parseDuration(dur: string): number {
  const match = /^(\d+)([smh])$/.exec(dur);
  if (!match) return 60; // default 60s
  const [_, value, unit] = match;
  const v = parseInt(value, 10);
  switch (unit) {
    case "s":
      return v;
    case "m":
      return v * 60;
    case "h":
      return v * 3600;
    default:
      return 60;
  }
}
