/**
 * Handler for `hive proposal maturity <proposal_id> <maturity>`
 *
 * Sets proposal maturity (new, active, mature, obsolete).
 * Mutation; requires MCP per contract §6.
 */

import { hiveTools, Errors } from "../../../common/index";
import type { HiveMcpClient } from "../../../common/mcp-client";

const VALID_MATURITIES = ["new", "active", "mature", "obsolete"];

export interface MaturityOptions {
  idempotencyKey?: string;
}

export async function handleMaturity(
  projectId: number,
  proposalId: string,
  maturity: string,
  mcpClient: HiveMcpClient,
  options: MaturityOptions
): Promise<Record<string, unknown>> {
  if (!proposalId) {
    throw Errors.usage("Missing required argument: proposal_id");
  }
  if (!maturity) {
    throw Errors.usage("Missing required argument: maturity");
  }

  if (!VALID_MATURITIES.includes(maturity)) {
    throw Errors.usage(
      `Invalid maturity: ${maturity}. Valid values: ${VALID_MATURITIES.join(", ")}`
    );
  }

  try {
    return await hiveTools.proposal.setMaturity(
      mcpClient,
      proposalId,
      { maturity },
      {
        idempotencyKey: options.idempotencyKey,
        timeoutMs: 30000,
      }
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("MCP")) {
      throw Errors.mcpUnreachable("MCP server unreachable for maturity update");
    }
    throw err;
  }
}
