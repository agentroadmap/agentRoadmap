import type { Proposal } from "../../types/index.ts";

export function formatCompactProposalListLine(proposal: Proposal): string {
	const status = (proposal.status ?? "").trim() || "No Status";
	const priority = proposal.priority ?? "-";
	return `${proposal.id} | ${status} | ${priority} | ${proposal.title}`;
}
