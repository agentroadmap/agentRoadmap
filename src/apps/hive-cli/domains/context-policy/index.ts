/**
 * Context-policy domain: host and provider policy management.
 *
 * Commands:
 * - hive context-policy show [--format text|json|yaml]
 *
 * Implements cli-hive-contract.md §1 (context-policy domain, read-only).
 *
 * Note: This domain is currently a stub pending the completion of the context-policy
 * table design. See open questions in cli-hive-contract.md §11.
 */

import type { Command } from "commander";
import {
  registerDomain,
  Errors,
  type DomainSchema,
  getControlPlaneClient,
} from "../../common/index";

const DOMAIN_NAME = "context-policy";
const DOMAIN_DESCRIPTION = "Host and provider policy management (STUB)";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "show",
      signature: "hive context-policy show",
      description: "Show current context policies",
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
          host_policy: "object",
          provider_policy: "object",
          note: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
  ],
};

async function handleShow(options: Record<string, unknown>) {
  // TODO: Implement context-policy table and queries
  // This is a stub pending table design (see cli-hive-contract.md §11)
  return {
    host_policy: { message: "TODO: implement context-policy table" },
    provider_policy: { message: "TODO: implement context-policy table" },
    note: "Context policies not yet implemented. See P455 open questions.",
  };
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const domainCmd = program
    .command(DOMAIN_NAME)
    .description(DOMAIN_DESCRIPTION)
    .addHelpCommand(false);

  domainCmd
    .command("show")
    .description("Show current context policies")
    .action(async (options) => {
      const result = await handleShow(options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });
}
