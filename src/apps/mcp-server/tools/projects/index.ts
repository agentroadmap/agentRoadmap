/**
 * Project Registry Tools Registration (P482 Phase 1)
 *
 * Registers `set_project` and `list_projects` handlers with the MCP server.
 */

import type { McpServer } from "../../server.ts";
import type { CallToolResult, McpToolHandler } from "../../types.ts";
import { setProject, listProjects } from "./handlers.ts";

export function registerProjectTools(server: McpServer): void {
	server.addTool({
		name: "project_set",
		description:
			"Set the current project context. Accepts project slug or numeric id. Returns {ok, project, scope}.",
		inputSchema: {
			type: "object",
			properties: {
				project: {
					type: "string",
					description:
						"Project slug (e.g. 'agenthive', 'audiobook') or numeric id (e.g. '1')",
				},
				sessionId: {
					type: "string",
					description:
						"(Optional) SSE session id for per-session binding. If omitted, binding is process-wide.",
				},
			},
			required: ["project"],
		},
		async handler(args: Record<string, unknown>): Promise<CallToolResult> {
			return setProject({
				project: args.project as string | undefined,
				sessionId: args.sessionId as string | undefined,
			});
		},
	} as McpToolHandler);

	server.addTool({
		name: "project_list",
		description:
			"List all projects (or active only). Returns {total, returned, truncated, limit, items[]}.",
		inputSchema: {
			type: "object",
			properties: {
				include_archived: {
					type: "boolean",
					description:
						"Include archived projects in the list. Default: false (active only).",
				},
				limit: {
					type: "number",
					description: "Max results to return. Default: 50. Max: 500.",
				},
			},
		},
		async handler(args: Record<string, unknown>): Promise<CallToolResult> {
			return listProjects({
				include_archived: args.include_archived as boolean | undefined,
				limit: args.limit as number | undefined,
			});
		},
	} as McpToolHandler);
}
