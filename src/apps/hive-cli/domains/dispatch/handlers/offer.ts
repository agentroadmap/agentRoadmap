/**
 * Handler for `hive dispatch offer <proposal_id>`
 *
 * Issues a new work offer for a proposal.
 * Mutation; ideally routed through MCP but stubbed here.
 * TODO: Integrate with MCP once mcp_ops.offer_work is available.
 */

import { Errors } from "../../../common/index";

export interface DispatchOfferOptions {
  squad?: string;
  role?: string;
  idempotencyKey?: string;
}

export async function handleDispatchOffer(
  proposalId: string,
  options: DispatchOfferOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }

  // STUB: This command requires MCP integration.
  // Per contract §6, mutations that touch dispatches should go through MCP.
  // For now, return a placeholder response indicating the gap.
  return {
    status: "stub",
    message: "dispatch offer command requires MCP tool integration (mcp_ops.offer_work)",
    proposal_id: proposalId,
    hint: "This is a placeholder. Implement in Round 3/4 once MCP offers the tool.",
  };
}
