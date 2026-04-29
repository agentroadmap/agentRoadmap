/**
 * mcp domain — MCP server status and tool introspection.
 *
 * Per cli-hive-system-ops.md §1: MCP-side observability from the CLI.
 *
 * Currently shipped:
 *   hive mcp status   - liveness check against the SSE endpoint
 *
 * Deferred to follow-up:
 *   hive mcp tools, hive mcp resources, hive mcp call.
 */

import type { Command } from "commander";
import { registerDomain, Errors, type DomainSchema } from "../../common/index";

const DOMAIN_NAME = "mcp";
const DOMAIN_DESCRIPTION = "MCP server status and tool introspection";

const MCP_URL =
  process.env.MCP_SSE_URL || "http://127.0.0.1:6421/sse";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "status",
      signature: "hive mcp status",
      description: "Check MCP SSE endpoint reachability",
      flags: [
        {
          name: "url",
          type: "string",
          default: MCP_URL,
          description: "MCP SSE endpoint URL",
        },
      ],
      output: {
        type: "object",
        schema: {
          ok: "boolean",
          url: "string",
          rtt_ms: "number",
          status_code: "number",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json"],
    },
  ],
};

async function handleStatus(opts: { url?: string }): Promise<{
  ok: boolean;
  url: string;
  rtt_ms: number;
  status_code: number;
}> {
  const url = opts.url || MCP_URL;
  const t0 = Date.now();
  let statusCode = 0;
  let ok = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    statusCode = response.status;
    ok = response.ok;
    // Don't read the body — SSE streams forever; just confirm the handshake.
    response.body?.cancel().catch(() => {});
  } catch (err) {
    ok = false;
  }
  return {
    ok,
    url,
    rtt_ms: Date.now() - t0,
    status_code: statusCode,
  };
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const cmd = program.command(DOMAIN_NAME).description(DOMAIN_DESCRIPTION);

  cmd
    .command("status")
    .description("Check MCP SSE endpoint reachability")
    .option("--url <url>", "MCP SSE endpoint URL")
    .action(async (opts) => {
      try {
        const result = await handleStatus(opts);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        if (!result.ok) {
          process.exitCode = 5;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw Errors.remoteFailure(`mcp status failed: ${msg}`);
      }
    });
}
