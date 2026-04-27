/**
 * P609: Per-(type × gate) gate-role resolver.
 *
 * Resolves the agent profile for a given (proposal_type, gate) pair.
 * Two-tier lookup: DB cache → BUILTIN_FALLBACK (identical to GATE_ROLES in orchestrator.ts).
 * Two-level mutex mirrors StateNamesRegistry pattern in state-names.ts:
 *   - Instance-level inner guard: GateRoleRegistry.loadInFlight serializes load() calls.
 *   - Module-level outer guard: resolvingPromise serializes getGateRoleRegistry() calls.
 *
 * NOTIFY-triggered cache invalidation: GateRoleRegistry subscribes to the
 * 'gate_role_changed' channel and reloads on each notification.
 *
 * Phase 1 (P609): shadow-mode only. orchestrator.ts still uses GATE_ROLES as
 * authoritative source and logs divergence. Phase 2 removes GATE_ROLES after
 * ≥24h shadow-mode zero-divergence window (AC-17).
 */

import type { Pool, PoolClient } from "pg";

export interface GateRoleProfile {
	role: string;
	persona: string;
	outputContract: string;
	modelPreference: string | null;
	toolAllowList: string[] | null;
	fallbackRole: string | null;
	source: "db-cache" | "db-fresh" | "builtin-fallback";
}

// BUILTIN_FALLBACK: identical to GATE_ROLES in orchestrator.ts.
// Used when the DB is unreachable or the row is missing.
const BUILTIN_FALLBACK: Record<string, Omit<GateRoleProfile, "source">> = {
	D1: {
		role: "skeptic-alpha",
		persona:
			"You are SKEPTIC ALPHA gating DRAFT → REVIEW. Validate the SPEC, not the IMPLEMENTATION.",
		outputContract:
			"Emit ADVANCE/HOLD/REJECT with ## Failures section and ac_verification.details JSONB.",
		modelPreference: null,
		toolAllowList: null,
		fallbackRole: null,
	},
	D2: {
		role: "architecture-reviewer",
		persona:
			"You are the Architecture Reviewer gating REVIEW → DEVELOP. Validate buildability.",
		outputContract:
			"Emit ADVANCE/HOLD with ## Failures + ## Remediation for non-advance verdicts.",
		modelPreference: null,
		toolAllowList: null,
		fallbackRole: null,
	},
	D3: {
		role: "skeptic-beta",
		persona:
			"You are SKEPTIC BETA gating DEVELOP → MERGE. Validate the IMPLEMENTATION.",
		outputContract:
			"Emit ADVANCE/HOLD with mandatory ac_verification.details entries including concrete evidence.",
		modelPreference: null,
		toolAllowList: null,
		fallbackRole: null,
	},
	D4: {
		role: "gate-reviewer",
		persona:
			"You are the Integration Reviewer. Validate that the merge is clean and deployable.",
		outputContract:
			"Emit ADVANCE/HOLD with ## Failures + ## Remediation for non-advance verdicts.",
		modelPreference: null,
		toolAllowList: null,
		fallbackRole: null,
	},
};

type CacheKey = string; // `${proposalType}:${gate}`

class GateRoleRegistry {
	private profiles = new Map<CacheKey, GateRoleProfile>();
	private notifySubscription: {
		client: PoolClient;
		unsubscribe: () => Promise<void>;
	} | null = null;

	// Instance-level inner mutex — serializes concurrent load() calls (mirrors
	// StateNamesRegistry.loadInFlight at state-names.ts:107).
	private loadInFlight: Promise<void> | null = null;

	async load(pool: Pool): Promise<void> {
		if (this.loadInFlight) {
			return this.loadInFlight;
		}
		this.loadInFlight = this.loadInner(pool).finally(() => {
			this.loadInFlight = null;
		});
		return this.loadInFlight;
	}

	private async loadInner(pool: Pool): Promise<void> {
		const result = await pool.query<{
			proposal_type: string;
			gate: string;
			role: string;
			persona: string;
			output_contract: string;
			model_preference: string | null;
			tool_allow_list: string[] | null;
			fallback_role: string | null;
		}>(
			`SELECT proposal_type, gate, role, persona, output_contract,
			        model_preference, tool_allow_list, fallback_role
			   FROM roadmap_proposal.gate_role
			  WHERE lifecycle_status = 'active'
			  ORDER BY proposal_type, gate`,
		);

		this.profiles.clear();
		for (const row of result.rows) {
			const key: CacheKey = `${row.proposal_type}:${row.gate}`;
			this.profiles.set(key, {
				role: row.role,
				persona: row.persona,
				outputContract: row.output_contract,
				modelPreference: row.model_preference,
				toolAllowList: row.tool_allow_list,
				fallbackRole: row.fallback_role,
				source: "db-cache",
			});
		}

		// Subscribe to NOTIFY for cache invalidation. Mirrors StateNamesRegistry
		// pattern — one PoolClient per registry instance, replaced on reload.
		await this.setupNotify(pool);
	}

	private async setupNotify(pool: Pool): Promise<void> {
		// Release prior subscription if any (prevents PoolClient leak on reload).
		if (this.notifySubscription) {
			try {
				await this.notifySubscription.unsubscribe();
			} catch {
				// Best-effort; the client may already be gone.
			}
			this.notifySubscription = null;
		}

		const client = await pool.connect();
		try {
			await client.query("LISTEN gate_role_changed");
			const onNotify = () => {
				// Fire-and-forget reload; inner mutex serializes concurrent notifications.
				this.load(pool).catch((err) => {
					console.error("[GateRoleResolver] NOTIFY reload failed:", err);
				});
			};
			client.on("notification", onNotify);

			this.notifySubscription = {
				client,
				unsubscribe: async () => {
					client.removeListener("notification", onNotify);
					try {
						await client.query("UNLISTEN gate_role_changed");
					} finally {
						client.release();
					}
				},
			};
		} catch (err) {
			client.release();
			throw err;
		}
	}

	resolve(
		proposalType: string,
		gate: string,
	): GateRoleProfile {
		const specific = this.profiles.get(`${proposalType}:${gate}`);
		if (specific) return specific;

		const fallback = BUILTIN_FALLBACK[gate];
		if (fallback) return { ...fallback, source: "builtin-fallback" };

		return {
			role: "gate-reviewer",
			persona: "Generic gate reviewer.",
			outputContract: "Emit ADVANCE/HOLD.",
			modelPreference: null,
			toolAllowList: null,
			fallbackRole: null,
			source: "builtin-fallback",
		};
	}

	async dispose(): Promise<void> {
		if (this.notifySubscription) {
			try {
				await this.notifySubscription.unsubscribe();
			} catch {
				// Best-effort.
			}
			this.notifySubscription = null;
		}
	}
}

// ─── Module-level state ───────────────────────────────────────────────────────

let globalGateRoleRegistry: GateRoleRegistry | null = null;

// Module-level outer mutex — serializes concurrent getGateRoleRegistry() calls
// (mirrors loadingPromise at state-names.ts:417).
let resolvingPromise: Promise<GateRoleRegistry> | null = null;

/**
 * Load (or reload) the gate-role registry from the DB.
 *
 * Concurrent callers receive the same in-flight Promise — only ONE
 * GateRoleRegistry is created per "load wave". Subsequent waves dispose the
 * prior global before installing a new one.
 *
 * AC-33: if the DB is unreachable at startup, catches the error, logs a WARNING,
 * resets resolvingPromise to null (so a subsequent call can retry), and returns a
 * registry whose resolve() always falls back to BUILTIN_FALLBACK.
 */
export async function getGateRoleRegistry(pool: Pool): Promise<GateRoleRegistry> {
	if (resolvingPromise) return resolvingPromise;

	resolvingPromise = (async () => {
		try {
			if (globalGateRoleRegistry) {
				await globalGateRoleRegistry.dispose();
			}
			const reg = new GateRoleRegistry();
			await reg.load(pool);
			globalGateRoleRegistry = reg;
			return reg;
		} catch (err) {
			// AC-33: DB unavailable at startup — fall back silently.
			console.warn(
				"[GateRoleResolver] gate_role DB unavailable at startup — falling back to BUILTIN_FALLBACK:",
				err instanceof Error ? err.message : err,
			);
			// Install an empty registry that will resolve everything via BUILTIN_FALLBACK.
			const fallbackReg = new GateRoleRegistry();
			globalGateRoleRegistry = fallbackReg;
			return fallbackReg;
		} finally {
			// Always reset so a subsequent call can retry (AC-33).
			resolvingPromise = null;
		}
	})();

	return resolvingPromise;
}

/**
 * Resolve the gate-role profile for (proposalType, gate).
 *
 * Uses the module-level cached registry. Falls back to BUILTIN_FALLBACK if the
 * registry is not yet loaded or the DB row is missing. Never throws.
 */
export async function resolveGateRole(
	proposalType: string,
	gate: "D1" | "D2" | "D3" | "D4",
	pool: Pool,
): Promise<GateRoleProfile> {
	try {
		const registry = globalGateRoleRegistry ?? (await getGateRoleRegistry(pool));
		return registry.resolve(proposalType, gate);
	} catch (err) {
		console.warn(
			`[GateRoleResolver] resolve failed for ${proposalType}:${gate}, using BUILTIN_FALLBACK:`,
			err instanceof Error ? err.message : err,
		);
		const fallback = BUILTIN_FALLBACK[gate];
		return fallback
			? { ...fallback, source: "builtin-fallback" }
			: {
					role: "gate-reviewer",
					persona: "Generic gate reviewer.",
					outputContract: "Emit ADVANCE/HOLD.",
					modelPreference: null,
					toolAllowList: null,
					fallbackRole: null,
					source: "builtin-fallback",
				};
	}
}

export { BUILTIN_FALLBACK, GateRoleRegistry };
