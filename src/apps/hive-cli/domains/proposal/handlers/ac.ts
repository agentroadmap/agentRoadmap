/**
 * Handler for `hive proposal ac <action>`
 *
 * Manages acceptance criteria (add, list, verify, delete).
 * Mutations (add, verify, delete) require MCP per contract §6.
 */

import { hiveTools, Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

export interface AcOptions {
  action: "add" | "list" | "verify" | "delete";
  proposalId?: string;
  description?: string;
  verificationMethod?: string;
  acId?: string;
  verified?: boolean;
  notes?: string;
  idempotencyKey?: string;
}

export async function handleAc(
  projectId: number,
  mcpClient: HiveMcpClient,
  isTty: boolean,
  options: AcOptions
): Promise<Record<string, unknown>> {
  const action = options.action || "list";
  const proposalId = options.proposalId;

  switch (action) {
    case "add":
      return handleAcAdd(projectId, proposalId, mcpClient, options);

    case "list":
      return handleAcList(projectId, proposalId, mcpClient);

    case "verify":
      return handleAcVerify(projectId, proposalId, mcpClient, options);

    case "delete":
      return handleAcDelete(
        projectId,
        proposalId,
        mcpClient,
        isTty,
        options
      );

    default:
      throw Errors.usage(
        `Unknown AC action: ${action}. Valid: add, list, verify, delete`
      );
  }
}

async function handleAcAdd(
  projectId: number,
  proposalId: string | undefined,
  mcpClient: HiveMcpClient,
  options: AcOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing --proposal-id");
  }
  if (!options.description) {
    throw Errors.usage("Missing --description");
  }

  try {
    return await hiveTools.proposal.addCriteria(
      mcpClient,
      proposalId,
      {
        description: options.description,
        verification_method: options.verificationMethod,
      },
      { idempotencyKey: options.idempotencyKey, timeoutMs: 30000 }
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("MCP")) {
      throw Errors.mcpUnreachable("MCP server unreachable for AC add");
    }
    throw err;
  }
}

async function handleAcList(
  projectId: number,
  proposalId: string | undefined,
  mcpClient: HiveMcpClient
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing --proposal-id");
  }

  try {
    return await hiveTools.proposal.listCriteria(mcpClient, proposalId);
  } catch (err) {
    if (err instanceof Error && err.message.includes("MCP")) {
      throw Errors.mcpUnreachable("MCP server unreachable for AC list");
    }
    throw err;
  }
}

async function handleAcVerify(
  projectId: number,
  proposalId: string | undefined,
  mcpClient: HiveMcpClient,
  options: AcOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing --proposal-id");
  }
  if (!options.acId) {
    throw Errors.usage("Missing --ac-id");
  }

  try {
    return await hiveTools.proposal.verifyCriteria(
      mcpClient,
      proposalId,
      {
        ac_id: options.acId,
        verified: options.verified !== false,
        notes: options.notes,
      },
      { idempotencyKey: options.idempotencyKey, timeoutMs: 30000 }
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("MCP")) {
      throw Errors.mcpUnreachable("MCP server unreachable for AC verify");
    }
    throw err;
  }
}

async function handleAcDelete(
  projectId: number,
  proposalId: string | undefined,
  mcpClient: HiveMcpClient,
  isTty: boolean,
  options: AcOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing --proposal-id");
  }
  if (!options.acId) {
    throw Errors.usage("Missing --ac-id");
  }

  // Destructive operation
  if (isTty) {
    throw Errors.conflict(
      "Delete is destructive. Use --yes to confirm.",
      { proposal_id: proposalId, ac_id: options.acId }
    );
  }

  // TODO (Round 3): Implement AC delete in MCP tool wrapper
  throw Errors.usage("AC delete not yet implemented");
}
