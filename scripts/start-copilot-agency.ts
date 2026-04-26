/**
 * Copilot Agency — OfferProvider for the GitHub Copilot CLI.
 *
 * Registers as "copilot/agency-gary" in agent_registry and listens on the
 * work_offers Postgres channel. When the orchestrator or gate-pipeline posts
 * a job, this process races to claim it and spawns:
 *
 *   copilot -p "<task>" --yolo --model <model>
 *
 * The binary path comes from model_routes.cli_path (DB), so no path is
 * hardcoded here or in the service unit.
 *
 * Usage:
 *   node --import jiti/register scripts/start-copilot-agency.ts
 */

import { hostname } from "node:os";
import { spawnAgent, resolveActiveRouteProvider } from "../src/core/orchestration/agent-spawner.ts";
import { OfferProvider } from "../src/core/pipeline/offer-provider.ts";
import { closePool, getPool } from "../src/infra/postgres/pool.ts";
import {
	liaisonRegister,
	liaisonHeartbeat,
	endLiaisonSession,
} from "../src/infra/agency/liaison-service.ts";
import { runWatchdogCycle } from "../src/infra/agency/stuck-detection.ts";

const agentIdentity =
	process.env.AGENTHIVE_AGENT_IDENTITY ?? `copilot/agency-${hostname()}`;

const offerProvider = new OfferProvider({
	agentIdentity,
	leaseTtlSeconds: Number(process.env.AGENTHIVE_LEASE_TTL_SECONDS ?? "60"),
	renewIntervalMs: Number(process.env.AGENTHIVE_RENEW_INTERVAL_MS ?? "15000"),
	pollIntervalMs: Number(process.env.AGENTHIVE_OFFER_POLL_MS ?? "20000"),
	maxConcurrent: Number(process.env.AGENTHIVE_MAX_CONCURRENT ?? "2"),
	connectListener: async () => getPool().connect(),
	spawnFn: async (req) => {
		// Extract provider prefix from identity (e.g. "copilot/agency-gary" → "copilot")
		// Falls back to active DB route if identity prefix is not a known provider.
		const identityPrefix = agentIdentity.split("/")[0];
		const provider = identityPrefix || (await resolveActiveRouteProvider()) || "copilot";
		return spawnAgent({
			worktree: req.worktree,
			task: req.task,
			proposalId: typeof req.proposalId === "number" ? req.proposalId : undefined,
			stage: req.stage,
			model: req.model,
			timeoutMs: req.timeoutMs,
			agentLabel: req.agentLabel,
			provider: provider as any,
		});
	},
});

let sessionId: string | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let watchdogTimer: NodeJS.Timeout | null = null;

async function main() {
	console.log(`[CopilotAgency] Starting as ${agentIdentity} ...`);

	const pool = getPool();
	await pool.query("SELECT 1");
	console.log("[CopilotAgency] Database connection verified");

	// Register agency with liaison service (P464)
	try {
		const { display_name } = parseAgentIdentity(agentIdentity);
		const { session_id } = await liaisonRegister({
			agency_id: agentIdentity,
			display_name,
			provider: "copilot",
			host_id: hostname(),
			capabilities: ["copilot", "agent-spawner"],
			metadata: { version: "1.0", pid: process.pid },
		});
		sessionId = session_id;
		console.log(`[CopilotAgency] Registered liaison session: ${sessionId}`);

		// Start heartbeat timer (every 30s)
		heartbeatTimer = setInterval(async () => {
			try {
				const result = await liaisonHeartbeat({
					session_id: sessionId!,
					status: "active",
				});
				if (!result.heartbeat_ok) {
					console.warn(
						`[CopilotAgency] Heartbeat failed: ${result.message}`,
					);
				}
			} catch (err) {
				console.error("[CopilotAgency] Heartbeat error:", err);
			}
		}, 30_000);

		// Start watchdog timer (every 60s) to detect stuck offers
		watchdogTimer = setInterval(async () => {
			try {
				const result = await runWatchdogCycle();
				if (result.checked > 0 || result.marked_dormant > 0) {
					console.log(`[CopilotAgency] Watchdog: ${result.checked} checked, ${result.marked_dormant} dormant`);
				}
			} catch (err) {
				console.error("[CopilotAgency] Watchdog error:", err);
			}
		}, 60_000);
	} catch (err) {
		console.error("[CopilotAgency] Failed to register liaison session:", err);
		// Continue anyway; legacy behavior is fallback
	}

	for (const sig of ["SIGTERM", "SIGINT"] as const) {
		process.on(sig, async () => {
			console.log(`[CopilotAgency] ${sig} — draining in-flight claims...`);

			// Clear timers
			if (heartbeatTimer) clearInterval(heartbeatTimer);
			if (watchdogTimer) clearInterval(watchdogTimer);

			// End liaison session
			if (sessionId) {
				try {
					await endLiaisonSession(sessionId, `${sig.toLowerCase()}`);
				} catch (err) {
					console.error(
						`[CopilotAgency] Failed to end liaison session:`,
						err,
					);
				}
			}

			await offerProvider.stop();
			await offerProvider.waitForIdle(30_000);
			await closePool();
			process.exit(0);
		});
	}

	await offerProvider.run();
	console.log(`[CopilotAgency] ${agentIdentity} listening for work offers`);
}

/**
 * Parse agent identity "copilot/agency-gary" → { display_name: "agency-gary" }
 */
function parseAgentIdentity(identity: string): { display_name: string } {
	const parts = identity.split("/");
	return {
		display_name: parts[1] || identity,
	};
}

main().catch((err) => {
	console.error("[CopilotAgency] Fatal:", err);
	process.exit(1);
});
