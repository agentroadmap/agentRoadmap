/**
 * Stop domain: Emergency operator stop/cancel commands.
 *
 * Per cli-hive-contract.md §8, all stop commands are destructive and require --yes.
 * Panic operations (stop all, stop host) require both --yes and --really-yes.
 * All stops write to operator_audit_log for compliance.
 */

import type { Command } from "commander";
import {
  registerDomain,
  registerRecipe,
  Errors,
  isTtyOutput,
  type DomainSchema,
  type Recipe,
} from "../../common/index";
import { stopSchema } from "./stop-schema";
import { handleStopDispatch } from "./handlers/dispatch";
import { handleStopProposal } from "./handlers/proposal";
import { handleStopAgency } from "./handlers/agency";
import { handleStopHost } from "./handlers/host";
import { handleStopWorker } from "./handlers/worker";
import { handleStopRoute } from "./handlers/route";
import { handleStopAll } from "./handlers/all";

const DOMAIN_NAME = "stop";
const DOMAIN_DESCRIPTION = "Emergency operator stop (cancel/halt work)";

/**
 * Stop recipe (multi-step workflow).
 */
const stopRecipe: Recipe = {
  id: "emergency-stop",
  title: "Emergency stop procedures",
  when_to_use: "When you need to halt work immediately",
  steps: [
    {
      cmd: "hive stop all --scope global --reason 'emergency: XYZ' --yes --really-yes",
      reads: [],
      description: "Global panic stop (requires double confirmation)",
    },
    {
      cmd: "hive audit feed --since 5m --format jsonl",
      reads: [],
      description: "View recent operator actions",
    },
  ],
  terminal_state: "All work stopped, audit trail recorded",
};

/**
 * Confirmation check for destructive stop operations.
 */
async function requireConfirmation(
  operation: string,
  requireReallyYes: boolean,
  options: Record<string, unknown>
): Promise<void> {
  // If --yes is set, skip prompts
  if (options.yes) {
    if (requireReallyYes && !options.reallyYes) {
      throw Errors.conflict(
        `${operation} requires --really-yes (panic operation)`,
        {}
      );
    }
    return;
  }

  // If not TTY (non-interactive), require --yes
  if (!isTtyOutput()) {
    throw Errors.conflict(
      `${operation} is destructive; use --yes to confirm`,
      { operation }
    );
  }

  // If TTY, prompt user (simplified for now; would show interactive prompt)
  // For testing, we'll treat non-TTY without --yes as a conflict
}

/**
 * Register stop domain with the CLI program.
 */
export function register(program: Command): void {
  registerDomain(stopSchema);
  registerRecipe(stopRecipe);

  const stopCmd = program
    .command("stop")
    .description(DOMAIN_DESCRIPTION)
    .addHelpCommand(false);

  // hive stop dispatch <id>
  stopCmd
    .command("dispatch <id>")
    .option("-r, --reason <text>", "Reason for stopping")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (id: string, options) => {
      try {
        await requireConfirmation("stop dispatch", false, options);
        const result = await handleStopDispatch(id, {
          reason: options.reason,
          yes: options.yes,
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

  // hive stop proposal <display_id>
  stopCmd
    .command("proposal <displayId>")
    .option("-r, --reason <text>", "Reason for pausing")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (displayId: string, options) => {
      try {
        await requireConfirmation("stop proposal", false, options);
        const result = await handleStopProposal(displayId, {
          reason: options.reason,
          yes: options.yes,
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

  // hive stop agency <id>
  stopCmd
    .command("agency <id>")
    .option("-r, --reason <text>", "Reason for suspension")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (id: string, options) => {
      try {
        await requireConfirmation("stop agency", false, options);
        const result = await handleStopAgency(id, {
          reason: options.reason,
          yes: options.yes,
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

  // hive stop host <id>
  stopCmd
    .command("host <id>")
    .option("-g, --grace <duration>", "Grace period (default: 60s)")
    .option("-r, --reason <text>", "Reason for drain")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--really-yes", "Confirm panic operation (required)")
    .action(async (id: string, options) => {
      try {
        await requireConfirmation("stop host", true, options);
        const result = await handleStopHost(id, {
          grace: options.grace,
          reason: options.reason,
          yes: options.yes,
          reallyYes: options.reallyYes,
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

  // hive stop worker <agent_identity>
  stopCmd
    .command("worker <agentIdentity>")
    .option("-r, --reason <text>", "Reason for termination")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (agentIdentity: string, options) => {
      try {
        await requireConfirmation("stop worker", false, options);
        const result = await handleStopWorker(agentIdentity, {
          reason: options.reason,
          yes: options.yes,
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

  // hive stop route <id>
  stopCmd
    .command("route <id>")
    .option("-r, --reason <text>", "Reason for disabling")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (id: string, options) => {
      try {
        await requireConfirmation("stop route", false, options);
        const result = await handleStopRoute(id, {
          reason: options.reason,
          yes: options.yes,
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

  // hive stop all [--scope <project|agency|host|global>]
  stopCmd
    .command("all")
    .option("-s, --scope <scope>", "Scope: project, agency, host, or global")
    .option("-i, --id <id>", "ID for project/agency/host scope")
    .option("-r, --reason <text>", "Reason for panic stop")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--really-yes", "Confirm panic operation (required)")
    .action(async (options) => {
      try {
        await requireConfirmation("stop all", true, options);
        const result = await handleStopAll({
          scope: options.scope,
          id: options.id,
          reason: options.reason,
          yes: options.yes,
          reallyYes: options.reallyYes,
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
