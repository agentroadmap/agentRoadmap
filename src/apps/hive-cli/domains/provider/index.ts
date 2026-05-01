/**
 * Provider domain: LLM provider registry and credential management.
 *
 * Commands:
 * - hive provider list [--format text|json|yaml]
 * - hive provider info PROVIDER_ID [--format text|json|yaml]
 *
 * Implements cli-hive-contract.md §1 (provider domain, read-only).
 */

import type { Command } from "commander";
import {
  registerDomain,
  Errors,
  type DomainSchema,
  getControlPlaneClient,
} from "../../common/index";

const DOMAIN_NAME = "provider";
const DOMAIN_DESCRIPTION = "LLM provider registry and credential management";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "list",
      signature: "hive provider list",
      description: "List all LLM providers",
      flags: [
        {
          name: "format",
          type: "enum",
          enum: ["text", "json", "jsonl", "yaml"],
          default: "text",
        },
      ],
      output: {
        type: "array",
        schema: {
          provider_id: "string",
          name: "string",
          status: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
    {
      name: "info",
      signature: "hive provider info PROVIDER_ID",
      description: "Get provider details",
      parameters: [
        {
          name: "PROVIDER_ID",
          type: "string",
          required: true,
          description: "Provider ID",
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
          provider_id: "string",
          name: "string",
          status: "string",
          credentials_active: "boolean",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
  ],
};

async function handleList(options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  void options;
  return client.listProviders();
}

async function handleInfo(providerId: string, options: Record<string, unknown>) {
  void options;
  const client = getControlPlaneClient();
  const provider = await client.getProvider(providerId);
  if (!provider) {
    throw Errors.notFound(`Provider '${providerId}' not found`, {
      provider_id: providerId,
    });
  }
  return provider;
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const domainCmd = program
    .command(DOMAIN_NAME)
    .description(DOMAIN_DESCRIPTION)
    .addHelpCommand(false);

  domainCmd
    .command("list")
    .description("List all LLM providers")
    .action(async (options) => {
      const result = await handleList(options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });

  domainCmd
    .command("info <PROVIDER_ID>")
    .description("Get provider details")
    .action(async (providerId: string, options) => {
      const result = await handleInfo(providerId, options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });
}
