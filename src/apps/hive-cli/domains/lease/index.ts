/**
 * Lease domain: proposal claim/tenure management.
 *
 * Commands:
 * - hive lease list [--format text|json|yaml]
 * - hive lease info LEASE_ID [--format text|json|yaml]
 * - hive lease expired [--format text|json|yaml]
 *
 * Implements cli-hive-contract.md §1 (lease domain, read-only).
 */

import type { Command } from "commander";
import {
  registerDomain,
  Errors,
  type DomainSchema,
  getControlPlaneClient,
} from "../../common/index";

const DOMAIN_NAME = "lease";
const DOMAIN_DESCRIPTION = "Proposal claim and tenure management";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "list",
      signature: "hive lease list",
      description: "List all leases",
      flags: [
        {
          name: "format",
          type: "enum",
          enum: ["text", "json", "jsonl", "yaml"],
          default: "text",
        },
        {
          name: "active",
          type: "boolean",
          description: "Show only active leases",
        },
      ],
      output: {
        type: "array",
        schema: {
          id: "string",
          proposal_id: "string",
          agent_identity: "string",
          claimed_at: "string",
          expires_at: "string",
          is_active: "boolean",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
    {
      name: "info",
      signature: "hive lease info LEASE_ID",
      description: "Get lease details",
      parameters: [
        {
          name: "LEASE_ID",
          type: "string",
          required: true,
          description: "Lease ID",
        },
      ],
      flags: [
        {
          name: "format",
          type: "enum",
          enum: ["text", "json", "yaml"],
          default: "text",
        },
      ],
      output: {
        type: "object",
        schema: {
          id: "string",
          proposal_id: "string",
          agent_identity: "string",
          claimed_at: "string",
          expires_at: "string",
          released_at: "string",
          is_active: "boolean",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "expired",
      signature: "hive lease expired",
      description: "List expired or soon-to-expire leases",
      flags: [
        {
          name: "format",
          type: "enum",
          enum: ["text", "json", "jsonl", "yaml"],
          default: "text",
        },
        {
          name: "days",
          type: "number",
          default: 1,
          description: "Days until expiry (default: 1)",
        },
      ],
      output: {
        type: "array",
        schema: {
          id: "string",
          proposal_id: "string",
          agent_identity: "string",
          expires_at: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
  ],
};

async function handleList(options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  // TODO: Implement listLeases method on ControlPlaneClient
  // For now, return empty stub
  return [];
}

async function handleInfo(leaseId: string, options: Record<string, unknown>) {
  // TODO: Implement getLease method on ControlPlaneClient
  throw Errors.notFound(
    `Lease '${leaseId}' not found (stub implementation)`,
    { lease_id: leaseId }
  );
}

async function handleExpired(options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  const days = options.days ?? 1;
  // TODO: Implement getExpiredLeases method on ControlPlaneClient
  // For now, return empty stub
  return [];
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const domainCmd = program
    .command(DOMAIN_NAME)
    .description(DOMAIN_DESCRIPTION)
    .addHelpCommand(false);

  domainCmd
    .command("list")
    .description("List all leases")
    .option("-a, --active", "Show only active leases")
    .action(async (options) => {
      const result = await handleList(options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });

  domainCmd
    .command("info <LEASE_ID>")
    .description("Get lease details")
    .action(async (leaseId: string, options) => {
      const result = await handleInfo(leaseId, options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });

  domainCmd
    .command("expired")
    .description("List expired or soon-to-expire leases")
    .option("-d, --days <number>", "Days until expiry (default: 1)", "1")
    .action(async (options) => {
      const result = await handleExpired(options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });
}
