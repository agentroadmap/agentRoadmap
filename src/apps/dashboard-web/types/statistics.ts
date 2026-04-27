// P301: ProposalStatistics shape, moved out of src/core so the dashboard
// bundle no longer pulls filesystem-Core dependencies. Pure type — the
// computation lives on the backend (lib/api.ts hits /api/statistics).

import type { Proposal } from "../../../shared/types";

export interface ProposalStatistics {
	statusCounts: Map<string, number>;
	priorityCounts: Map<string, number>;
	totalProposals: number;
	completedProposals: number;
	completionPercentage: number;
	draftCount: number;
	recentActivity: {
		created: Proposal[];
		updated: Proposal[];
	};
	projectHealth: {
		averageProposalAge: number;
		staleProposals: Proposal[];
		blockedProposals: Proposal[];
	};
}
