/**
 * Handler for `hive proposal release <proposal_id>`
 *
 * Releases a proposal lease.
 * Destructive operation; requires --yes flag.
 * Mutation; requires MCP per contract §6.
 */

import { hiveTools, Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

export interface ReleaseOptions {
  reason?: string;
  yes?: boolean;
  idempotencyKey?: string;
}

export async function handleRelease(
  projectId: number,
  proposalId: string,
  mcpClient: HiveMcpClient,
  isTty: boolean,
  options: ReleaseOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }

  // Destructive operation requires --yes
  if (isTty && !options.yes) {
    throw Errors.conflict(
      "Release is a destructive operation. Use --yes to confirm.",
      {
        proposal_id: proposalId,
      }
    );
  }

  const releaseArgs: Record<string, unknown> = {};

  if (options.reason) {
    releaseArgs.reason = options.reason;
  }

  try {
    return await hiveTools.proposal.release(
      mcpClient,
      proposalId,
      releaseArgs,
      {
        idempotencyKey: options.idempotencyKey,
        timeoutMs: 30000,
      }
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("MCP")) {
      throw Errors.mcpUnreachable("MCP server unreachable for proposal release");
    }
    throw err;
  }
}
