/**
 * Scan domain: code quality scanning and security checks.
 *
 * Commands:
 * - hive scan list-checks [--format text|json]
 * - hive scan run [--since COMMIT] [--format sarif|json]
 *
 * Implements cli-hive-contract.md §1 (scan domain).
 * Note: This couples to P454 which is not yet complete. Stub for now.
 */

import type { Command } from "commander";
import {
  registerDomain,
  Errors,
  type DomainSchema,
} from "../../common/index";

const DOMAIN_NAME = "scan";
const DOMAIN_DESCRIPTION = "Code quality scanning (couples to P454, stub)";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "list-checks",
      signature: "hive scan list-checks",
      description: "List available checks",
      flags: [
        {
          name: "format",
          type: "enum",
          enum: ["text", "json"],
          default: "text",
        },
      ],
      output: {
        type: "array",
        schema: { name: "string", category: "string" },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json"],
    },
    {
      name: "run",
      signature: "hive scan run",
      description: "Run code quality checks",
      flags: [
        {
          name: "since",
          type: "string",
          description: "Git commit to scan since",
        },
        {
          name: "format",
          type: "enum",
          enum: ["sarif", "json"],
          default: "sarif",
        },
      ],
      output: {
        type: "object",
        schema: { message: "string" },
      },
      idempotency: "idempotent",
      formats_supported: ["sarif", "json"],
    },
  ],
};

async function handleListChecks(options: Record<string, unknown>) {
  return [
    {
      message: "TODO: Implement scan checks (couples to P454)",
      available_checks: ["hardcoding", "security", "best-practices"],
    },
  ];
}

async function handleRun(options: Record<string, unknown>) {
  return {
    message: "TODO: Implement scan run (couples to P454)",
  };
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const domainCmd = program
    .command(DOMAIN_NAME)
    .description(DOMAIN_DESCRIPTION)
    .addHelpCommand(false);

  domainCmd
    .command("list-checks")
    .description("List available checks")
    .action(async (options) => {
      const result = await handleListChecks(options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });

  domainCmd
    .command("run")
    .description("Run code quality checks")
    .option("--since <commit>", "Git commit to scan since")
    .action(async (options) => {
      const result = await handleRun(options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });
}
