/**
 * P674 transport registry. Maps transport name (DB string) → adapter.
 *
 * Adding a transport: write the adapter, register it here. The router never
 * names a transport directly; it looks up by `notification_route.transport`.
 */

import { discordWebhookTransport } from "./transports/discord-webhook.ts";
import { inAppTransport } from "./transports/in-app.ts";
import { logOnlyTransport } from "./transports/log-only.ts";
import { mcpAgentTransport } from "./transports/mcp-agent.ts";
import type { NotificationTransport } from "./types.ts";

const TRANSPORTS: Map<string, NotificationTransport> = new Map([
	[discordWebhookTransport.name, discordWebhookTransport],
	[inAppTransport.name, inAppTransport],
	[logOnlyTransport.name, logOnlyTransport],
	[mcpAgentTransport.name, mcpAgentTransport],
]);

export function resolveTransport(name: string): NotificationTransport | null {
	return TRANSPORTS.get(name) ?? null;
}

export function listTransports(): string[] {
	return Array.from(TRANSPORTS.keys());
}

/**
 * Test-only override. Not used in production code paths.
 */
export function registerTransportForTest(
	t: NotificationTransport,
): () => void {
	const previous = TRANSPORTS.get(t.name);
	TRANSPORTS.set(t.name, t);
	return () => {
		if (previous) TRANSPORTS.set(t.name, previous);
		else TRANSPORTS.delete(t.name);
	};
}
