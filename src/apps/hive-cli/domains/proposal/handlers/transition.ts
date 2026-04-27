/**
 * Handler for `hive proposal transition <proposal_id> <next_state>`
 *
 * Transitions a proposal to a new state.
 * Mutation; requires MCP per contract §6.
 */

import { hiveTools, Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

export interface TransitionOptions {
  reason?: string;
  idempotencyKey?: string;
}

export async function handleTransition(
  projectId: number,
  proposalId: string,
  nextState: string,
  mcpClient: HiveMcpClient,
  options: TransitionOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }
  if (!nextState) {
    throw Errors.usage("Missing required argument: next_state");
  }

  const transitionArgs: Record<string, unknown> = {
    next_state: nextState,
  };

  if (options.reason) {
    transitionArgs.reason = options.reason;
  }

  try {
    return await hiveTools.proposal.transition(
      mcpClient,
      proposalId,
      transitionArgs,
      {
        idempotencyKey: options.idempotencyKey,
        timeoutMs: 30000,
      }
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("MCP")) {
        throw Errors.mcpUnreachable("MCP server unreachable for proposal transition");
      }
      if (
        err.message.includes("invalid") ||
        err.message.includes("cannot transition")
      ) {
        throw Errors.invalidState(
          `Cannot transition proposal to ${nextState} from current state`,
          { proposal_id: proposalId, next_state: nextState }
        );
      }
    }
    throw err;
  }
}
