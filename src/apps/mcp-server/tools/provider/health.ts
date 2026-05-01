import type {
	HealthEntry,
	HealthStatus,
} from "../../../../core/provider-health/cache.ts";
import { getCached } from "../../../../core/provider-health/cache.ts";
import { query as defaultQuery } from "../../../../infra/postgres/pool.ts";
import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";

type QueryFn = (
	text: string,
	params?: unknown[],
) => Promise<{ rows: unknown[] }>;

interface ProviderHealthRow {
	status: HealthStatus;
	latency_ms: number | null;
	checked_at: Date | string | number;
}

export interface ProviderHealthResponse {
	status: HealthStatus | "unknown";
	latencyMs?: number;
	stale?: true;
	checkedAt?: string;
}

function jsonResult(value: ProviderHealthResponse): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(value),
			},
		],
	};
}

function fromCache(entry: HealthEntry): ProviderHealthResponse {
	return {
		status: entry.status,
		latencyMs: entry.latencyMs,
		checkedAt: new Date(entry.checkedAt).toISOString(),
	};
}

function fromRow(row: ProviderHealthRow): ProviderHealthResponse {
	const checkedAt =
		row.checked_at instanceof Date
			? row.checked_at.toISOString()
			: new Date(row.checked_at).toISOString();
	return {
		status: row.status,
		latencyMs: row.latency_ms ?? undefined,
		stale: true,
		checkedAt,
	};
}

export async function getProviderHealth(
	args: Record<string, unknown>,
	options: {
		query?: QueryFn;
		getCachedEntry?: typeof getCached;
	} = {},
): Promise<ProviderHealthResponse> {
	const provider =
		typeof args.provider === "string" ? args.provider.trim() : "";
	const model = typeof args.model === "string" ? args.model.trim() : undefined;
	const getCachedEntry = options.getCachedEntry ?? getCached;
	const runQuery: QueryFn =
		options.query ??
		((text: string, params?: unknown[]) => defaultQuery(text, params));

	const cached = provider ? getCachedEntry(provider, model) : null;
	if (cached) {
		return fromCache(cached);
	}

	const params: unknown[] = [];
	const predicates: string[] = [];
	if (provider) {
		params.push(provider);
		predicates.push(`route_provider = $${params.length}`);
	}
	if (model) {
		params.push(model);
		predicates.push(`model_name = $${params.length}`);
	}
	const whereClause =
		predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";

	const { rows } = await runQuery(
		`SELECT status, latency_ms, checked_at
		   FROM roadmap.provider_health_log
		  ${whereClause}
		  ORDER BY checked_at DESC
		  LIMIT 1`,
		params,
	);

	const row = rows[0] as ProviderHealthRow | undefined;
	if (row) {
		return fromRow(row);
	}

	return { status: "unknown", stale: true };
}

export function registerProviderTools(server: McpServer): void {
	server.addTool({
		name: "provider_health",
		description:
			"Return cached provider health for a route_provider/model, falling back to the latest DB probe row.",
		inputSchema: {
			type: "object",
			properties: {
				provider: {
					type: "string",
					description: "route_provider to inspect",
				},
				model: {
					type: "string",
					description: "Optional model_name to inspect",
				},
			},
		},
		handler: async (args) => jsonResult(await getProviderHealth(args)),
	});
}
