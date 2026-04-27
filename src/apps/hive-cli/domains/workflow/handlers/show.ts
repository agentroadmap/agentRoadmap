/**
 * Handler for `hive workflow show <workflow_id>`
 *
 * Shows workflow definition with state rules and transitions.
 * Read-only; uses control-plane DB.
 */

import { getControlPlaneClient, Errors } from "../../../common/index";

export interface ShowOptions {
  include?: string | string[];
}

export async function handleShow(
  projectId: number,
  workflowId: string,
  options: ShowOptions
): Promise<Record<string, unknown>> {
  if (!workflowId) {
    throw Errors.usage("Missing required argument: workflow_id");
  }

  const client = getControlPlaneClient();

  // TODO (Round 3): Implement workflow show in control-plane-client
  // For now, stub response
  return {
    workflow: {
      id: workflowId,
      project_id: projectId,
      name: workflowId,
      created_at: new Date().toISOString(),
    },
    states: [],
    transitions: [],
    gates: [],
  };
}
