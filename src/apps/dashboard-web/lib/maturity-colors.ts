/**
 * Canonical maturity color palette shared across Board and ProposalDetailsModal.
 *
 * new      → green  (fresh / just landed)
 * active   → amber  (in progress / hot)
 * mature   → sky    (settled / ready for gate)
 * obsolete → gray   (superseded)
 */

/** Full-width banner / title-bar variant (used on board cards). */
export function maturityBarColors(maturity?: string | null): string {
	switch ((maturity ?? "").toLowerCase()) {
		case "new":
			return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
		case "active":
			return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
		case "mature":
			return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200";
		case "obsolete":
			return "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-500";
		default:
			return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
	}
}

/** Pill / badge variant (used in modal sidebar and anywhere a compact chip is needed). */
export function maturityBadgeColors(maturity?: string | null): string {
	switch ((maturity ?? "").toLowerCase()) {
		case "new":
			return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
		case "active":
			return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100";
		case "mature":
			return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200";
		case "obsolete":
			return "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-500";
		default:
			return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
	}
}
