/**
 * trust domain — agent trust-tier inspection.
 *
 * Per cli-hive-design.md (workforce section): trust tiers gate which agents
 * can claim which work. The taxonomy is `authority | trusted | known | restricted`.
 *
 * Currently shipped:
 *   hive trust list    - list all agents with their trust tier
 *
 * Deferred to follow-up:
 *   hive trust set, hive trust audit, hive trust history.
 */

import type { Command } from "commander";
import { registerDomain, Errors, type DomainSchema } from "../../common/index";
import { query as pgQuery } from "../../../../infra/postgres/pool";

const DOMAIN_NAME = "trust";
const DOMAIN_DESCRIPTION = "Agent trust-tier inspection";

const domainSchema: DomainSchema = {
  name: DOMAIN_NAME,
  aliases: [],
  description: DOMAIN_DESCRIPTION,
  subcommands: [
    {
      name: "list",
      signature: "hive trust list",
      description: "List all agents with their trust tier",
      flags: [
        {
          name: "tier",
          type: "enum",
          enum: ["authority", "trusted", "known", "restricted"],
          description: "Filter by tier",
        },
      ],
      output: {
        type: "array",
        schema: {
          agent_identity: "string",
          tier: "string",
          last_observed_at: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
  ],
};

interface TrustRow {
  agent_identity: string;
  tier: string;
  last_observed_at: string | null;
}

async function handleList(opts: { tier?: string }): Promise<TrustRow[]> {
  const params: unknown[] = [];
  let where = "";
  if (opts.tier) {
    params.push(opts.tier);
    where = "WHERE tier = $1";
  }
  const { rows } = await pgQuery<TrustRow>(
    `SELECT agent_identity,
            tier,
            updated_at::text AS last_observed_at
       FROM roadmap_workforce.agent_trust
       ${where}
       ORDER BY agent_identity ASC
       LIMIT 200`,
    params,
  );
  return rows;
}

export function register(program: Command): void {
  registerDomain(domainSchema);

  const cmd = program.command(DOMAIN_NAME).description(DOMAIN_DESCRIPTION);

  cmd
    .command("list")
    .description("List agents with their trust tier")
    .option("--tier <name>", "Filter by tier")
    .action(async (opts) => {
      try {
        const result = await handleList(opts);
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw Errors.remoteFailure(`trust list failed: ${msg}`);
      }
    });
}
