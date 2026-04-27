/**
 * Handler for `hive proposal next`
 *
 * Returns the highest-priority claimable proposal (or top-5 ranked list if no agent specified).
 * Read-only; may fall back to DB if MCP unreachable.
 */

import { getControlPlaneClient, Errors } from "../../../common/index";

export interface NextOptions {
  agent?: string;
  limit?: number;
}

export async function handleNext(
  projectId: number,
  options: NextOptions
): Promise<Record<string, unknown>> {
  const client = getControlPlaneClient();

  // TODO (Round 3): Implement proposal prioritization and filtering by agent capability.
  // For now, list proposals and return top items.
  const result = await client.listProposals(projectId, {
    limit: options.limit || 5,
  });

  if (result.items.length === 0) {
    return {
      proposals: [],
      message: "No claimable proposals found",
    };
  }

  if (options.agent) {
    // Single proposal matching agent capability
    return {
      proposal_id: result.items[0].display_id,
      proposal: result.items[0],
      agency_id: options.agent,
    };
  } else {
    // Top-5 ranked list
    return {
      proposals: result.items.map((p) => ({
        proposal_id: p.display_id,
        title: p.title,
        priority: p.priority,
        maturity: p.maturity,
      })),
    };
  }
}
