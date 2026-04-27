/**
 * Handler for `hive stop proposal <display_id>`
 *
 * Pauses the gate scanner for a proposal by setting gate_scanner_paused = true.
 * Writes audit log row. Idempotent on retry.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface StopProposalOptions {
  reason?: string;
  yes?: boolean;
}

export async function handleStopProposal(
  displayId: string,
  options: StopProposalOptions
): Promise<Record<string, unknown>> {
  if (!displayId) {
    throw Errors.usage("Missing required argument: proposal_id (display_id)");
  }

  const reason = options.reason || "Operator pause gate scanner";
  const operator = process.env.HIVE_OPERATOR_NAME || "cli-operator";

  const pool = getPool();

  try {
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Resolve display_id to proposal_id
      const { rows: propRows } = await client.query(
        `SELECT proposal_id FROM roadmap_proposal.proposal
         WHERE display_id = $1 OR proposal_id = $1`,
        [displayId]
      );

      if (propRows.length === 0) {
        throw Errors.notFound(`Proposal ${displayId} not found`);
      }

      const proposalId = propRows[0].proposal_id;

      // Update proposal to pause gate scanner
      await client.query(
        `UPDATE roadmap_proposal.proposal
         SET gate_scanner_paused = true,
             gate_paused_by = $1,
             gate_paused_at = now(),
             gate_paused_reason = $2
         WHERE proposal_id = $3`,
        [operator, reason, proposalId]
      );

      // Write audit log
      const { rows: auditRows } = await client.query(
        `INSERT INTO roadmap.operator_audit_log
         (operator_name, action, decision, target_kind, target_identity, failure_reason, created_at)
         VALUES ($1, 'stop_proposal', 'allow', 'proposal', $2, $3, now())
         RETURNING id`,
        [operator, displayId, reason]
      );

      const auditLogId = auditRows[0]?.id;

      await client.query("COMMIT");

      return {
        proposal_id: proposalId,
        display_id: displayId,
        gate_scanner_paused: true,
        gate_paused_by: operator,
        gate_paused_at: new Date().toISOString(),
        gate_paused_reason: reason,
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
        throw Errors.notFound(`Proposal ${displayId} not found`);
      }
      throw Errors.remoteFailure(`Failed to stop proposal: ${err.message}`, {
        proposal_id: displayId,
        error: err.message,
      });
    }
    throw err;
  }
}
