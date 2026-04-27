/**
 * Handler for `hive proposal review <proposal_id>`
 *
 * Submits a review on a proposal.
 * Mutation; requires MCP per contract §6.
 */

import { Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

export interface ReviewOptions {
  status?: string;
  comment?: string;
  idempotencyKey?: string;
}

export async function handleReview(
  projectId: number,
  proposalId: string,
  mcpClient: HiveMcpClient,
  options: ReviewOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }

  // TODO (Round 3): Implement review submission in MCP tool wrapper
  // For now, stub
  return {
    proposal_id: proposalId,
    review_status: options.status || "commented",
    comment: options.comment,
  };
}
