/**
 * Proposal Domain for hive CLI
 *
 * Registers all proposal commands (create, get, list, claim, release, transition, etc.).
 * Implements cli-hive-contract.md §1 (proposal domain).
 */

import type { Command } from "commander";
import {
  registerDomain,
  registerRecipe,
  Errors,
  resolveContext,
  getMcpClient,
  isTtyOutput,
} from "../../common/index";
import { proposalSchema } from "./proposal-schema";
import { handleCreate } from "./handlers/create";
import { handleGet } from "./handlers/get";
import { handleList } from "./handlers/list";
import { handleShow } from "./handlers/show";
import { handleEdit } from "./handlers/edit";
import { handleClaim } from "./handlers/claim";
import { handleRelease } from "./handlers/release";
import { handleTransition } from "./handlers/transition";
import { handleMaturity } from "./handlers/maturity";
import { handleAc } from "./handlers/ac";
import { handleDepend } from "./handlers/depend";
import { handleReview } from "./handlers/review";
import { handleDiscuss } from "./handlers/discuss";
import { handleNext } from "./handlers/next";

const proposalRecipe = {
  id: "claim-and-develop",
  title: "Pick next claimable proposal and start work",
  when_to_use: "Agent has capacity",
  steps: [
    {
      command: "hive proposal next --format json",
      reads: ["proposal_id"],
      description: "Find highest-priority claimable proposal",
    },
    {
      command: 'hive proposal claim ${proposal_id} --duration 4h --format json',
      reads: ["lease_id"],
      description: "Acquire lease",
    },
  ],
  terminal_state: "Proposal claimed, lease active",
};

export function register(program: Command): void {
  // Register schema and recipe
  registerDomain(proposalSchema);
  registerRecipe(proposalRecipe);

  // Create proposal domain command group
  const proposalCmd = program
    .command("proposal")
    .alias("proposals")
    .description("Proposal CRUD and lifecycle management")
    .addHelpCommand(false);

  // proposal create
  proposalCmd
    .command("create")
    .description("Create a new proposal")
    .option("--type <type>", "Proposal type (required)")
    .option("--title <title>", "Proposal title (required)")
    .option("--summary <summary>", "Brief summary")
    .option("--motivation <motivation>", "Motivation and context")
    .option("--design <design>", "Design approach")
    .option("--stdin", "Read body from stdin")
    .option("--idempotency-key <key>", "Idempotency key for retries")
    .action(async (options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleCreate(ctx.project_id, mcpClient, {
          type: options.type,
          title: options.title,
          summary: options.summary,
          motivation: options.motivation,
          design: options.design,
          stdin: options.stdin,
          idempotencyKey: options.idempotencyKey,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal get
  proposalCmd
    .command("get <proposal_id>")
    .description("Fetch a single proposal by ID")
    .option(
      "--include <relations>",
      "Expand relations (repeatable)",
      (value, prev) => {
        return prev ? (Array.isArray(prev) ? [...prev, value] : [prev, value]) : value;
      }
    )
    .action(async (proposalId, options) => {
      const ctx = await resolveContext(options);

      try {
        const result = await handleGet(ctx.project_id, proposalId, {
          include: options.include,
          format: options.format,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal list
  proposalCmd
    .command("list")
    .description("List proposals with optional filtering")
    .option("--status <status>", "Filter by status")
    .option("--limit <limit>", "Maximum items (default: 20)")
    .option("--cursor <cursor>", "Pagination cursor")
    .action(async (options) => {
      const ctx = await resolveContext(options);

      try {
        const result = await handleList(ctx.project_id, {
          status: options.status,
          limit: options.limit,
          cursor: options.cursor,
          format: options.format,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal show
  proposalCmd
    .command("show <proposal_id>")
    .description("Show proposal with all included relations")
    .action(async (proposalId, options) => {
      const ctx = await resolveContext(options);

      try {
        const result = await handleShow(ctx.project_id, proposalId, {
          include: ["all"],
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal edit
  proposalCmd
    .command("edit <proposal_id>")
    .description("Edit proposal fields")
    .option("--title <title>", "New title")
    .option("--status <status>", "New status")
    .option("--idempotency-key <key>", "Idempotency key")
    .action(async (proposalId, options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleEdit(ctx.project_id, proposalId, mcpClient, {
          title: options.title,
          status: options.status,
          idempotencyKey: options.idempotencyKey,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal claim
  proposalCmd
    .command("claim <proposal_id>")
    .description("Claim a proposal (acquire lease)")
    .option("--duration <duration>", "Lease duration (e.g., 4h)")
    .option("--idempotency-key <key>", "Idempotency key")
    .action(async (proposalId, options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleClaim(ctx.project_id, proposalId, mcpClient, {
          duration: options.duration,
          idempotencyKey: options.idempotencyKey,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal release
  proposalCmd
    .command("release <proposal_id>")
    .description("Release a proposal lease (destructive)")
    .option("--reason <reason>", "Release reason")
    .option("--yes", "Skip confirmation")
    .option("--idempotency-key <key>", "Idempotency key")
    .action(async (proposalId, options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleRelease(
          ctx.project_id,
          proposalId,
          mcpClient,
          isTtyOutput(),
          {
            reason: options.reason,
            yes: options.yes,
            idempotencyKey: options.idempotencyKey,
          }
        );
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal transition
  proposalCmd
    .command("transition <proposal_id> <next_state>")
    .description("Transition proposal to a new state")
    .option("--reason <reason>", "Transition reason")
    .option("--idempotency-key <key>", "Idempotency key")
    .action(async (proposalId, nextState, options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleTransition(
          ctx.project_id,
          proposalId,
          nextState,
          mcpClient,
          {
            reason: options.reason,
            idempotencyKey: options.idempotencyKey,
          }
        );
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal maturity
  proposalCmd
    .command("maturity <proposal_id> <maturity>")
    .description("Set proposal maturity (new, active, mature, obsolete)")
    .option("--idempotency-key <key>", "Idempotency key")
    .action(async (proposalId, maturity, options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleMaturity(
          ctx.project_id,
          proposalId,
          maturity,
          mcpClient,
          {
            idempotencyKey: options.idempotencyKey,
          }
        );
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal depend
  proposalCmd
    .command("depend <proposal_id> <action>")
    .description("Manage dependencies (add, remove, resolve)")
    .option("--on <target>", "Dependency target")
    .option("--idempotency-key <key>", "Idempotency key")
    .action(async (proposalId, action, options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleDepend(ctx.project_id, proposalId, mcpClient, {
          action: action as any,
          on: options.on,
          idempotencyKey: options.idempotencyKey,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal ac
  proposalCmd
    .command("ac <action>")
    .description("Manage acceptance criteria (add, list, verify, delete)")
    .option("--proposal-id <id>", "Proposal ID")
    .option("--description <desc>", "AC description")
    .option("--verification-method <method>", "Verification method")
    .option("--ac-id <id>", "AC ID")
    .option("--verified", "Mark verified")
    .option("--notes <notes>", "Verification notes")
    .option("--yes", "Skip confirmation (for delete)")
    .option("--idempotency-key <key>", "Idempotency key")
    .action(async (action, options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleAc(ctx.project_id, mcpClient, isTtyOutput(), {
          action: action as any,
          proposalId: options.proposalId,
          description: options.description,
          verificationMethod: options.verificationMethod,
          acId: options.acId,
          verified: options.verified,
          notes: options.notes,
          idempotencyKey: options.idempotencyKey,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal review
  proposalCmd
    .command("review <proposal_id>")
    .description("Submit a review on a proposal")
    .option("--status <status>", "Review status")
    .option("--comment <comment>", "Review comment")
    .option("--idempotency-key <key>", "Idempotency key")
    .action(async (proposalId, options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleReview(ctx.project_id, proposalId, mcpClient, {
          status: options.status,
          comment: options.comment,
          idempotencyKey: options.idempotencyKey,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal discuss
  proposalCmd
    .command("discuss <proposal_id>")
    .description("Post a discussion message on a proposal")
    .option("--message <msg>", "Discussion message")
    .option("--stdin", "Read message from stdin")
    .option("--idempotency-key <key>", "Idempotency key")
    .action(async (proposalId, options) => {
      const ctx = await resolveContext(options);
      const mcpClient = getMcpClient(ctx.mcp_url);

      try {
        const result = await handleDiscuss(ctx.project_id, proposalId, mcpClient, {
          message: options.message,
          stdin: options.stdin,
          idempotencyKey: options.idempotencyKey,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });

  // proposal next
  proposalCmd
    .command("next")
    .description("Get highest-priority claimable proposal or top-5 ranked list")
    .option("--agent <agency>", "Filter by agent/agency")
    .option("--limit <limit>", "Limit results (for list)")
    .action(async (options) => {
      const ctx = await resolveContext(options);

      try {
        const result = await handleNext(ctx.project_id, {
          agent: options.agent,
          limit: options.limit ? parseInt(String(options.limit), 10) : undefined,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        if (err instanceof Error) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });
}
