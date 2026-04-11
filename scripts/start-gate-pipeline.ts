/**
 * Startup script for the PipelineCron gate worker.
 * 
 * This runs as a systemd service (hermes-gate-pipeline.service)
 * to process the transition_queue and enforce state machine transitions.
 * 
 * The gate pipeline:
 * 1. Listens for pg_notify events on proposal_gate_ready, transition_queued
 * 2. Processes the transition_queue table for approved transitions
 * 3. Spawns agents for proposals that have been approved to advance
 * 4. Falls back to 30-second polling if notifications are missed
 */

import { PipelineCron } from "../src/core/pipeline/pipeline-cron.ts";
import { getPool } from "../src/infra/postgres/pool.ts";

const logger = {
  log: (...args: unknown[]) => console.log("[GatePipeline]", ...args),
  warn: (...args: unknown[]) => console.warn("[GatePipeline]", ...args),
  error: (...args: unknown[]) => console.error("[GatePipeline]", ...args),
};

async function main() {
  logger.log("Starting PipelineCron gate worker...");

  // Ensure database connection is available
  const pool = getPool();
  const client = await pool.connect();
  logger.log("Database connection established");
  client.release();

  // Create and start PipelineCron
  const cron = new PipelineCron({
    logger,
    pollIntervalMs: 30_000,
    batchSize: 10,
  });

  await cron.start();
  logger.log("PipelineCron started successfully");
  logger.log("Listening for pg_notify events on: proposal_gate_ready, transition_queued, proposal_maturity_changed");
  logger.log("Fallback polling every 30 seconds");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await cron.stop();
      logger.log("PipelineCron stopped");
    } catch (err) {
      logger.error("Error during shutdown:", err);
    }
    pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception:", err);
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection:", reason);
  });
}

main().catch((err) => {
  console.error("[GatePipeline] Fatal error during startup:", err);
  process.exit(1);
});
