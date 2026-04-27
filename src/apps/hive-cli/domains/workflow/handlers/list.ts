/**
 * Handler for `hive workflow list`
 *
 * Lists all workflows defined in project.
 * Read-only; uses control-plane DB.
 */

import { getControlPlaneClient, Errors } from "../../../common/index";

export interface ListOptions {
  limit?: number;
  cursor?: string;
}

export async function handleList(
  projectId: number,
  options: ListOptions
): Promise<Record<string, unknown>> {
  const client = getControlPlaneClient();

  // TODO (Round 3): Implement workflow listing in control-plane-client
  // For now, stub empty response
  return {
    workflows: [],
    next_cursor: null,
  };
}
