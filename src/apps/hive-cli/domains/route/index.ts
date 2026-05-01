/**
 * Route domain: dispatch routing and model selection rules.
 *
 * Commands:
 * - hive route list [--format text|json|yaml]
 * - hive route info ROUTE_ID [--format text|json|yaml]
 * - hive route test ROUTE_ID [--format text|json|yaml]
 *
 * Implements cli-hive-contract.md §1 (route domain, read-only).
 */

import type { Command } from "commander";
import {
  registerDomain,
  Errors,
  type DomainSchema,
  getControlPlaneClient,
} from "../../common/index";

const DOMAIN_NAME = "route";
const DOMAIN_DESCRIPTION = "Dispatch routing and model selection rules";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "list",
      signature: "hive route list",
      description: "List all dispatch routes",
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
          route_id: "string",
          model_id: "string",
          provider: "string",
          priority: "number",
          enabled: "boolean",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
    {
      name: "info",
      signature: "hive route info ROUTE_ID",
      description: "Get route details",
      parameters: [
        {
          name: "ROUTE_ID",
          type: "string",
          required: true,
          description: "Route ID",
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
          route_id: "string",
          model_id: "string",
          provider: "string",
          priority: "number",
          enabled: "boolean",
          fallback_route: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "test",
      signature: "hive route test ROUTE_ID",
      description: "Test a route (verify credentials and connectivity)",
      parameters: [
        {
          name: "ROUTE_ID",
          type: "string",
          required: true,
          description: "Route ID",
        },
      ],
      flags: [
        {
          name: "format",
          type: "enum",
          enum: ["text", "json"],
          default: "text",
        },
      ],
      output: {
        type: "object",
        schema: {
          route_id: "string",
          status: "string",
          latency_ms: "number",
          message: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json"],
    },
  ],
};

async function handleList(options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  const enabled =
    typeof options.enabled === "string"
      ? options.enabled === "true"
      : undefined;
  return client.listRoutes({
    provider: typeof options.provider === "string" ? options.provider : undefined,
    agent_provider:
      typeof options.agentProvider === "string" ? options.agentProvider : undefined,
    enabled,
  });
}

async function handleInfo(routeId: string, _options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  const route = await client.getRoute(routeId);
  if (!route) {
    throw Errors.notFound(`Route '${routeId}' not found`, {
      route_id: routeId,
    });
  }
  return route;
}

async function handleTest(routeId: string, options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  const result = await client.testRoute(routeId, {
    host: typeof options.host === "string" ? options.host : undefined,
  });
  if (!result) {
    throw Errors.notFound(`Route '${routeId}' not found`, {
      route_id: routeId,
    });
  }
  return result;
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const domainCmd = program
    .command(DOMAIN_NAME)
    .description(DOMAIN_DESCRIPTION)
    .addHelpCommand(false);

  domainCmd
    .command("list")
    .description("List all dispatch routes")
    .option("-p, --provider <provider>", "Filter by route provider")
    .option("--agent-provider <provider>", "Filter by agent provider")
    .option("--enabled <true|false>", "Filter by enabled state")
    .action(async (options) => {
      const result = await handleList(options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });

  domainCmd
    .command("info <ROUTE_ID>")
    .description("Get route details")
    .action(async (routeId: string, options) => {
      const result = await handleInfo(routeId, options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });

  domainCmd
    .command("test <ROUTE_ID>")
    .description("Test route connectivity and credentials")
    .option("--host <hostname>", "Evaluate host model policy for this host")
    .action(async (routeId: string, options) => {
      const result = await handleTest(routeId, options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    });
}
