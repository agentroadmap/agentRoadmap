/**
 * cubic domain — per-agent execution-context lifecycle.
 *
 * Per cli-hive-system-ops.md §7.1.
 *
 * Currently shipped:
 *   hive cubic list     - list active cubics
 *
 * Deferred to follow-up:
 *   hive cubic info, hive cubic clean, hive cubic repair, hive cubic gc.
 */

import type { Command } from "commander";
import { registerDomain, Errors, type DomainSchema } from "../../common/index";
import { query as pgQuery } from "../../../../infra/postgres/pool";

const DOMAIN_NAME = "cubic";
const DOMAIN_DESCRIPTION = "Per-agent cubic (execution context) lifecycle";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "list",
      signature: "hive cubic list",
      description: "List active cubics",
      flags: [
        {
          name: "agent",
          type: "string",
          description: "Filter by agent identity",
        },
        {
          name: "proposal",
          type: "string",
          description: "Filter by proposal id (e.g. P704 or 704)",
        },
      ],
      output: {
        type: "array",
        schema: {
          cubic_id: "string",
          agent_identity: "string",
          proposal_id: "string",
          worktree_path: "string",
          last_activity_at: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
  ],
};

interface CubicRow {
  cubic_id: string;
  agent_identity: string;
  proposal_id: string | null;
  worktree_path: string | null;
  last_activity_at: string | null;
}

async function handleList(opts: {
  agent?: string;
  proposal?: string;
}): Promise<CubicRow[]> {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (opts.agent) {
    params.push(opts.agent);
    filters.push(`agent_identity = $${params.length}`);
  }
  if (opts.proposal) {
    const pid = String(opts.proposal).replace(/^P/i, "");
    params.push(pid);
    filters.push(`proposal_id::text = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const { rows } = await pgQuery<CubicRow>(
    `SELECT cubic_id::text,
            agent_identity,
            proposal_id::text,
            worktree_path,
            last_activity_at::text
       FROM roadmap.cubics
       ${where}
       ORDER BY last_activity_at DESC NULLS LAST
       LIMIT 100`,
    params,
  );
  return rows;
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const cmd = program.command(DOMAIN_NAME).description(DOMAIN_DESCRIPTION);

  cmd
    .command("list")
    .description("List active cubics")
    .option("--agent <identity>", "Filter by agent identity")
    .option("--proposal <id>", "Filter by proposal id")
    .action(async (opts) => {
      try {
        const result = await handleList(opts);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw Errors.remoteFailure(`cubic list failed: ${msg}`);
      }
    });
}
