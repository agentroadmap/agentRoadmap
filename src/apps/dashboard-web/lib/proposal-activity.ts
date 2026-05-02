export const localActivityDateTimeFormatter = new Intl.DateTimeFormat(
	undefined,
	{
		dateStyle: "medium",
		timeStyle: "short",
	},
);

export function formatLocalActivityTimestamp(value?: string): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return localActivityDateTimeFormatter.format(date);
}

export function describeProposalEvent(eventType?: string): string {
	switch (eventType) {
		case "proposal_created":
			return "created proposal";
		case "lease_claimed":
			return "lease claimed";
		case "lease_released":
			return "lease released";
		case "decision_made":
			return "decision recorded";
		case "dependency_added":
			return "dependency added";
		case "dependency_resolved":
			return "dependency resolved";
		case "ac_updated":
			return "acceptance criteria updated";
		case "review_submitted":
			return "review submitted";
		case "maturity_changed":
			return "maturity changed";
		case "status_changed":
			return "status changed";
		case "milestone_achieved":
			return "milestone achieved";
		default:
			return eventType ? eventType.replace(/_/g, " ") : "";
	}
}
