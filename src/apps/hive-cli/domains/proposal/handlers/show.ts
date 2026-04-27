/**
 * Handler for `hive proposal show <proposal_id>`
 *
 * Alias for `hive proposal get --include all`.
 * Shows full proposal state including all related data.
 */

import { handleGet, type GetOptions } from "./get";

export interface ShowOptions extends GetOptions {}

export async function handleShow(
  projectId: number,
  proposalId: string,
  options: ShowOptions
): Promise<Record<string, unknown>> {
  // Show is just get with --include all
  return handleGet(projectId, proposalId, {
    ...options,
    include: ["all"],
  });
}
