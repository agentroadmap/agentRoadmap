/**
 * Handler for `hive workflow next-state <workflow_id> <current_state>`
 *
 * Lists valid next states from current state.
 * Read-only; uses control-plane DB.
 */

import { getControlPlaneClient, Errors } from "../../../common/index";

export async function handleNextState(
  projectId: number,
  workflowId: string,
  currentState: string
): Promise<Record<string, unknown>> {
  if (!workflowId) {
    throw Errors.usage("Missing required argument: workflow_id");
  }

  if (!currentState) {
    throw Errors.usage("Missing required argument: current_state");
  }

  const client = getControlPlaneClient();

  // TODO (Round 3): Implement next-state lookup in control-plane-client
  // For now, stub response
  return {
    current_state: currentState,
    allowed_next_states: [],
  };
}
