/**
 * Handler for `hive proposal create`
 *
 * Creates a new proposal.
 * Mutation; requires MCP per contract §6.
 * Implements cli-hive-contract.md §1 (proposal domain, create action).
 */

import { hiveTools, Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

export interface CreateOptions {
  type?: string;
  title?: string;
  summary?: string;
  motivation?: string;
  design?: string;
  stdin?: boolean;
  idempotencyKey?: string;
}

export async function handleCreate(
  projectId: number,
  mcpClient: HiveMcpClient,
  options: CreateOptions
): Promise<Record<string, unknown>> {
  if (!options.type) {
    throw Errors.usage("Missing required flag: --type");
  }
  if (!options.title) {
    throw Errors.usage("Missing required flag: --title");
  }

  const createArgs: Record<string, unknown> = {
    project_id: projectId,
    type: options.type,
    title: options.title,
  };

  if (options.summary) {
    createArgs.summary = options.summary;
  }
  if (options.motivation) {
    createArgs.motivation = options.motivation;
  }
  if (options.design) {
    createArgs.design = options.design;
  }

  // TODO (Round 3): Handle --stdin for reading body from stdin

  try {
    return await hiveTools.proposal.create(mcpClient, createArgs, {
      idempotencyKey: options.idempotencyKey,
      timeoutMs: 30000,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("MCP")) {
      throw Errors.mcpUnreachable("MCP server unreachable for proposal creation");
    }
    throw err;
  }
}
