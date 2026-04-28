/**
 * log_only transport — writes the envelope to stderr. Always succeeds.
 *
 * Seeded as a backstop for severity=CRITICAL kinds so a misconfigured Discord
 * webhook can never silently swallow an alert.
 */

import type {
	DispatchArgs,
	NotificationTransport,
} from "../types.ts";

export const logOnlyTransport: NotificationTransport = {
	name: "log_only",
	async send({ envelope, route }: DispatchArgs): Promise<void> {
		const line = JSON.stringify({
			t: "notification",
			at: new Date().toISOString(),
			route_id: route.id,
			queue_id: envelope.queueId,
			severity: envelope.severity,
			kind: envelope.kind,
			proposal_id: envelope.proposalId,
			title: envelope.title,
			body: envelope.body.slice(0, 500),
			payload: envelope.payload,
		});
		console.error(`[notification] ${line}`);
	},
};
