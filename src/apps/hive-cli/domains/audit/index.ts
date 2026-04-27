/**
 * Audit domain: operator action logging and monitoring.
 *
 * Commands (Lane F - Backend Architect scope):
 * - hive audit metrics [--format text|json]
 * - hive audit report [--format text|json]
 * - hive audit escalation [--format text|json]
 *
 * Commands (Lane G - DevOps Automator scope, not implemented here):
 * - hive audit feed
 * - hive audit search
 *
 * Implements cli-hive-contract.md §1 (audit domain, read-only).
 * Note: Lane G owns feed/search handlers; this module exports them separately.
 */

import type { Command } from "commander";
import {
  registerDomain,
  Errors,
  type DomainSchema,
  getControlPlaneClient,
} from "../../common/index";
import { handleAuditFeed } from "./handlers/feed";
import { handleAuditSearch } from "./handlers/search";

const DOMAIN_NAME = "audit";
const DOMAIN_DESCRIPTION = "Operator action logging and system metrics";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "metrics",
      signature: "hive audit metrics",
      description: "Show system metrics (proposal counts, dispatch status, etc.)",
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
          proposals_by_status: "object",
          active_leases: "number",
          dispatches_pending: "number",
          agencies_online: "number",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json"],
    },
    {
      name: "report",
      signature: "hive audit report [NAME]",
      description: "Generate system report (stub for P455 Round 3)",
      parameters: [
        {
          name: "NAME",
          type: "string",
          required: false,
          description: "Report type (e.g., daily, weekly)",
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
        schema: { message: "string" },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json"],
    },
    {
      name: "escalation",
      signature: "hive audit escalation",
      description: "List escalation events",
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
        schema: {
          escalation_id: "string",
          trigger: "string",
          timestamp: "string",
          status: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl"],
    },
  ],
};

async function handleMetrics(options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  // TODO: Query proposal counts by status, active leases, etc.
  // SELECT status, COUNT(*) FROM roadmap_proposal.proposal GROUP BY status
  // SELECT COUNT(*) FROM roadmap.proposal_lease WHERE is_active = true
  // etc.
  return {
    proposals_by_status: { DRAFT: 0, REVIEW: 0, DEVELOP: 0, MERGE: 0, COMPLETE: 0 },
    active_leases: 0,
    dispatches_pending: 0,
    agencies_online: 0,
  };
}

async function handleReport(name: string | undefined, options: Record<string, unknown>) {
  // TODO: Implement report generation
  // Available reports: daily, weekly, monthly (stub for now)
  if (!name || name === "stub") {
    return {
      message: "TODO: Report generation not yet implemented. See P455 open questions.",
      available_reports: ["daily", "weekly", "monthly"],
    };
  }
  return {
    message: `TODO: Generate ${name} report`,
  };
}

async function handleEscalation(options: Record<string, unknown>) {
  const client = getControlPlaneClient();
  // TODO: Query escalation table (if it exists)
  // See CONVENTIONS.md P443/P446 for escalation table design
  return [];
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const domainCmd = program
    .command(DOMAIN_NAME)
    .description(DOMAIN_DESCRIPTION)
    .addHelpCommand(false);

  domainCmd
    .command("metrics")
    .description("Show system metrics")
    .action(async (options) => {
      const result = await handleMetrics(options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });

  domainCmd
    .command("report [NAME]")
    .description("Generate system report")
    .action(async (name: string | undefined, options) => {
      const result = await handleReport(name, options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });

  domainCmd
    .command("escalation")
    .description("List escalation events")
    .action(async (options) => {
      const result = await handleEscalation(options);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    });

  // Lane G (DevOps Automator) commands: feed and search
  domainCmd
    .command("feed")
    .description("Show recent operator actions (newest first)")
    .option("-s, --since <time>", "Time filter: 5m, 1h, 24h, or ISO timestamp")
    .option("-l, --limit <n>", "Maximum results to return (default: 50)")
    .option("-c, --cursor <cursor>", "Pagination cursor")
    .action(async (options) => {
      try {
        const result = await handleAuditFeed({
          since: options.since,
          limit: options.limit,
          cursor: options.cursor,
        });
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } catch (err) {
        if (err instanceof Error) {
          process.stderr.write(`Error: ${err.message}\n`);
          process.exit(1);
        }
        throw err;
      }
    });

  domainCmd
    .command("search")
    .description("Search operator audit log by filters")
    .option("-a, --action <action>", "Filter by action (stop_dispatch, stop_proposal, etc.)")
    .option("--actor <name>", "Filter by operator name")
    .option("-s, --since <time>", "Start time (5m, 1h, 24h, or ISO timestamp)")
    .option("-u, --until <time>", "End time (ISO timestamp or relative)")
    .option("-t, --target <id>", "Filter by target_kind or target_identity")
    .option("-l, --limit <n>", "Maximum results to return (default: 50)")
    .option("--cursor <cursor>", "Pagination cursor")
    .action(async (options) => {
      try {
        const result = await handleAuditSearch({
          action: options.action,
          actor: options.actor,
          since: options.since,
          until: options.until,
          target: options.target,
          limit: options.limit,
          cursor: options.cursor,
        });
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } catch (err) {
        if (err instanceof Error) {
          process.stderr.write(`Error: ${err.message}\n`);
          process.exit(1);
        }
        throw err;
      }
    });
}
