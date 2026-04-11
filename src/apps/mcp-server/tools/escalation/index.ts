/**
 * MCP tools for P078: Escalation Management
 *
 * Handles logging and querying obstacle escalations via the escalation_log table.
 */

import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";
import { query } from "../../../../postgres/pool.ts";

const OBSTACLE_TYPES = [
	"BUDGET_EXHAUSTED",
	"LOOP_DETECTED",
	"CYCLE_DETECTED",
	"AGENT_DEAD",
	"PIPELINE_BLOCKED",
	"AC_GATE_FAILED",
	"DEPENDENCY_UNRESOLVED",
] as const;

type ObstacleType = (typeof OBSTACLE_TYPES)[number];

function textResult(text: string): CallToolResult {
	return { content: [{ type: "text", text }] };
}

function errorResult(msg: string, err: unknown): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: `${msg}: ${err instanceof Error ? err.message : String(err)}`,
			},
		],
	};
}

export function registerEscalationTools(server: McpServer): void {
	// P078: escalation_add — log a new obstacle escalation
	server.addTool({
		name: "escalation_add",
		description: "Log an obstacle escalation to the escalation matrix",
		inputSchema: {
			type: "object",
			properties: {
				obstacle_type: {
					type: "string",
					enum: OBSTACLE_TYPES as unknown as string[],
					description: "Type of obstacle",
				},
				proposal_id: { type: "string", description: "Related proposal ID" },
				agent_identity: { type: "string", description: "Agent that detected the obstacle" },
				escalated_to: { type: "string", description: "Target squad, role, or human operator" },
				severity: {
					type: "string",
					enum: ["low", "medium", "high", "critical"],
					description: "Severity level (default: medium)",
				},
			},
			required: ["obstacle_type", "escalated_to"],
		},
		handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
			try {
				const obstacleType = String(args.obstacle_type);
				if (!(OBSTACLE_TYPES as readonly string[]).includes(obstacleType)) {
					return textResult(`Invalid obstacle_type. Must be one of: ${OBSTACLE_TYPES.join(", ")}`);
				}

				const { rows } = await query(
					`INSERT INTO roadmap.escalation_log (obstacle_type, proposal_id, agent_identity, escalated_to, severity)
					 VALUES ($1, $2, $3, $4, $5)
					 RETURNING id, obstacle_type, escalated_to, escalated_at`,
					[
						obstacleType,
						typeof args.proposal_id === "string" ? args.proposal_id : null,
						typeof args.agent_identity === "string" ? args.agent_identity : null,
						String(args.escalated_to),
						typeof args.severity === "string" ? args.severity : "medium",
					],
				);

				const r = rows[0];
				return textResult(
					`Escalation logged: #${r.id} [${r.obstacle_type}] → ${r.escalated_to} at ${r.escalated_at}`,
				);
			} catch (err) {
				return errorResult("Failed to log escalation", err);
			}
		},
	});

	// P078: escalation_list — list escalations with optional filters
	server.addTool({
		name: "escalation_list",
		description: "List obstacle escalations, optionally filtered by type or resolution status",
		inputSchema: {
			type: "object",
			properties: {
				obstacle_type: { type: "string", description: "Filter by obstacle type" },
				unresolved_only: { type: "boolean", description: "Show only unresolved escalations (default: true)" },
				proposal_id: { type: "string", description: "Filter by proposal ID" },
			},
		},
		handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
			try {
				const conditions: string[] = [];
				const params: unknown[] = [];
				let paramIdx = 1;

				if (args.obstacle_type) {
					conditions.push(`obstacle_type = $${paramIdx++}`);
					params.push(String(args.obstacle_type));
				}

				if (args.unresolved_only !== false) {
					conditions.push("resolved_at IS NULL");
				}

				if (args.proposal_id) {
					conditions.push(`proposal_id = $${paramIdx++}`);
					params.push(String(args.proposal_id));
				}

				const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

				const { rows } = await query(
					`SELECT id, obstacle_type, proposal_id, agent_identity, escalated_to,
					        escalated_at, resolved_at, resolution_note, severity
					 FROM roadmap.escalation_log ${where}
					 ORDER BY escalated_at DESC
					 LIMIT 50`,
					params,
				);

				if (!rows.length) {
					return textResult("No escalations found.");
				}

				const lines = rows.map((r: any) => {
					const status = r.resolved_at ? `RESOLVED (${r.resolved_at})` : "OPEN";
					return `#${r.id} [${r.severity}] ${r.obstacle_type} → ${r.escalated_to} | ${status} | proposal: ${r.proposal_id || "none"} | agent: ${r.agent_identity || "none"}`;
				});

				return textResult(`Escalations (${rows.length}):\n${lines.join("\n")}`);
			} catch (err) {
				return errorResult("Failed to list escalations", err);
			}
		},
	});

	// P078: escalation_resolve — mark an escalation as resolved
	server.addTool({
		name: "escalation_resolve",
		description: "Mark an escalation as resolved with a resolution note",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "number", description: "Escalation ID to resolve" },
				resolution_note: { type: "string", description: "How the escalation was resolved" },
			},
			required: ["id"],
		},
		handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
			try {
				const { rows } = await query(
					`UPDATE roadmap.escalation_log
					 SET resolved_at = now(), resolution_note = $1
					 WHERE id = $2 AND resolved_at IS NULL
					 RETURNING id, obstacle_type, escalated_to`,
					[
						typeof args.resolution_note === "string" ? args.resolution_note : "Resolved",
						Number(args.id),
					],
				);

				if (!rows.length) {
					return textResult(`Escalation #${args.id} not found or already resolved.`);
				}

				const r = rows[0];
				return textResult(`Escalation #${r.id} [${r.obstacle_type}] resolved.`);
			} catch (err) {
				return errorResult("Failed to resolve escalation", err);
			}
		},
	});

	// P078: escalation_stats — get escalation statistics
	server.addTool({
		name: "escalation_stats",
		description: "Get escalation statistics: open/resolved counts by type",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler: async (): Promise<CallToolResult> => {
			try {
				const { rows } = await query(
					`SELECT obstacle_type,
					        COUNT(*) AS total,
					        COUNT(*) FILTER (WHERE resolved_at IS NULL) AS open,
					        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved
					 FROM roadmap.escalation_log
					 GROUP BY obstacle_type
					 ORDER BY total DESC`,
				);

				if (!rows.length) {
					return textResult("No escalations recorded.");
				}

				const lines = rows.map(
					(r: any) => `${r.obstacle_type}: ${r.total} total, ${r.open} open, ${r.resolved} resolved`,
				);

				return textResult(`Escalation Statistics:\n${lines.join("\n")}`);
			} catch (err) {
				return errorResult("Failed to get escalation stats", err);
			}
		},
	});
}
