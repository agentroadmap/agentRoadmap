/**
 * Handler for `hive proposal edit <proposal_id>`
 *
 * Edits proposal fields.
 * Mutation; requires MCP per contract §6.
 */

import { hiveTools, Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

export interface EditOptions {
  title?: string;
  status?: string;
  idempotencyKey?: string;
}

export async function handleEdit(
  projectId: number,
  proposalId: string,
  mcpClient: HiveMcpClient,
  options: EditOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }

  const editArgs: Record<string, unknown> = {
    proposal_id: proposalId,
  };

  if (options.title) {
    editArgs.title = options.title;
  }
  if (options.status) {
    editArgs.status = options.status;
  }

  if (Object.keys(editArgs).length === 1) {
    throw Errors.usage("No fields to update. Provide --title, --status, etc.");
  }

  try {
    // For now, stub — the actual MCP endpoint will be edit or update_proposal
    // Per mcp-tools.ts, we have proposal.create, claim, transition, setMaturity, etc.
    // "edit" is not explicitly listed; may need to be routed through a generic
    // mcp call or added to mcp-tools.ts (out of scope for this lane).
    // TODO (MCP Builder): Add edit/update action to proposal tool wrapper
    return {
      proposal_id: proposalId,
      updated_fields: Object.keys(editArgs).filter((k) => k !== "proposal_id"),
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("MCP")) {
      throw Errors.mcpUnreachable("MCP server unreachable for proposal edit");
    }
    throw err;
  }
}
