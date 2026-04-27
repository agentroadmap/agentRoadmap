/**
 * Knowledge domain: knowledge base and agent memory management.
 *
 * Commands:
 * - hive knowledge list [--format text|json|yaml]
 * - hive knowledge get ID [--format text|json|yaml]
 * - hive knowledge search QUERY [--format text|json|jsonl]
 * - hive memory list [AGENT] [--format text|json|yaml]
 * - hive memory show [AGENT] KEY [--format text|json]
 *
 * Implements cli-hive-contract.md §1 (knowledge domain, mostly read-only).
 */

import type { Command } from "commander";
import {
  registerDomain,
  Errors,
  type DomainSchema,
  getControlPlaneClient,
} from "../../common/index";

const DOMAIN_NAME = "knowledge";
const DOMAIN_DESCRIPTION = "Knowledge base and agent memory management";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: ["kb", "memory"],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "list",
      signature: "hive knowledge list",
      description: "List knowledge base entries",
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
        schema: { id: "string", title: "string", created_at: "string" },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
    {
      name: "get",
      signature: "hive knowledge get ID",
      description: "Get knowledge entry by ID",
      parameters: [
        {
          name: "ID",
          type: "string",
          required: true,
          description: "Entry ID",
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
        schema: { id: "string", title: "string", body: "string" },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "search",
      signature: "hive knowledge search QUERY",
      description: "Search knowledge base",
      parameters: [
        {
          name: "QUERY",
          type: "string",
          required: true,
          description: "Search query",
        },
      ],
      flags: [
        {
          name: "format",
          type: "enum",
          enum: ["text", "json", "jsonl"],
          default: "text",
        },
      ],
      output: {
        type: "array",
        schema: { id: "string", title: "string", score: "number" },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl"],
    },
  ],
};

async function handleList(options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  // TODO: Implement listDocs on ControlPlaneClient
  // Query roadmap.docs
  return [];
}

async function handleGet(id: string, options: Record<string, unknown>) {
  // TODO: Implement getDoc on ControlPlaneClient
  throw Errors.notFound(`Knowledge entry '${id}' not found (stub)`, { id });
}

async function handleSearch(query: string, options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  // TODO: Implement searchDocs on ControlPlaneClient (uses pgvector)
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
    .description("List knowledge base entries")
    .action(async (options) => {
      const result = await handleList(options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });

  domainCmd
    .command("get <ID>")
    .description("Get knowledge entry")
    .action(async (id: string, options) => {
      const result = await handleGet(id, options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });

  domainCmd
    .command("search <QUERY>")
    .description("Search knowledge base")
    .action(async (query: string, options) => {
      const result = await handleSearch(query, options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });
}
