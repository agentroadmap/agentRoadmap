/**
 * Message Formatter — converts AgentHive A2A messages to Discord embeds.
 *
 * Maps message types to embed colors, truncates content to Discord limits,
 * and includes metadata fields for traceability.
 *
 * Zero LLM calls, zero token cost.
 */

export interface AgentiveMessage {
	id: string | number;
	channel: string;
	from_agent: string;
	to_agent?: string | null;
	message_content: string;
	message_type?: string | null;
	proposal_id?: string | number | null;
	title?: string | null;
	created_at: string | Date;
}

export interface DiscordEmbed {
	title?: string;
	description: string;
	color: number;
	fields: Array<{ name: string; value: string; inline?: boolean }>;
	footer?: { text: string };
	timestamp?: string;
}

// Embed colors by message type (hex → int)
const TYPE_COLORS: Record<string, number> = {
	escalation: 0xff0000, // Red
	gate_decision: 0x0000ff, // Blue
	gate_ready: 0x00aaff, // Light blue
	status: 0x00ff00, // Green
	report: 0x00ff00, // Green
	error: 0xff6600, // Orange
	sos: 0xff0000, // Red
	decision: 0xffaa00, // Gold
	ask: 0x9966ff, // Purple
	task: 0x808080, // Gray
	reply: 0x808080, // Gray
};

const DISCORD_EMBED_DESC_LIMIT = 4096;
const DISCORD_FIELD_VALUE_LIMIT = 1024;

function truncate(str: string, limit: number): string {
	if (str.length <= limit) return str;
	return str.slice(0, limit - 3) + "...";
}

function getColorForType(type: string | null | undefined): number {
	if (!type) return 0x808080;
	return TYPE_COLORS[type] ?? 0x808080;
}

/**
 * Convert an AgentHive A2A message to a Discord embed object.
 */
export function formatMessageEmbed(msg: AgentiveMessage): DiscordEmbed {
	const fields: DiscordEmbed["fields"] = [
		{ name: "From", value: msg.from_agent, inline: true },
		{ name: "Channel", value: msg.channel, inline: true },
	];

	if (msg.to_agent) {
		fields.push({ name: "To", value: msg.to_agent, inline: true });
	}

	if (msg.proposal_id) {
		fields.push({
			name: "Proposal",
			value: String(msg.proposal_id),
			inline: true,
		});
	}

	const ts =
		msg.created_at instanceof Date
			? msg.created_at.toISOString()
			: new Date(msg.created_at).toISOString();

	fields.push({
		name: "Time",
		value: ts,
		inline: false,
	});

	const embed: DiscordEmbed = {
		description: truncate(
			msg.message_content,
			DISCORD_EMBED_DESC_LIMIT,
		),
		color: getColorForType(msg.message_type),
		fields,
		footer: { text: `ID: ${msg.id}` },
		timestamp: ts,
	};

	if (msg.title) {
		embed.title = truncate(msg.title, 256);
	} else if (msg.message_type) {
		embed.title = msg.message_type.toUpperCase();
	}

	return embed;
}

/**
 * Format a simple text notification (pg_notify style) to a Discord embed.
 */
export function formatNotificationEmbed(
	from: string,
	message: string,
	level: "info" | "success" | "warning" | "error" = "info",
): DiscordEmbed {
	const levelColors: Record<string, number> = {
		info: 0x3498db,
		success: 0x2ecc71,
		warning: 0xf39c12,
		error: 0xe74c3c,
	};

	return {
		description: truncate(message, DISCORD_EMBED_DESC_LIMIT),
		color: levelColors[level] ?? 0x808080,
		fields: [{ name: "From", value: from, inline: true }],
		timestamp: new Date().toISOString(),
	};
}
