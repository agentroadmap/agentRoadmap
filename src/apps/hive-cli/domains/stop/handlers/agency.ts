/**
 * Handler for `hive stop agency <id>`
 *
 * Suspends an agency (blocks new claims but doesn't kill active workers).
 * Writes audit log row. Idempotent on retry.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface StopAgencyOptions {
  reason?: string;
  yes?: boolean;
}

export async function handleStopAgency(
  id: string,
  options: StopAgencyOptions
): Promise<Record<string, unknown>> {
  if (!id) {
    throw Errors.usage("Missing required argument: agency_id");
  }

  const reason = options.reason || "Operator suspend agency";
  const operator = process.env.HIVE_OPERATOR_NAME || "cli-operator";

  const pool = getPool();

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Check if agency exists
      const { rows: agencyRows } = await client.query(
        `SELECT agency_id, status FROM control_workforce.agency
         WHERE agency_id = $1 OR identity = $1`,
        [id]
      );

      if (agencyRows.length === 0) {
        throw Errors.notFound(`Agency ${id} not found`);
      }

      const agency = agencyRows[0];
      const agencyId = agency.agency_id;

      // Update agency status to suspended
      await client.query(
        `UPDATE control_workforce.agency
         SET status = 'suspended'
         WHERE agency_id = $1`,
        [agencyId]
      );

      // Write audit log
      const { rows: auditRows } = await client.query(
        `INSERT INTO roadmap.operator_audit_log
         (operator_name, action, decision, target_kind, target_identity, failure_reason, created_at)
         VALUES ($1, 'stop_agency', 'allow', 'agency', $2, $3, now())
         RETURNING id`,
        [operator, id, reason]
      );

      const auditLogId = auditRows[0]?.id;

      await client.query("COMMIT");

      return {
        agency_id: agencyId,
        status: "suspended",
        suspended_at: new Date().toISOString(),
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
        throw Errors.notFound(`Agency ${id} not found`);
      }
      throw Errors.remoteFailure(`Failed to stop agency: ${err.message}`, {
        agency_id: id,
        error: err.message,
      });
    }
    throw err;
  }
}
