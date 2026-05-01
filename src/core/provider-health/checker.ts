import { query as defaultQuery } from "../../infra/postgres/pool.ts";
import { type HealthEntry, type HealthStatus, setCached } from "./cache.ts";

export const DEFAULT_CHECK_INTERVAL_MS = 30_000;
export const DEFAULT_PROBE_TIMEOUT_MS = 500;

export interface ProviderHealthRoute {
	routeProvider: string;
	modelName: string | null;
	baseUrl: string | null;
	apiSpec?: string | null;
}

export interface ProbeResult {
	status: HealthStatus;
	latencyMs?: number;
	httpStatus?: number;
	errorDetail?: string;
}

export type ProviderHealthProbe = (
	route: ProviderHealthRoute,
	timeoutMs: number,
) => Promise<ProbeResult>;

type QueryFn = (
	text: string,
	params?: unknown[],
) => Promise<{ rows: unknown[] }>;

interface CheckerOptions {
	query?: QueryFn;
	probe?: ProviderHealthProbe;
	checkIntervalMs?: number;
	probeTimeoutMs?: number;
	now?: () => number;
	onError?: (error: unknown) => void;
}

interface RouteRow {
	route_provider: string;
	model_name: string | null;
	base_url: string | null;
	api_spec: string | null;
}

let singletonChecker: HealthChecker | undefined;

export class HealthChecker {
	private timer: NodeJS.Timeout | undefined;
	private running = false;
	private readonly query: QueryFn;
	private readonly probe: ProviderHealthProbe;
	private readonly checkIntervalMs: number;
	private readonly probeTimeoutMs: number;
	private readonly now: () => number;
	private readonly onError: (error: unknown) => void;

	constructor(options: CheckerOptions = {}) {
		this.query =
			options.query ??
			((text: string, params?: unknown[]) => defaultQuery(text, params));
		this.probe = options.probe ?? defaultProbe;
		this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
		this.probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
		this.now = options.now ?? (() => Date.now());
		this.onError =
			options.onError ?? ((error) => console.error("[ProviderHealth]", error));
	}

	start(): void {
		if (this.timer) return;
		void this.runOnce();
		this.timer = setInterval(() => void this.runOnce(), this.checkIntervalMs);
		this.timer.unref?.();
	}

	stop(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = undefined;
	}

	async runOnce(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			const routes = await this.loadRoutes();
			await Promise.allSettled(routes.map((route) => this.checkRoute(route)));
		} catch (error) {
			this.onError(error);
		} finally {
			this.running = false;
		}
	}

	private async loadRoutes(): Promise<ProviderHealthRoute[]> {
		const { rows } = await this.query(
			`SELECT route_provider, model_name, base_url, api_spec
			   FROM roadmap.model_routes
			  WHERE is_enabled = true`,
		);
		return (rows as RouteRow[]).map((row) => ({
			routeProvider: row.route_provider,
			modelName: row.model_name,
			baseUrl: row.base_url,
			apiSpec: row.api_spec,
		}));
	}

	private async checkRoute(route: ProviderHealthRoute): Promise<void> {
		const result = await this.probe(route, this.probeTimeoutMs).catch(
			(error): ProbeResult => ({
				status: "error",
				errorDetail: error instanceof Error ? error.message : String(error),
			}),
		);
		const entry: HealthEntry = {
			status: result.status,
			checkedAt: this.now(),
			latencyMs: result.latencyMs,
		};
		setCached(route.routeProvider, route.modelName, entry);
		await this.query(
			`INSERT INTO roadmap.provider_health_log
			    (route_provider, model_name, checked_at, latency_ms, status, http_status, error_detail)
			 VALUES ($1, $2, to_timestamp($3 / 1000.0), $4, $5, $6, $7)`,
			[
				route.routeProvider,
				route.modelName,
				entry.checkedAt,
				result.latencyMs ?? null,
				result.status,
				result.httpStatus ?? null,
				result.errorDetail ?? null,
			],
		);
	}
}

export function startProviderHealthCheckerOnce(
	options: CheckerOptions = {},
): HealthChecker {
	if (!singletonChecker) {
		singletonChecker = new HealthChecker(options);
		singletonChecker.start();
	}
	return singletonChecker;
}

export async function defaultProbe(
	route: ProviderHealthRoute,
	timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
	if (!route.baseUrl) {
		return { status: "error", errorDetail: "missing base_url" };
	}

	const started = Date.now();
	const url = new URL(route.baseUrl);
	if (!url.pathname.endsWith("/")) {
		url.pathname = `${url.pathname}/`;
	}
	url.pathname = `${url.pathname}models`.replace(/\/{2,}/g, "/");

	try {
		const response = await fetch(url, {
			method: "HEAD",
			signal: AbortSignal.timeout(timeoutMs),
		});
		const latencyMs = Date.now() - started;
		return {
			status: response.ok ? "ok" : "error",
			latencyMs,
			httpStatus: response.status,
			errorDetail: response.ok ? undefined : `HTTP ${response.status}`,
		};
	} catch (error) {
		const latencyMs = Date.now() - started;
		const name = error instanceof Error ? error.name : "";
		return {
			status:
				name === "TimeoutError" || latencyMs >= timeoutMs ? "timeout" : "error",
			latencyMs,
			errorDetail: error instanceof Error ? error.message : String(error),
		};
	}
}
