/**
 * Handler for `hive proposal list`
 *
 * Lists proposals with optional filtering and pagination.
 * Implements cli-hive-contract.md §1 (proposal domain, list action).
 */

import {
  getControlPlaneClient,
  Errors,
  type PaginatedResult,
  type ProposalRow,
} from "../../../common/index";

export interface ListOptions {
  status?: string;
  limit?: string | number;
  cursor?: string;
  format?: string;
}

export async function handleList(
  projectId: number,
  options: ListOptions
): Promise<PaginatedResult<ProposalRow>> {
  const client = getControlPlaneClient();

  const limit = options.limit ? Math.min(parseInt(String(options.limit), 10), 100) : 20;

  return client.listProposals(projectId, {
    status: options.status,
    limit,
    cursor: options.cursor,
  });
}
