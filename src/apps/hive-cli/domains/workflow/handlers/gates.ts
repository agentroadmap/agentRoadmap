/**
 * Handler for `hive workflow gates <workflow_id>`
 *
 * Lists all gate rules for a workflow.
 * Read-only; uses control-plane DB.
 */

import { getControlPlaneClient, Errors } from "../../../common/index";

export interface GatesOptions {
  state?: string;
}

export async function handleGates(
  projectId: number,
  workflowId: string,
  options: GatesOptions
): Promise<Record<string, unknown>> {
  if (!workflowId) {
    throw Errors.usage("Missing required argument: workflow_id");
  }

  const client = getControlPlaneClient();

  // TODO (Round 3): Implement workflow gates listing in control-plane-client
  // For now, stub response
  return {
    workflow_id: workflowId,
    gates: [],
  };
}
