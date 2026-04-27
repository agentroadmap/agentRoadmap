/**
 * Handler for `hive audit search`
 *
 * Searches operator audit log by action, actor, target, and time range.
 * Read-only; uses direct DB query.
 */

import { getPool } from "../../../../../infra/postgres/pool";
import { Errors } from "../../../common/index";

export interface AuditSearchOptions {
  action?: string;
  actor?: string;
  since?: string;
  until?: string;
  target?: string;
  limit?: string;
  cursor?: string;
}

/**
 * Parse relative time duration (e.g., "5m", "1h", "24h") to ISO timestamp.
 */
function parseRelativeTime(duration: string): string {
  const now = new Date();

  if (duration.endsWith("m")) {
    const minutes = parseInt(duration.slice(0, -1));
    now.setMinutes(now.getMinutes() - minutes);
    return now.toISOString();
  }

  if (duration.endsWith("h")) {
    const hours = parseInt(duration.slice(0, -1));
    now.setHours(now.getHours() - hours);
    return now.toISOString();
  }

  if (duration.endsWith("d")) {
    const days = parseInt(duration.slice(0, -1));
    now.setDate(now.getDate() - days);
    return now.toISOString();
  }

  // Assume ISO timestamp if doesn't match pattern
  return duration;
}

export async function handleAuditSearch(
  options: AuditSearchOptions
): Promise<Record<string, unknown>> {
  const pool = getPool();
  const limit = Math.min(parseInt(options.limit || "50"), 100);

  try {
    let query = `
      SELECT
        operator_name,
        action,
        decision,
        target_kind,
        target_identity,
        failure_reason,
        created_at
      FROM control_plane.operator_audit_log
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (options.action) {
      query += ` AND action = $${paramIndex}`;
      params.push(options.action);
      paramIndex++;
    }

    if (options.actor) {
      query += ` AND operator_name = $${paramIndex}`;
      params.push(options.actor);
      paramIndex++;
    }

    if (options.since) {
      const sinceTime = parseRelativeTime(options.since);
      query += ` AND created_at >= $${paramIndex}`;
      params.push(sinceTime);
      paramIndex++;
    }

    if (options.until) {
      const untilTime = parseRelativeTime(options.until);
      query += ` AND created_at <= $${paramIndex}`;
      params.push(untilTime);
      paramIndex++;
    }

    if (options.target) {
      // Search both target_kind and target_identity
      query += ` AND (target_kind = $${paramIndex} OR target_identity = $${paramIndex})`;
      params.push(options.target);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1); // +1 to detect if there are more pages

    const result = await pool.query(query, params);

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify({
            lastTimestamp: rows[rows.length - 1]?.created_at,
            lastOperator: rows[rows.length - 1]?.operator_name,
          })
        ).toString("base64")
      : null;

    return {
      entries: rows,
      count: rows.length,
      next_cursor: nextCursor,
    };
  } catch (err) {
    if (err instanceof Error) {
      throw Errors.remoteFailure(`Failed to search audit log: ${err.message}`, {
        error: err.message,
      });
    }
    throw err;
  }
}
