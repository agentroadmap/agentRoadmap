/**
 * db domain — control-plane database introspection.
 *
 * Per cli-hive-system-ops.md §1: read-only DB introspection from the CLI.
 * Mutating SQL goes through `hive sql exec` (separate destructive domain).
 *
 * Currently shipped:
 *   hive db ping           - liveness check (round-trip query)
 *   hive db schemas        - list visible schemas
 *
 * Deferred to follow-up:
 *   hive db query, hive db explain, hive db stats — see cli-hive-system-ops.md.
 */

import type { Command } from "commander";
import { registerDomain, Errors, type DomainSchema } from "../../common/index";
import { query as pgQuery } from "../../../../infra/postgres/pool";

const DOMAIN_NAME = "db";
const DOMAIN_DESCRIPTION = "Control-plane database introspection";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "ping",
      signature: "hive db ping",
      description: "Run a liveness probe against the control-plane DB",
      flags: [
        {
          name: "format",
          type: "enum",
          enum: ["text", "json"],
          default: "text",
          description: "Output format",
        },
      ],
      output: {
        type: "object",
        schema: {
          ok: "boolean",
          rtt_ms: "number",
          server_version: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json"],
    },
    {
      name: "schemas",
      signature: "hive db schemas",
      description: "List schemas visible to the connected role",
      flags: [],
      output: {
        type: "array",
        schema: {
          schema_name: "string",
          owner: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
  ],
};

async function handlePing(): Promise<{
  ok: boolean;
  rtt_ms: number;
  server_version: string;
}> {
  const t0 = Date.now();
  const { rows } = await pgQuery<{ version: string }>("SELECT version() AS version");
  const rtt = Date.now() - t0;
  const version = rows[0]?.version ?? "unknown";
  return {
    ok: true,
    rtt_ms: rtt,
    server_version: version.split(" ").slice(0, 2).join(" "),
  };
}

async function handleSchemas(): Promise<
  Array<{ schema_name: string; owner: string }>
> {
  const { rows } = await pgQuery<{ schema_name: string; owner: string }>(
    `SELECT schema_name, schema_owner AS owner
       FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog','pg_toast','information_schema')
        AND schema_name NOT LIKE 'pg_%'
      ORDER BY schema_name`,
  );
  return rows;
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const cmd = program.command(DOMAIN_NAME).description(DOMAIN_DESCRIPTION);

  cmd
    .command("ping")
    .description("Liveness probe against the control-plane DB")
    .action(async () => {
      try {
        const result = await handlePing();
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw Errors.remoteFailure(`db ping failed: ${msg}`);
      }
    });

  cmd
    .command("schemas")
    .description("List visible schemas")
    .action(async () => {
      try {
        const result = await handleSchemas();
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw Errors.remoteFailure(`db schemas failed: ${msg}`);
      }
    });
}
