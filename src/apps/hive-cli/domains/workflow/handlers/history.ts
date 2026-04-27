/**
 * Handler for `hive workflow history <proposal_id>`
 *
 * Shows state transition history for a proposal.
 * Read-only; uses control-plane DB.
 */

import { getControlPlaneClient, Errors } from "../../../common/index";

export interface HistoryOptions {
  limit?: number;
}

export async function handleHistory(
  projectId: number,
  proposalId: string,
  options: HistoryOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }

  const client = getControlPlaneClient();

  // TODO (Round 3): Implement history fetching in control-plane-client
  // For now, stub response
  return {
    proposal_id: proposalId,
    entries: [],
  };
}
