/**
 * Lint domain: code style and formatting checks.
 *
 * Commands:
 * - hive lint <FILE> [--fix] [--format sarif|json]
 *
 * Implements cli-hive-contract.md §1 (lint domain).
 * Note: Stub for P455 Round 3.
 */

import type { Command } from "commander";
import {
  registerDomain,
  Errors,
  type DomainSchema,
} from "../../common/index";

const DOMAIN_NAME = "lint";
const DOMAIN_DESCRIPTION = "Code style and formatting checks (stub)";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "file",
      signature: "hive lint <FILE>",
      description: "Lint a file",
      parameters: [
        {
          name: "FILE",
          type: "string",
          required: true,
          description: "File path",
        },
      ],
      flags: [
        {
          name: "fix",
          type: "boolean",
          description: "Auto-fix issues",
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

async function handleLint(file: string, options: Record<string, unknown>) {
  return {
    message: `TODO: Lint file '${file}' (stub implementation)`,
  };
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const domainCmd = program
    .command(DOMAIN_NAME)
    .description(DOMAIN_DESCRIPTION)
    .addHelpCommand(false);

  domainCmd
    .command("file <FILE>")
    .description("Lint a file")
    .option("--fix", "Auto-fix issues")
    .action(async (file: string, options) => {
      const result = await handleLint(file, options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });
}
