/**
 * Health Checker — exposes runtime status for the Discord bridge.
 *
 * Provides a JSON health snapshot for monitoring and systemd watchdog.
 *
 * Zero LLM calls, zero token cost.
 */

import { query } from "../../infra/postgres/pool.ts";

export interface HealthStatus {
	status: "healthy" | "degraded" | "disconnected";
	connected: boolean;
	message_queue_length: number;
	last_heartbeat: string | null;
	failed_acks: number;
	channel_mappings: number;
	uptime_seconds: number;
}

export class HealthChecker {
	private startTime: number;
	private lastHeartbeat: Date | null = null;
	private wsConnected = false;
	private queueLength = 0;

	constructor() {
		this.startTime = Date.now();
	}

	setConnectionState(connected: boolean): void {
		this.wsConnected = connected;
	}

	recordHeartbeat(): void {
		this.lastHeartbeat = new Date();
	}

	setQueueLength(length: number): void {
		this.queueLength = length;
	}

	async checkHealth(): Promise<HealthStatus> {
		let failedAcks = 0;
		let channelMappings = 0;

		try {
			const ackResult = await query<{ count: string }>(
				`SELECT COUNT(*)::text as count
				 FROM roadmap.discord_message_ack
				 WHERE status = 'failed'`,
			);
			failedAcks = Number(ackResult.rows[0]?.count ?? 0);

			const mappingResult = await query<{ count: string }>(
				`SELECT COUNT(*)::text as count
				 FROM roadmap.discord_channel_mapping
				 WHERE enabled = true`,
			);
			channelMappings = Number(mappingResult.rows[0]?.count ?? 0);
		} catch {
			// DB might be unavailable — report degraded
		}

		const status: HealthStatus["status"] =
			!this.wsConnected
				? "disconnected"
				: failedAcks > 10
					? "degraded"
					: "healthy";

		return {
			status,
			connected: this.wsConnected,
			message_queue_length: this.queueLength,
			last_heartbeat: this.lastHeartbeat?.toISOString() ?? null,
			failed_acks: failedAcks,
			channel_mappings: channelMappings,
			uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
		};
	}
}
