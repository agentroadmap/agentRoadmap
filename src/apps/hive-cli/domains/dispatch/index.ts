/**
 * Dispatch domain: Work dispatch inspection and lifecycle operations.
 *
 * Per cli-hive-contract.md §8.2, read commands use direct DB queries;
 * mutations (offer, transition) are routed through MCP.
 */

import type { Command } from "commander";
import {
  registerDomain,
  Errors,
  type DomainSchema,
} from "../../common/index";
import { dispatchSchema } from "./dispatch-schema";
import { handleDispatchList } from "./handlers/list";
import { handleDispatchShow } from "./handlers/show";
import { handleDispatchQueue } from "./handlers/queue";
import { handleDispatchOffer } from "./handlers/offer";
import { handleDispatchTransition } from "./handlers/transition";

const DOMAIN_NAME = "dispatch";
const DOMAIN_DESCRIPTION = "Work dispatch inspection and lifecycle operations";

/**
 * Register dispatch domain with the CLI program.
 */
export function register(program: Command): void {
  registerDomain(dispatchSchema);

  const dispatchCmd = program
    .command("dispatch")
    .description(DOMAIN_DESCRIPTION)
    .addHelpCommand(false);

  // hive dispatch list [--status <status>] [--proposal <id>] [--limit <n>] [--cursor <cursor>]
  dispatchCmd
    .command("list")
    .option("-s, --status <status>", "Filter by status (assigned, active, blocked, completed, cancelled, failed)")
    .option("-p, --proposal <id>", "Filter by proposal ID")
    .option("-l, --limit <n>", "Maximum results to return (default: 20)")
    .option("-c, --cursor <cursor>", "Pagination cursor")
    .action(async (options) => {
      try {
        const result = await handleDispatchList({
          status: options.status,
          proposal: options.proposal,
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

  // hive dispatch show <id> [--include <relation>]
  dispatchCmd
    .command("show <id>")
    .option("-i, --include <relation>", "Expand relations: offers, claims, runs, events")
    .action(async (id: string, options) => {
      try {
        const result = await handleDispatchShow(id, {
          include: options.include ? [options.include] : [],
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

  // hive dispatch queue [--limit <n>]
  dispatchCmd
    .command("queue")
    .option("-l, --limit <n>", "Maximum results to return (default: 20)")
    .action(async (options) => {
      try {
        const result = await handleDispatchQueue({
          limit: options.limit,
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

  // hive dispatch offer <proposal_id> [--squad <identity>] [--role <role>] [--idempotency-key <key>]
  dispatchCmd
    .command("offer <proposalId>")
    .option("--squad <identity>", "Target squad/agency identity")
    .option("-r, --role <role>", "Required role")
    .option("--idempotency-key <key>", "Idempotency key for retries")
    .action(async (proposalId: string, options) => {
      try {
        const result = await handleDispatchOffer(proposalId, {
          squad: options.squad,
          role: options.role,
          idempotencyKey: options.idempotencyKey,
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

  // hive dispatch transition <id> --to <state>
  dispatchCmd
    .command("transition <id>")
    .option("-t, --to <state>", "Target state")
    .action(async (id: string, options) => {
      try {
        if (!options.to) {
          throw Errors.usage("Missing required flag: --to <state>");
        }
        const result = await handleDispatchTransition(id, {
          to: options.to,
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
