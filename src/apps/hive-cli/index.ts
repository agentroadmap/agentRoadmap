#!/usr/bin/env node

/**
 * hive CLI - Composition root
 *
 * Wires up Commander program with global flags and domains.
 * Per cli-hive-contract.md, every command supports:
 * - --format text|json|jsonl|yaml|sarif
 * - --quiet
 * - --explain (show context + timing)
 * - --yes / --really-yes (for destructive operations)
 * - --idempotency-key (for mutations)
 * - --limit, --cursor (for pagination)
 * - --filter, --fields, --include (for refinement)
 * - --schema (for discovery)
 *
 * Domain modules (domains/*) register their commands via program.command().
 */

import { program } from "commander";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, "../../../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const version = packageJson.version;
import {
  Errors,
  HiveError,
  resolveContext,
  successEnvelope,
  errorEnvelope,
  detectDefaultFormat,
  shouldDisableColor,
  isTtyOutput,
  getFullSchema,
  getAllRecipes,
  formatRecipesAsJsonl,
} from "./common/index";
import type { OutputFormat } from "./common/formatters";
import { register as registerProposal } from "./domains/proposal/index";
import { register as registerWorkflow } from "./domains/workflow/index";
import { register as registerProject } from "./domains/project/index";
import { register as registerAgency } from "./domains/agency/index";
import { register as registerWorker } from "./domains/worker/index";
import { register as registerLease } from "./domains/lease/index";
import { register as registerProvider } from "./domains/provider/index";
import { register as registerModel } from "./domains/model/index";
import { register as registerRoute } from "./domains/route/index";
import { register as registerBudget } from "./domains/budget/index";
import { register as registerContextPolicy } from "./domains/context-policy/index";
import { register as registerSystem } from "./domains/system/index";
import { register as registerAudit } from "./domains/audit/index";
import { register as registerStop } from "./domains/stop/index";
import { register as registerDispatch } from "./domains/dispatch/index";
import { register as registerScan } from "./domains/scan/index";
import { register as registerLint } from "./domains/lint/index";
import { register as registerKnowledge } from "./domains/knowledge/index";
import { register as registerMeta } from "./domains/meta/index";

/**
 * Main entry point.
 */
async function main() {
  const startTime = Date.now();
  let command = "hive";

  try {
    // Configure program
    program
      .name("hive")
      .description("AgentHive CLI - Control plane operations")
      .version(version)
      .option(
        "-p, --project <slug>",
        "Project slug (overrides env HIVE_PROJECT)"
      )
      .option(
        "-a, --agency <identity>",
        "Agency identity (overrides env HIVE_AGENCY)"
      )
      .option(
        "-h, --host <hostname>",
        "Host (overrides env HIVE_HOST)"
      )
      .option(
        "-o, --format <format>",
        "Output format: text, json, jsonl, yaml, sarif",
        (value) => {
          if (!["text", "json", "jsonl", "yaml", "sarif"].includes(value)) {
            throw Errors.usage(
              `Invalid format: ${value}. Valid: text, json, jsonl, yaml, sarif`
            );
          }
          return value as OutputFormat;
        }
      )
      .option("-q, --quiet", "Suppress output (exit code only)")
      .option("--explain", "Show resolved context and timing")
      .option("--yes", "Skip confirmation prompts")
      .option("--really-yes", "Skip confirmation for panic operations")
      .option(
        "--idempotency-key <uuid>",
        "Idempotency key for mutations (prevents duplicate work)"
      )
      .option("--limit <number>", "Pagination limit (default: 20)")
      .option("--cursor <token>", "Pagination cursor")
      .option("--filter <expr>", "Filter expression (command-specific)")
      .option("--fields <names>", "Comma-separated field names to include")
      .option(
        "--include <relations>",
        "Expand relations (repeatable, e.g. --include leases --include ac)"
      )
      .option("--schema", "Show schema for this command and exit");

    // Global --schema flag (shows full CLI schema)
    program.option("--recipes", "Show curated multi-step workflows and exit");

    // Handle --schema and --recipes early
    program.hook("preAction", async (thisCommand) => {
      const opts = thisCommand.optsWithGlobals?.();
      if (opts?.schema && !thisCommand.name()) {
        // Global --schema: show full CLI schema
        const schema = getFullSchema(version);
        const format = opts.format || detectDefaultFormat(isTtyOutput());
        const ctx = {
          resolved_at: new Date().toISOString(),
        };
        const elapsed = Date.now() - startTime;
        const envelope = successEnvelope(schema, "hive --schema", ctx, {
          elapsed_ms: elapsed,
        });
        console.log(JSON.stringify(envelope, null, 2));
        process.exit(0);
      }
      if (opts?.recipes) {
        // Global --recipes: show all recipes as JSONL
        const recipes = getAllRecipes();
        const ctx = {
          resolved_at: new Date().toISOString(),
        };
        const elapsed = Date.now() - startTime;
        const envelope = successEnvelope(recipes, "hive --recipes", ctx, {
          elapsed_ms: elapsed,
        });
        console.log(JSON.stringify(envelope, null, 2));
        process.exit(0);
      }
    });

    // Fallback handler (no subcommand matched)
    program.action(async () => {
      const elapsed = Date.now() - startTime;
      const ctx = { resolved_at: new Date().toISOString() };
      const helpText =
        "Run 'hive --help' for usage. Run 'hive help <topic>' for more info.";
      const envelope = successEnvelope(helpText, "hive", ctx, {
        elapsed_ms: elapsed,
      });
      console.log(JSON.stringify(envelope, null, 2));
      process.exit(0);
    });

    // Register domains
    registerProposal(program);
    registerWorkflow(program);
    registerProject(program);
    registerAgency(program);
    registerWorker(program);
    registerLease(program);
    registerProvider(program);
    registerModel(program);
    registerRoute(program);
    registerBudget(program);
    registerContextPolicy(program);
    registerSystem(program);
    registerAudit(program);
    registerStop(program);
    registerDispatch(program);
    registerScan(program);
    registerLint(program);
    registerKnowledge(program);
    registerMeta(program);

    // Parse and execute
    await program.parseAsync(process.argv);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    let hiveError: HiveError;

    if (err instanceof HiveError) {
      hiveError = err;
    } else if (err instanceof Error) {
      hiveError = Errors.internal(err.message, {
        original_error: err.name,
        stack: err.stack?.split("\n").slice(0, 3),
      });
    } else {
      hiveError = Errors.internal(String(err));
    }

    const ctx = {
      resolved_at: new Date().toISOString(),
    };
    const envelope = errorEnvelope(hiveError, command, ctx, {
      elapsed_ms: elapsed,
    });

    if (!process.argv.includes("--quiet")) {
      console.error(JSON.stringify(envelope, null, 2));
    }

    process.exit(hiveError.exitCode);
  }
}

// Run if called as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(99);
  });
}

export { program };
