/**
 * Handler for `hive proposal depend <proposal_id> <action>`
 *
 * Manages proposal dependencies (add, remove, resolve).
 * Mutations require MCP per contract §6.
 */

import { Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

export interface DependOptions {
  action: "add" | "remove" | "resolve";
  on?: string;
  idempotencyKey?: string;
}

export async function handleDepend(
  projectId: number,
  proposalId: string,
  mcpClient: HiveMcpClient,
  options: DependOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }

  const action = options.action || "add";

  switch (action) {
    case "add":
      return handleDependAdd(projectId, proposalId, mcpClient, options);

    case "remove":
      return handleDependRemove(projectId, proposalId, mcpClient, options);

    case "resolve":
      return handleDependResolve(projectId, proposalId, mcpClient, options);

    default:
      throw Errors.usage(
        `Unknown depend action: ${action}. Valid: add, remove, resolve`
      );
  }
}

async function handleDependAdd(
  projectId: number,
  proposalId: string,
  mcpClient: HiveMcpClient,
  options: DependOptions
): Promise<Record<string, unknown>> {
  if (!options.on) {
    throw Errors.usage("Missing --on flag for dependency target");
  }

  // TODO (Round 3): Implement dependency add in MCP tool wrapper
  // For now, stub
  return {
    proposal_id: proposalId,
    action: "add",
    dependency_on: options.on,
  };
}

async function handleDependRemove(
  projectId: number,
  proposalId: string,
  mcpClient: HiveMcpClient,
  options: DependOptions
): Promise<Record<string, unknown>> {
  if (!options.on) {
    throw Errors.usage("Missing --on flag for dependency target");
  }

  // TODO (Round 3): Implement dependency remove in MCP tool wrapper
  // For now, stub
  return {
    proposal_id: proposalId,
    action: "remove",
    dependency_on: options.on,
  };
}

async function handleDependResolve(
  projectId: number,
  proposalId: string,
  mcpClient: HiveMcpClient,
  options: DependOptions
): Promise<Record<string, unknown>> {
  // TODO (Round 3): Implement dependency resolve in MCP tool wrapper
  // For now, stub
  return {
    proposal_id: proposalId,
    action: "resolve",
    unblocked_dependencies: [],
  };
}
