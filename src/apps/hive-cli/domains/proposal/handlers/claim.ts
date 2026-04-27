/**
 * Handler for `hive proposal claim <proposal_id>`
 *
 * Claims a proposal (acquires a lease).
 * Mutation; requires MCP per contract §6.
 * Implements idempotency per contract §7.
 */

import { hiveTools, Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

export interface ClaimOptions {
  duration?: string;
  idempotencyKey?: string;
}

export async function handleClaim(
  projectId: number,
  proposalId: string,
  mcpClient: HiveMcpClient,
  options: ClaimOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }

  const claimArgs: Record<string, unknown> = {};

  if (options.duration) {
    claimArgs.duration = options.duration;
  }

  try {
    const result = await hiveTools.proposal.claim(
      mcpClient,
      proposalId,
      claimArgs,
      {
        idempotencyKey: options.idempotencyKey,
        timeoutMs: 30000,
      }
    );

    return result;
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("MCP")) {
        throw Errors.mcpUnreachable("MCP server unreachable for proposal claim");
      }
      if (err.message.includes("already") || err.message.includes("claimed")) {
        throw Errors.conflict(`Proposal ${proposalId} is already claimed`, {
          proposal_id: proposalId,
        });
      }
    }
    throw err;
  }
}
