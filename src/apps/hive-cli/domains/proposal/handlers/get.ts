/**
 * Handler for `hive proposal get <proposal_id>`
 *
 * Fetches a single proposal by ID with optional relations expansion.
 * Implements cli-hive-contract.md §1 (proposal domain, get action).
 */

import { getControlPlaneClient, Errors, type CliContext } from "../../../common/index";

export interface GetOptions {
  include?: string | string[];
  format?: string;
}

export async function handleGet(
  projectId: number,
  proposalId: string,
  options: GetOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }

  const client = getControlPlaneClient();

  // Fetch the base proposal
  const proposal = await client.getProposal(projectId, proposalId);
  if (!proposal) {
    throw Errors.notFound(`Proposal ${proposalId} not found in project ${projectId}`, {
      proposal_id: proposalId,
      project_id: projectId,
    });
  }

  const result: Record<string, unknown> = {
    proposal,
  };

  // Parse include flags
  const includeSet = new Set<string>();
  if (options.include) {
    const includes = Array.isArray(options.include) ? options.include : [options.include];
    includes.forEach((inc) => {
      if (inc === "all") {
        includeSet.add("leases");
        includeSet.add("dispatches");
        includeSet.add("ac");
        includeSet.add("dependencies");
        includeSet.add("discussions");
        includeSet.add("gate_status");
      } else {
        includeSet.add(inc);
      }
    });
  }

  // TODO (Round 3): Implement relation fetching once control-plane-client has
  // methods for leases, dispatches, AC, dependencies, discussions, gate_status.
  // For now, stub with empty arrays.

  if (includeSet.has("leases")) {
    result.leases = [];
  }

  if (includeSet.has("dispatches")) {
    result.dispatches = [];
  }

  if (includeSet.has("ac")) {
    result.ac = [];
  }

  if (includeSet.has("dependencies")) {
    result.dependencies = [];
  }

  if (includeSet.has("discussions")) {
    result.discussions = [];
  }

  if (includeSet.has("gate_status")) {
    result.gate_status = {
      current_state: proposal.status,
      next_legal_states: [],
      blockers: [],
    };
  }

  return result;
}
