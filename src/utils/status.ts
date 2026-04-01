/**
 * Check if a status represents a "done" (successful completion) proposal.
 * Matches "done", "complete", or "reached" (case-insensitive).
 */
export function isReachedStatus(status?: string | null): boolean {
	if (!status) return false;
	const normalized = String(status).trim().toLowerCase();
	return (
		normalized === "reached" ||
		normalized === "done" ||
		normalized === "complete" ||
		normalized === "completed" ||
		normalized.includes("reached") ||
		normalized.includes("done") ||
		normalized.includes("complete")
	);
}

/**
 * Check if a status represents a terminal proposal (either successful or abandoned/archived).
 */
export function isTerminalStatus(status?: string | null): boolean {
	if (isReachedStatus(status)) return true;
	const normalized = (status ?? "").toLowerCase();
	return normalized.includes("abandoned") || normalized.includes("archived");
}

/**
 * Check if a status represents a "to do" (not started) proposal.
 * Matches "todo", "potential", or "active" (case-insensitive).
 */
export function isTodoStatus(status?: string | null): boolean {
	const normalized = (status ?? "").toLowerCase();
	return (
		normalized.includes("todo") ||
		normalized.includes("potential") ||
		normalized.includes("active") ||
		normalized.replace(/\s+/g, "") === "todo"
	);
}

import { type ProposalClaim } from "../types/index.ts";

/**
 * Check if a proposal is ready for autonomous pickup (not terminal, unassigned, and unblocked).
 * @param proposal - The proposal to check
 * @param doneIds - A set of IDs for proposals that are already completed/reached
 * @returns true if the proposal is ready for pickup
 */
export function isReady(
	proposal: { status: string; type?: string; assignee?: string[]; dependencies?: string[]; claim?: ProposalClaim; external_injections?: string[] },
	doneIds: Set<string>,
	allProposals?: Array<{ status: string; type?: string }>,
): boolean {
	// 1. Must not be terminal (reached, abandoned, etc.)
	if (isTerminalStatus(proposal.status)) return false;

	// 2. High-priority interrupt: if there are any active INCIDENTS, everything else is blocked
	// unless the current proposal is also an incident.
	if (allProposals && proposal.type !== "incident") {
		const activeIncidents = allProposals.filter((s) => s.type === "incident" && !isTerminalStatus(s.status));
		if (activeIncidents.length > 0) return false;
	}

	// 3. Must be unassigned (no ownership/claim proposal)
	if (proposal.assignee && proposal.assignee.length > 0) return false;

	// 2.1. Must not have an active claim
	if (proposal.claim && proposal.claim.expires) {
		const expires = new Date(proposal.claim.expires.replace(" ", "T"));
		if (expires > new Date()) {
			return false;
		}
	}

	// 3. Must be unblocked: all dependencies must be done/reached
	// 3. Must not have external injections (3rd party blockers)
	if (proposal.external_injections && proposal.external_injections.length > 0) return false;

	const deps = proposal.dependencies || [];
	if (deps.length > 0) {
		const hasBlockingDependency = deps.some((depId) => !doneIds.has(depId));
		if (hasBlockingDependency) return false;
	}

	return true;
}

import { Core } from "../core/roadmap.ts";

/**
 * Load valid statuses from project configuration.
 */
export async function getValidStatuses(core?: Core): Promise<string[]> {
	const c = core ?? new Core(process.cwd());
	const config = await c.filesystem.loadConfig();
	return config?.statuses || [];
}

/**
 * Find the canonical status (matching config casing) for a given input.
 * Loads configured statuses and matches case-insensitively and space-insensitively.
 * Returns the canonical value or null if no match is found.
 *
 * Examples:
 * - "todo" matches "Potential"
 * - "in progress" matches "Active"
 * - "DONE" matches "Reached"
 */
export async function getCanonicalStatus(input: string | undefined, core?: Core): Promise<string | null> {
	if (!input) return null;
	const statuses = await getValidStatuses(core);
	// Normalize: lowercase, trim, and remove all whitespace
	const normalized = String(input).trim().toLowerCase().replace(/\s+/g, "");
	if (!normalized) return null;
	for (const s of statuses) {
		// Normalize config status the same way
		const configNormalized = s.toLowerCase().replace(/\s+/g, "");
		if (configNormalized === normalized) return s; // preserve configured casing
	}
	return null;
}

/**
 * Format a list of valid statuses for display.
 */
export function formatValidStatuses(configuredStatuses: string[]): string {
	return configuredStatuses.join(", ");
}
