import type { Core } from "../core/roadmap.ts";
import { getProposalStatistics } from '../core/infrastructure/statistics.ts';
import { createLoadingScreen } from "../ui/loading.ts";
import { renderOverviewTui } from "../ui/overview-tui.ts";
import { loadProposalsForStatistics } from '../core/storage/sdb-proposal-loader.ts';

function formatTime(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export async function runOverviewCommand(core: Core): Promise<void> {
	const startTime = performance.now();

	// Load proposals with loading screen
	const loadingScreen = await createLoadingScreen("Loading project statistics");

	try {
		// Load proposals from SpacetimeDB (replaces file-based loading)
		const loadStart = performance.now();
		const {
			proposals: activeProposals,
			drafts,
			statuses,
		} = loadProposalsForStatistics();
		loadingScreen?.update(`Loaded from SpacetimeDB in ${formatTime(performance.now() - loadStart)}`);

		loadingScreen?.close();

		// Calculate statistics
		const statsStart = performance.now();
		const statistics = getProposalStatistics(activeProposals, drafts, statuses);
		const statsTime = Math.round(performance.now() - statsStart);

		// Display the TUI
		const totalTime = Math.round(performance.now() - startTime);
		console.log(`\nPerformance summary: Total time ${totalTime}ms (stats calculation: ${statsTime}ms)`);

		const config = await core.fs.loadConfig();
		await renderOverviewTui(statistics, config?.projectName || "Project");
	} catch (error) {
		loadingScreen?.close();
		throw error;
	}
}
