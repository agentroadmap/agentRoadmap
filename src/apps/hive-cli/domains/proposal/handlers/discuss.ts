/**
 * Handler for `hive proposal discuss <proposal_id>`
 *
 * Posts a discussion message on a proposal.
 * Mutation; requires MCP per contract §6.
 */

import { messageTools, Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

export interface DiscussOptions {
  message?: string;
  stdin?: boolean;
  idempotencyKey?: string;
}

export async function handleDiscuss(
  projectId: number,
  proposalId: string,
  mcpClient: HiveMcpClient,
  options: DiscussOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }

  if (!options.message && !options.stdin) {
    throw Errors.usage(
      "Message required. Use --message or --stdin for input"
    );
  }

  let body = options.message || "";

  // TODO (Round 3): Handle --stdin for reading message from stdin
  if (options.stdin) {
    // body = readStdin();
  }

  try {
    return await messageTools.post(
      mcpClient,
      {
        proposal_id: proposalId,
        body,
      },
      {
        idempotencyKey: options.idempotencyKey,
        timeoutMs: 30000,
      }
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("MCP")) {
      throw Errors.mcpUnreachable("MCP server unreachable for discussion post");
    }
    throw err;
  }
}
