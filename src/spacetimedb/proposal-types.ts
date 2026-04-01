/**
 * SpacetimeDB Proposal Storage - Type Definitions
 *
 * Implements STATE-74: SpacetimeDB Proposal Storage Implementation
 *
 * Types matching the existing Proposal interface for database-backed storage.
 */

import type { Proposal, ProposalStatus, ProposalMaturity } from "../types/index.ts";

// ===================== Proposal Tables =====================

/** Proposal priorities */
export type ProposalPriority = "critical" | "high" | "medium" | "low" | "minimal";

/** Valid proposal statuses (matches existing ProposalStatus) */
export type DatabaseProposalStatus = ProposalStatus;

/** Roadmap proposal as stored in SpacetimeDB */
export interface RoadmapProposalRow {
	/** Proposal ID (e.g., "STATE-74") */
	id: string;
	/** Proposal title */
	title: string;
	/** Current status */
	status: DatabaseProposalStatus;
	/** Priority level */
	priority: ProposalPriority;
	/** Maturity level */
	maturity: ProposalMaturity;
	/** Comma-separated assignee IDs (nullable) */
	assignee: string | null;
	/** Creation timestamp (milliseconds) */
	createdDate: number;
	/** Last update timestamp (milliseconds) */
	updatedDate: number;
	/** Full markdown content (body) */
	content: string;
	/** Comma-separated dependency IDs */
	dependencies: string;
	/** Proposal type */
	type: Proposal["type"];
	/** Proposal type (v2.5) */
	proposalType?: string;
	/** Domain ID (v2.5) */
	domainId?: string;
	/** Category (v2.5) */
	category?: string;
	/** Ready flag */
	ready: boolean;
	/** Directive */
	directive: string | null;
}

/** Labels for a proposal (many-to-many) */
export interface ProposalLabelRow {
	/** Auto-incrementing ID */
	id: number;
	/** Proposal ID reference */
	proposalId: string;
	/** Label value */
	label: string;
}

/** Activity log entry */
export interface ActivityLogRow {
	/** Auto-incrementing ID */
	id: number;
	/** Proposal ID reference */
	proposalId: string;
	/** When the activity occurred */
	timestamp: number;
	/** What happened */
	action: string;
	/** Who did it (agent ID) */
	agentId: string;
	/** Additional details */
	details: string | null;
}

// ===================== Input Types =====================

/** Input for creating a new proposal */
export interface CreateProposalInput {
	id: string;
	title: string;
	status?: DatabaseProposalStatus;
	priority?: ProposalPriority;
	maturity?: ProposalMaturity;
	assignee?: string[];
	content?: string;
	dependencies?: string[];
	type?: Proposal["type"];
	proposalType?: string;
	domainId?: string;
	category?: string;
	ready?: boolean;
	directive?: string;
	labels?: string[];
}

/** Input for updating an existing proposal */
export interface UpdateProposalInput {
	title?: string;
	status?: DatabaseProposalStatus;
	priority?: ProposalPriority;
	maturity?: ProposalMaturity;
	assignee?: string[];
	content?: string;
	dependencies?: string[];
	type?: Proposal["type"];
	proposalType?: string;
	domainId?: string;
	category?: string;
	ready?: boolean;
	directive?: string;
	labels?: string[];
}

// ===================== Query Types =====================

/** Query filter for proposal searches */
export interface ProposalQueryFilter {
	/** Filter by status */
	status?: DatabaseProposalStatus;
	/** Filter by assignee */
	assignee?: string;
	/** Filter by priority */
	priority?: ProposalPriority;
	/** Filter by maturity */
	maturity?: ProposalMaturity;
	/** Filter by ready flag */
	ready?: boolean;
	/** Filter by directive */
	directive?: string;
	/** Filter by type */
	type?: Proposal["type"];
	/** Filter by label */
	label?: string;
}

/** Sort options for proposal queries */
export interface ProposalSortOptions {
	/** Field to sort by */
	field: "id" | "title" | "status" | "priority" | "createdDate" | "updatedDate";
	/** Sort direction */
	direction: "asc" | "desc";
}

/** Pagination options */
export interface PaginationOptions {
	/** Maximum results to return */
	limit?: number;
	/** Offset from start */
	offset?: number;
}

/** Full query options */
export interface ProposalQueryOptions {
	filter?: ProposalQueryFilter;
	status?: string;
	sort?: ProposalSortOptions;
	pagination?: PaginationOptions;
}

// ===================== Constants =====================

/** Valid priorities in priority order */
export const PRIORITY_ORDER: Record<ProposalPriority, number> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
	minimal: 0,
};

/** Default priority for new proposals */
export const DEFAULT_PRIORITY: ProposalPriority = "medium";

/** Default status for new proposals */
export const DEFAULT_STATUS: DatabaseProposalStatus = "drafts";

/** Default maturity for new proposals */
export const DEFAULT_MATURITY: ProposalMaturity = "potential";

// ===================== Proposal Lifecycle Transitions (STATE-085) ==================

/** Proposal status values matching the simple lifecycle model */
export type ProposalLifecycleStatus = "Potential" | "Active" | "Complete";

/** Valid proposal status transitions (must go Potential → Active → Complete) */
export const STATE_LIFECYCLE_TRANSITIONS: Record<ProposalLifecycleStatus, ProposalLifecycleStatus[]> = {
	Potential: ["Active"],      // Can only go to Active, not directly to Complete
	Active: ["Complete", "Potential"],  // Can complete or revert to Potential
	Complete: ["Potential"],     // Can reopen (revert to Potential)
};

/** Map from internal status to lifecycle status */
export function toLifecycleStatus(status: DatabaseProposalStatus): ProposalLifecycleStatus {
	switch (status.toLowerCase()) {
		case "potential":
		case "drafts":
		case "ready":
		case "pending":
			return "Potential";
		case "active":
		case "wip":
		case "in_progress":
		case "review":
			return "Active";
		case "complete":
		case "done":
		case "complete":
			return "Complete";
		default:
			return "Potential";
	}
}

/**
 * Validate that a proposal status transition is allowed.
 * STATE-085: Transitions from Potential must go to Active before Complete.
 *
 * @param fromStatus - Current status
 * @param toStatus - Target status
 * @returns true if transition is valid
 * @throws Error if transition is invalid
 */
export function validateProposalTransition(
	fromStatus: DatabaseProposalStatus,
	toStatus: DatabaseProposalStatus,
): boolean {
	const from = toLifecycleStatus(fromStatus);
	const to = toLifecycleStatus(toStatus);

	// Same status is always allowed (no-op)
	if (from === to) return true;

	const allowedTransitions = STATE_LIFECYCLE_TRANSITIONS[from];
	if (!allowedTransitions.includes(to)) {
		throw new Error(
			`Invalid proposal transition: ${fromStatus} → ${toStatus}. ` +
			"Must follow lifecycle: Potential → Active → Complete. " +
			`Valid transitions from ${from}: ${allowedTransitions.join(", ")}`,
		);
	}

	return true;
}
