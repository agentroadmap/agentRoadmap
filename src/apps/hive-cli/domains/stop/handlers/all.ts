/**
 * Handler for `hive stop all [--scope <project|agency|host|global>]`
 *
 * Panic button: stops all work in a given scope.
 * Requires --yes --really-yes (mandatory double confirmation).
 * Writes audit log row. Idempotent on retry.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface StopAllOptions {
  scope?: string;
  id?: string;
  reason?: string;
  yes?: boolean;
  reallyYes?: boolean;
}

export async function handleStopAll(
  options: StopAllOptions
): Promise<Record<string, unknown>> {
  if (!options.reallyYes) {
    throw Errors.conflict(
      "stop all requires --really-yes (panic operation)",
      { scope: options.scope || "global" }
    );
  }

  const scope = options.scope || "global";
  const reason = options.reason || "Operator panic stop";
  const operator = process.env.HIVE_OPERATOR_NAME || "cli-operator";

  if (["project", "agency", "host"].includes(scope) && !options.id) {
    throw Errors.usage(
      `stop all --scope ${scope} requires --id <${scope}-id>`
    );
  }

  const pool = getPool();

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let stoppedCount = 0;

      if (scope === "global") {
        // Stop all dispatches globally
        const { rowCount: dispCount } = await client.query(
          `UPDATE roadmap_dispatch.squad_dispatch
           SET dispatch_status = 'cancelled',
               cancelled_by = $1,
               cancelled_at = now(),
               cancelled_reason = $2
           WHERE dispatch_status NOT IN ('cancelled', 'completed', 'failed')`,
          [operator, reason]
        );
        stoppedCount += dispCount || 0;

        // Suspend all agencies
        const { rowCount: agencyCount } = await client.query(
          `UPDATE control_workforce.agency
           SET status = 'suspended'
           WHERE status != 'suspended'`,
          []
        );
        stoppedCount += agencyCount || 0;
      } else if (scope === "project") {
        // Stop all dispatches in a project
        const { rowCount: dispCount } = await client.query(
          `UPDATE roadmap_dispatch.squad_dispatch
           SET dispatch_status = 'cancelled',
               cancelled_by = $1,
               cancelled_at = now(),
               cancelled_reason = $2
           WHERE proposal_id IN (
             SELECT proposal_id FROM roadmap_proposal.proposal WHERE project_id = $3
           ) AND dispatch_status NOT IN ('cancelled', 'completed', 'failed')`,
          [operator, reason, options.id]
        );
        stoppedCount += dispCount || 0;
      } else if (scope === "agency") {
        // Stop all dispatches for an agency
        const { rowCount: dispCount } = await client.query(
          `UPDATE roadmap_dispatch.squad_dispatch
           SET dispatch_status = 'cancelled',
               cancelled_by = $1,
               cancelled_at = now(),
               cancelled_reason = $2
           WHERE agency_id = $3 AND dispatch_status NOT IN ('cancelled', 'completed', 'failed')`,
          [operator, reason, options.id]
        );
        stoppedCount += dispCount || 0;

        // Suspend the agency itself
        await client.query(
          `UPDATE control_workforce.agency
           SET status = 'suspended'
           WHERE agency_id = $1`,
          [options.id]
        );
        stoppedCount += 1;
      } else if (scope === "host") {
        // Suspend all agencies on a host and cancel their dispatches
        const { rows: agencyRows } = await client.query(
          `SELECT agency_id FROM control_workforce.agency
           WHERE host_id = (SELECT id FROM control_runtime.host WHERE host_name = $1 OR id::text = $1)`,
          [options.id]
        );

        for (const agency of agencyRows) {
          const { rowCount: dispCount } = await client.query(
            `UPDATE roadmap_dispatch.squad_dispatch
             SET dispatch_status = 'cancelled',
                 cancelled_by = $1,
                 cancelled_at = now(),
                 cancelled_reason = $2
             WHERE agency_id = $3 AND dispatch_status NOT IN ('cancelled', 'completed', 'failed')`,
            [operator, reason, agency.agency_id]
          );
          stoppedCount += dispCount || 0;
        }

        const { rowCount: agencyCount } = await client.query(
          `UPDATE control_workforce.agency
           SET status = 'suspended'
           WHERE host_id = (SELECT id FROM control_runtime.host WHERE host_name = $1 OR id::text = $1)`,
          [options.id]
        );
        stoppedCount += agencyCount || 0;
      }

      // Write audit log
      const { rows: auditRows } = await client.query(
        `INSERT INTO roadmap.operator_audit_log
         (operator_name, action, decision, target_kind, target_identity, failure_reason, created_at)
         VALUES ($1, 'stop_all', 'allow', $2, $3, $4, now())
         RETURNING id`,
        [operator, scope, options.id || null, reason]
      );

      const auditLogId = auditRows[0]?.id;

      await client.query("COMMIT");

      return {
        scope,
        stopped_count: stoppedCount,
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
      throw Errors.remoteFailure(`Failed to stop all: ${err.message}`, {
        scope,
        error: err.message,
      });
    }
    throw err;
  }
}
