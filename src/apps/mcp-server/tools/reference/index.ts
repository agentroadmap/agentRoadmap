/**
 * P187: Reference Catalog MCP Tools
 *
 * ref_list_domains  — list all registered vocabulary domains
 * ref_list_terms    — list active terms for a domain
 * ref_add_term      — insert a new term (admin operation)
 * ref_get_term      — fetch a single term with metadata
 */

import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";
import { query } from "../../../../postgres/pool.ts";

function textResult(text: string): CallToolResult {
	return { content: [{ type: "text", text }] };
}

function jsonResult(data: unknown): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(msg: string, err: unknown): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: `⚠️ ${msg}: ${err instanceof Error ? err.message : String(err)}`,
			},
		],
	};
}

export function registerReferenceTools(server: McpServer): void {
	// ref_list_domains — returns all registered domains with metadata
	server.addTool({
		name: "ref_list_domains",
		description: "List all registered reference vocabulary domains with metadata",
		inputSchema: {
			type: "object",
			properties: {
				owner_scope: {
					type: "string",
					enum: ["global", "workflow", "proposal_type"],
					description: "Filter by owner scope (optional)",
				},
			},
		},
		handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
			try {
				const params: unknown[] = [];
				let where = "";
				if (typeof args.owner_scope === "string") {
					where = "WHERE owner_scope = $1";
					params.push(args.owner_scope);
				}

				const { rows } = await query(
					`SELECT domain_key, label, description, value_kind, owner_scope, is_extensible, created_at
					 FROM roadmap.reference_domain
					 ${where}
					 ORDER BY domain_key`,
					params,
				);

				return jsonResult({ domains: rows, count: rows.length });
			} catch (err) {
				return errorResult("Failed to list domains", err);
			}
		},
	});

	// ref_list_terms — returns active terms for a domain
	server.addTool({
		name: "ref_list_terms",
		description: "List all active terms for a reference vocabulary domain",
		inputSchema: {
			type: "object",
			properties: {
				domain_key: {
					type: "string",
					description: "Domain key to list terms for",
				},
				include_inactive: {
					type: "boolean",
					description: "Include inactive terms (default: false)",
				},
			},
			required: ["domain_key"],
		},
		handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
			try {
				const domainKey = String(args.domain_key);
				const includeInactive = args.include_inactive === true;

				const activeFilter = includeInactive ? "" : "AND t.is_active = true";

				const { rows } = await query(
					`SELECT t.domain_key, t.term_key, t.label, t.description,
					        t.ordinal, t.rank_value, t.is_active, t.metadata, t.created_at, t.modified_at
					 FROM roadmap.reference_term t
					 WHERE t.domain_key = $1 ${activeFilter}
					 ORDER BY t.ordinal NULLS LAST, t.term_key`,
					[domainKey],
				);

				if (!rows.length) {
					const { rows: domainRows } = await query(
						"SELECT domain_key FROM roadmap.reference_domain WHERE domain_key = $1",
						[domainKey],
					);
					if (!domainRows.length) {
						return textResult(`Unknown domain: '${domainKey}'`);
					}
					return jsonResult({ domain_key: domainKey, terms: [], count: 0 });
				}

				return jsonResult({ domain_key: domainKey, terms: rows, count: rows.length });
			} catch (err) {
				return errorResult("Failed to list terms", err);
			}
		},
	});

	// ref_add_term — insert a new term into a domain
	server.addTool({
		name: "ref_add_term",
		description: "Insert a new term into a reference vocabulary domain",
		inputSchema: {
			type: "object",
			properties: {
				domain_key: { type: "string", description: "Target domain key" },
				term_key: {
					type: "string",
					description: "Term key (lowercase letters, digits, underscores only)",
				},
				label: { type: "string", description: "Human-readable label" },
				description: { type: "string", description: "Optional description" },
				ordinal: { type: "number", description: "Optional sort ordinal" },
				rank_value: { type: "number", description: "Optional numeric rank value" },
				metadata: { type: "object", description: "Optional metadata JSON object" },
			},
			required: ["domain_key", "term_key", "label"],
		},
		handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
			try {
				const domainKey = String(args.domain_key);
				const termKey = String(args.term_key);
				const label = String(args.label);

				if (!/^[a-z][a-z0-9_]*$/.test(termKey)) {
					return textResult(
						`Invalid term_key '${termKey}': must match ^[a-z][a-z0-9_]*$ (lowercase start, letters/digits/underscores only)`,
					);
				}

				const { rows } = await query(
					`INSERT INTO roadmap.reference_term
					   (domain_key, term_key, label, description, ordinal, rank_value, metadata)
					 VALUES ($1, $2, $3, $4, $5, $6, $7)
					 ON CONFLICT (domain_key, term_key) DO UPDATE
					   SET label = EXCLUDED.label,
					       description = COALESCE(EXCLUDED.description, reference_term.description),
					       ordinal = COALESCE(EXCLUDED.ordinal, reference_term.ordinal),
					       rank_value = COALESCE(EXCLUDED.rank_value, reference_term.rank_value),
					       metadata = EXCLUDED.metadata,
					       modified_at = now()
					 RETURNING domain_key, term_key, label, is_active, created_at`,
					[
						domainKey,
						termKey,
						label,
						typeof args.description === "string" ? args.description : null,
						typeof args.ordinal === "number" ? args.ordinal : null,
						typeof args.rank_value === "number" ? args.rank_value : null,
						args.metadata && typeof args.metadata === "object"
							? JSON.stringify(args.metadata)
							: "{}",
					],
				);

				const r = rows[0];
				return textResult(
					`Term added: ${r.domain_key}/${r.term_key} — "${r.label}" (active: ${r.is_active})`,
				);
			} catch (err) {
				return errorResult("Failed to add term", err);
			}
		},
	});

	// ref_get_term — fetch a single term with full metadata
	server.addTool({
		name: "ref_get_term",
		description: "Fetch a single reference term with full metadata",
		inputSchema: {
			type: "object",
			properties: {
				domain_key: { type: "string", description: "Domain key" },
				term_key: { type: "string", description: "Term key" },
			},
			required: ["domain_key", "term_key"],
		},
		handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
			try {
				const { rows } = await query(
					`SELECT t.domain_key, t.term_key, t.label, t.description,
					        t.ordinal, t.rank_value, t.is_active, t.metadata, t.created_at, t.modified_at,
					        d.label AS domain_label, d.owner_scope, d.is_extensible
					 FROM roadmap.reference_term t
					 JOIN roadmap.reference_domain d USING (domain_key)
					 WHERE t.domain_key = $1 AND t.term_key = $2`,
					[String(args.domain_key), String(args.term_key)],
				);

				if (!rows.length) {
					return textResult(`Term not found: ${args.domain_key}/${args.term_key}`);
				}

				return jsonResult(rows[0]);
			} catch (err) {
				return errorResult("Failed to get term", err);
			}
		},
	});
}
