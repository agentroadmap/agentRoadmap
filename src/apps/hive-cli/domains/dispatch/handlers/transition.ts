/**
 * Handler for `hive dispatch transition <id>`
 *
 * Transitions a dispatch to a new state.
 * Mutation; routed through MCP.
 * TODO: Integrate with MCP once mcp_ops.transition_dispatch is available.
 */

import { Errors } from "../../../common/index";

export interface DispatchTransitionOptions {
  to: string;
}

export async function handleDispatchTransition(
  id: string,
  options: DispatchTransitionOptions
): Promise<Record<string, unknown>> {
  if (!id) {
    throw Errors.usage("Missing required argument: dispatch_id");
  }

  if (!options.to) {
    throw Errors.usage("Missing required flag: --to <state>");
  }

  // STUB: This command requires MCP integration.
  // Per contract §6, mutations that touch dispatches should go through MCP.
  // For now, return a placeholder response indicating the gap.
  return {
    status: "stub",
    message: "dispatch transition command requires MCP tool integration (mcp_ops.transition_dispatch)",
    dispatch_id: id,
    target_state: options.to,
    hint: "This is a placeholder. Implement in Round 3/4 once MCP offers the tool.",
  };
}
