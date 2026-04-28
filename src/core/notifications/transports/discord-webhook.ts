/**
 * discord_webhook transport.
 *
 * Resolves webhook URL in this order:
 *   1. route.target (operator-set per-route override)
 *   2. process.env.DISCORD_WEBHOOK_URL (global default)
 *
 * Body shape mirrors the existing agent-spawner escalation format so the
 * migration from hardcoded `channel='discord'` is observably equivalent.
 */

import type {
	DispatchArgs,
	NotificationTransport,
} from "../types.ts";
import { TransportError } from "../types.ts";

const SEVERITY_EMOJI: Record<string, string> = {
	INFO: "ℹ️",
	ALERT: "⚠️",
	URGENT: "🟠",
	CRITICAL: "🔴",
};

export const discordWebhookTransport: NotificationTransport = {
	name: "discord_webhook",
	async send({ envelope, route }: DispatchArgs): Promise<void> {
		const webhook = route.target ?? process.env.DISCORD_WEBHOOK_URL;
		if (!webhook) {
			throw new TransportError(
				"discord_webhook",
				"missing target",
				"discord_webhook: no route.target and DISCORD_WEBHOOK_URL unset",
			);
		}

		const emoji = SEVERITY_EMOJI[envelope.severity] ?? "❔";
		const proposalSuffix = envelope.proposalId !== null
			? ` (P${envelope.proposalId})`
			: "";
		const content = [
			`${emoji} **[${envelope.severity}]** \`${envelope.kind}\`${proposalSuffix}`,
			`**${envelope.title}**`,
			"```",
			envelope.body.slice(0, 1500),
			"```",
		].join("\n");

		let response: Response;
		try {
			response = await fetch(webhook, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content }),
				signal: AbortSignal.timeout(10_000),
			});
		} catch (err) {
			throw new TransportError("discord_webhook", err);
		}

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new TransportError(
				"discord_webhook",
				`${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
			);
		}
	},
};
