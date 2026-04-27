/**
 * Handler for `hive stop worker <agent_identity>`
 *
 * Soft-cancels all running runs for an agent.
 * Writes audit log row. Idempotent on retry.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface StopWorkerOptions {
  reason?: string;
  yes?: boolean;
}

export async function handleStopWorker(
  agentIdentity: string,
  options: StopWorkerOptions
): Promise<Record<string, unknown>> {
  if (!agentIdentity) {
    throw Errors.usage("Missing required argument: agent_identity");
  }

  const reason = options.reason || "Operator stop worker";
  const operator = process.env.HIVE_OPERATOR_NAME || "cli-operator";

  const pool = getPool();

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Find agent by identity
      const { rows: agentRows } = await client.query(
        `SELECT agent_id FROM control_workforce.agent WHERE identity = $1`,
        [agentIdentity]
      );

      if (agentRows.length === 0) {
        throw Errors.notFound(`Agent ${agentIdentity} not found`);
      }

      const agentId = agentRows[0].agent_id;

      // Cancel all active runs for this agent
      const { rowCount } = await client.query(
        `UPDATE roadmap_workforce.agent_runs
         SET cancelled_by = $1,
             cancelled_at = now(),
             cancelled_reason = $2
         WHERE agent_id = $3 AND status IN ('running', 'pending')`,
        [operator, reason, agentId]
      );

      const cancelledCount = rowCount || 0;

      // Write audit log
      const { rows: auditRows } = await client.query(
        `INSERT INTO roadmap.operator_audit_log
         (operator_name, action, decision, target_kind, target_identity, failure_reason, created_at)
         VALUES ($1, 'stop_worker', 'allow', 'worker', $2, $3, now())
         RETURNING id`,
        [operator, agentIdentity, reason]
      );

      const auditLogId = auditRows[0]?.id;

      await client.query("COMMIT");

      return {
        agent_identity: agentIdentity,
        cancelled_runs: cancelledCount,
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
        throw Errors.notFound(`Agent ${agentIdentity} not found`);
      }
      throw Errors.remoteFailure(`Failed to stop worker: ${err.message}`, {
        agent_identity: agentIdentity,
        error: err.message,
      });
    }
    throw err;
  }
}
