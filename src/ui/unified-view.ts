/**
 * Unified view manager that handles Tab switching between proposal views and kanban board
 */

import type { Core } from "../core/roadmap.ts";
import type { Directive, Proposal } from "../types/index.ts";
import { watchConfig } from "../utils/config-watcher.ts";
import { collectAvailableLabels } from "../utils/label-filter.ts";
import { hasAnyPrefix } from "../utils/prefix-config.ts";
import { applySharedProposalFilters, createProposalSearchIndex } from "../utils/proposal-search.ts";
import { watchProposals } from "../utils/proposal-watcher.ts";
import { execSync } from "child_process";
import { renderBoardTui } from "./board.ts";
import { createLoadingScreen } from "./loading.ts";
import { buildProposalViewerDirectiveFilterModel, viewProposalEnhanced } from "./proposal-viewer-with-search.ts";
import { type ViewProposal, ViewSwitcher, type ViewType } from "./view-switcher.ts";
import { loadAllProposals, loadAllDirectives } from '../core/storage/sdb-proposal-loader.ts';

export interface UnifiedViewOptions {
	core: Core;
	initialView: ViewType;
	selectedProposal?: Proposal;
	proposals?: Proposal[];
	proposalsLoader?: (updateProgress: (message: string) => void) => Promise<{ proposals: Proposal[]; statuses: string[] }>;
	loadingScreenFactory?: (initialMessage: string) => Promise<LoadingScreen | null>;
	title?: string;
	filter?: {
		status?: string;
		assignee?: string;
		priority?: string;
		labels?: string[];
		directive?: string;
		sort?: string;
		title?: string;
		filterDescription?: string;
		searchQuery?: string;
		parentProposalId?: string;
	};
	preloadedKanbanData?: {
		proposals: Proposal[];
		statuses: string[];
	};
	directiveMode?: boolean;
	directiveEntities?: Directive[];
	source?: string;
}

type LoadingScreen = {
	update(message: string): void;
	close(): Promise<void> | void;
};

export interface UnifiedViewLoadResult {
	proposals: Proposal[];
	statuses: string[];
}

export interface UnifiedViewFilters {
	searchQuery: string;
	statusFilter: string;
	priorityFilter: string;
	labelFilter: string[];
	directiveFilter: string;
}

export interface KanbanSharedFilters {
	searchQuery: string;
	priorityFilter: string;
	labelFilter: string[];
	directiveFilter: string;
}

export function createKanbanSharedFilters(filters: UnifiedViewFilters): KanbanSharedFilters {
	return {
		searchQuery: filters.searchQuery,
		priorityFilter: filters.priorityFilter,
		labelFilter: [...filters.labelFilter],
		directiveFilter: filters.directiveFilter,
	};
}

export function filterProposalsForKanban(
	proposals: Proposal[],
	filters: KanbanSharedFilters,
	resolveDirectiveLabel?: (directive: string) => string,
): Proposal[] {
	if (
		!filters.searchQuery.trim() &&
		!filters.priorityFilter &&
		filters.labelFilter.length === 0 &&
		!filters.directiveFilter
	) {
		return [...proposals];
	}

	const searchIndex = createProposalSearchIndex(proposals);
	return applySharedProposalFilters(
		proposals,
		{
			query: filters.searchQuery,
			priority: filters.priorityFilter as "high" | "medium" | "low" | undefined,
			labels: filters.labelFilter,
			directive: filters.directiveFilter || undefined,
			resolveDirectiveLabel,
		},
		searchIndex,
	);
}

export function createUnifiedViewFilters(filter: UnifiedViewOptions["filter"] | undefined): UnifiedViewFilters {
	return {
		searchQuery: filter?.searchQuery || "",
		statusFilter: filter?.status || "",
		priorityFilter: filter?.priority || "",
		labelFilter: [...(filter?.labels || [])],
		directiveFilter: filter?.directive || "",
	};
}

export function mergeUnifiedViewFilters(current: UnifiedViewFilters, update: UnifiedViewFilters): UnifiedViewFilters {
	return {
		...current,
		searchQuery: update.searchQuery,
		statusFilter: update.statusFilter,
		priorityFilter: update.priorityFilter,
		labelFilter: [...update.labelFilter],
		directiveFilter: update.directiveFilter,
	};
}

export async function loadProposalsForUnifiedView(
	core: Core,
	options: Pick<UnifiedViewOptions, "proposals" | "proposalsLoader" | "loadingScreenFactory">,
): Promise<UnifiedViewLoadResult> {
	if (options.proposals && options.proposals.length > 0) {
		const config = await core.filesystem.loadConfig();
		return {
			proposals: options.proposals,
			statuses: config?.statuses || ["Potential", "Active", "Accepted", "Complete", "Abandoned"],
		};
	}

	const loader =
		options.proposalsLoader ||
		(async (updateProgress: (message: string) => void): Promise<{ proposals: Proposal[]; statuses: string[] }> => {
			const proposals = await core.loadProposals(updateProgress);
			const config = await core.filesystem.loadConfig();
			return {
				proposals,
				statuses: config?.statuses || ["Potential", "Active", "Accepted", "Complete", "Abandoned"],
			};
		});

	const loadingScreenFactory = options.loadingScreenFactory || createLoadingScreen;
	const loadingScreen = await loadingScreenFactory("Loading proposals");

	try {
		const result = await loader((message) => {
			loadingScreen?.update(message);
		});

		return {
			proposals: result.proposals,
			statuses: result.statuses,
		};
	} finally {
		await loadingScreen?.close();
	}
}

type ViewResult = "switch" | "exit";

/**
 * Main unified view controller that handles Tab switching between views
 */
export async function runUnifiedView(options: UnifiedViewOptions): Promise<void> {
	try {
		const { proposals: loadedProposals, statuses: loadedStatuses } = await loadProposalsForUnifiedView(options.core, {
			proposals: options.proposals,
			proposalsLoader: options.proposalsLoader,
			loadingScreenFactory: options.loadingScreenFactory,
		});

		const baseProposals = (loadedProposals || []).filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));
		if (baseProposals.length === 0) {
			if (options.filter?.parentProposalId) {
				console.log(`No child proposals found for parent proposal ${options.filter.parentProposalId}.`);
			} else {
				console.log("No proposals found.");
			}
			return;
		}
		const initialConfig = await options.core.filesystem.loadConfig();
		let configuredLabels = initialConfig?.labels ?? [];
		let directiveEntities =
			options.source === "file" ? await options.core.filesystem.listDirectives() : loadAllDirectives();
		let directiveFilterModel = buildProposalViewerDirectiveFilterModel(directiveEntities);
		let currentFilters = createUnifiedViewFilters(options.filter);
		const initialProposal: ViewProposal = {
			type: options.initialView,
			selectedProposal: options.selectedProposal,
			proposals: baseProposals,
			filter: options.filter,
			// Initialize kanban data if starting with kanban view
			kanbanData:
				options.initialView === "kanban"
					? {
							proposals: baseProposals,
							statuses: loadedStatuses,
							isLoading: false,
						}
					: undefined,
		};

		let isRunning = true;
		let viewSwitcher: ViewSwitcher | null = null;
		let currentView: ViewType = options.initialView;
		let selectedProposal: Proposal | undefined = options.selectedProposal;
		let proposals = baseProposals;
		let kanbanStatuses = loadedStatuses ?? [];
		let boardUpdater: ((nextProposals: Proposal[], nextStatuses: string[]) => void) | null = null;

		const getRenderableProposals = () =>
			proposals.filter((proposal) => proposal.id && proposal.id.trim() !== "" && hasAnyPrefix(proposal.id));
		const getBoardAvailableLabels = () => collectAvailableLabels(getRenderableProposals(), configuredLabels);
		const getBoardAvailableDirectives = () => [...directiveFilterModel.availableDirectiveTitles];

		const emitBoardUpdate = () => {
			if (!boardUpdater) return;
			boardUpdater(getRenderableProposals(), kanbanStatuses);
		};
		let isInitialLoad = true; // Track if this is the first view load

		// Create view switcher (without problematic onViewChange callback)
		viewSwitcher = new ViewSwitcher({
			core: options.core,
			initialProposal,
		});

		if (options.source === "file") {
			const watcher = watchProposals(options.core, {
				onProposalAdded(proposal) {
					proposals.push(proposal);
					const viewProposal = viewSwitcher?.getProposal();
					viewSwitcher?.updateProposal({
						proposals,
						kanbanData: viewProposal?.kanbanData ? { ...viewProposal.kanbanData, proposals } : undefined,
					});
					emitBoardUpdate();
				},
				onProposalChanged(proposal) {
					const idx = proposals.findIndex((t) => t.id === proposal.id);
					if (idx >= 0) {
						proposals[idx] = proposal;
					} else {
						proposals.push(proposal);
					}
					const viewProposal = viewSwitcher?.getProposal();
					viewSwitcher?.updateProposal({
						proposals,
						kanbanData: viewProposal?.kanbanData ? { ...viewProposal.kanbanData, proposals } : undefined,
					});
					emitBoardUpdate();
				},
				onProposalRemoved(proposalId) {
					proposals = proposals.filter((t) => t.id !== proposalId);
					if (selectedProposal?.id === proposalId) {
						selectedProposal = proposals[0];
					}
					const proposal = viewSwitcher?.getProposal();
					viewSwitcher?.updateProposal({
						proposals,
						kanbanData: proposal?.kanbanData ? { ...proposal.kanbanData, proposals } : undefined,
					});
					emitBoardUpdate();
				},
			});
			process.on("exit", () => watcher.stop());

			const configWatcher = watchConfig(options.core, {
				onConfigChanged: (config) => {
					kanbanStatuses = config?.statuses ?? [];
					configuredLabels = config?.labels ?? [];
					emitBoardUpdate();
				},
			});
			process.on("exit", () => configWatcher.stop());
		} else {
			// SDB Real-time Subscription - authoritative source, no file lookups
			const { subscribeSdb } = await import('../core/storage/sdb-sdk-loader.ts');
			const unsubscribe = subscribeSdb((data) => {
				try {
					// Update proposals and directives
					proposals = data.proposals;
					directiveEntities = data.directives;
					directiveFilterModel = buildProposalViewerDirectiveFilterModel(directiveEntities);

					const viewProposal = viewSwitcher?.getProposal();
					viewSwitcher?.updateProposal({
						proposals,
						kanbanData: viewProposal?.kanbanData ? { ...viewProposal.kanbanData, proposals } : undefined,
					});
					emitBoardUpdate();
				} catch (e) {
					// Ignore transient update errors
				}
			});
			process.on("exit", () => unsubscribe());
		}

		// Function to show proposal view
		const showProposalView = async (): Promise<ViewResult> => {
			const availableProposals = proposals.filter((t) => t.id && t.id.trim() !== "" && hasAnyPrefix(t.id));

			if (availableProposals.length === 0) {
				console.log("No proposals available.");
				return "exit";
			}

			// Find the proposal to view - if selectedProposal has an ID, find it in available proposals
			let proposalToView: Proposal | undefined;
			if (selectedProposal?.id) {
				const foundProposal = availableProposals.find((t) => t.id === selectedProposal?.id);
				proposalToView = foundProposal || availableProposals[0];
			} else {
				proposalToView = availableProposals[0];
			}

			if (!proposalToView) {
				console.log("No proposal selected.");
				return "exit";
			}

			// Show enhanced proposal viewer with view switching support
			return new Promise<ViewResult>((resolve) => {
				let result: ViewResult = "exit"; // Default to exit

				const onTabPress = async () => {
					result = "switch";
				};

				// Determine initial focus based on where we're coming from
				// - If we have a search query on initial load, focus search
				// - If currentView is proposal-detail, focus detail
				// - Otherwise (including when coming from kanban), focus proposal list
				const hasSearchQuery = options.filter ? "searchQuery" in options.filter : false;
				const shouldFocusSearch = isInitialLoad && hasSearchQuery;

				viewProposalEnhanced(proposalToView, {
					proposals: availableProposals,
					core: options.core,
					title: options.filter?.title,
					filterDescription: options.filter?.filterDescription,
					searchQuery: currentFilters.searchQuery,
					statusFilter: currentFilters.statusFilter,
					priorityFilter: currentFilters.priorityFilter,
					labelFilter: currentFilters.labelFilter,
					directiveFilter: currentFilters.directiveFilter,
					startWithDetailFocus: currentView === "proposal-detail",
					startWithSearchFocus: shouldFocusSearch,
					onProposalChange: (newProposal) => {
						selectedProposal = newProposal;
						currentView = "proposal-detail";
					},
					onFilterChange: (filters) => {
						currentFilters = mergeUnifiedViewFilters(currentFilters, filters);
					},
					onTabPress,
				}).then(() => {
					// If user wants to exit, do it immediately
					if (result === "exit") {
						process.exit(0);
					}
					resolve(result);
				});
			});
		};

		// Function to show kanban view
		const showKanbanView = async (): Promise<ViewResult> => {
			const config = await options.core.filesystem.loadConfig();
			configuredLabels = config?.labels ?? configuredLabels;
			const layout = "horizontal" as const;
			const maxColumnWidth = config?.maxColumnWidth || 20;
			directiveEntities =
				options.source === "file" ? await options.core.filesystem.listDirectives() : loadAllDirectives();
			directiveFilterModel = buildProposalViewerDirectiveFilterModel(directiveEntities);
			const kanbanProposals = getRenderableProposals();
			const statuses = kanbanStatuses;

			// Show kanban board with view switching support
			return new Promise<ViewResult>((resolve) => {
				let result: ViewResult = "exit"; // Default to exit

				const onTabPress = async () => {
					result = "switch";
				};

				renderBoardTui(kanbanProposals, statuses, layout, maxColumnWidth, {
					onProposalSelect: (proposal) => {
						selectedProposal = proposal;
					},
					onTabPress,
					filters: createKanbanSharedFilters(currentFilters),
					availableLabels: getBoardAvailableLabels(),
					availableDirectives: getBoardAvailableDirectives(),
					onFilterChange: (filters) => {
						currentFilters = {
							...currentFilters,
							searchQuery: filters.searchQuery,
							priorityFilter: filters.priorityFilter,
							labelFilter: [...filters.labelFilter],
							directiveFilter: filters.directiveFilter,
						};
					},
					subscribeUpdates: (updater) => {
						boardUpdater = updater;
						emitBoardUpdate();
					},
					directiveMode: options.directiveMode,
					directiveEntities,
				}).then(() => {
					// If user wants to exit, do it immediately
					if (result === "exit") {
						process.exit(0);
					}
					boardUpdater = null;
					resolve(result);
				});
			});
		};

		// Function to show cockpit (formerly cubic dashboard)
		const showCockpit = async (): Promise<ViewResult> => {
			const { renderCockpit } = await import("./cockpit.ts");
			const { querySdbSync } = await import('../core/storage/sdb-client.ts');

			return new Promise<ViewResult>((resolve) => {
				let result: ViewResult = "exit";

				const onTabPress = () => {
					result = "switch";
				};

				// 1. Fetch Workforce data
				const agents = querySdbSync("SELECT * FROM workforce_registry");
				const pulses = querySdbSync("SELECT * FROM workforce_pulse");
				
				const agentData = agents.map(a => {
					const pulse = pulses.find(p => p.identity === a.identity);
					return {
						id: a.agent_id,
						name: a.name,
						role: a.role,
						status: pulse ? (pulse.is_zombie ? "zombie" : "active") : "offline",
						currentProposal: pulse?.active_proposal_id,
						statusMessage: pulse?.status_message || "Idle",
						lastSeen: pulse?.last_seen_at
					};
				});

				// 2. Fetch Pipeline data
				const proposals = querySdbSync("SELECT * FROM proposal");
				
				// 3. Fetch Ledger data
				const spending = querySdbSync("SELECT * FROM spending_log");
				const caps = querySdbSync("SELECT * FROM spending_caps");
				
				// Aggregate spending by agent
				const spendingByAgent: Record<string, number> = {};
				for (const log of spending) {
					spendingByAgent[log.agent_identity] = (spendingByAgent[log.agent_identity] || 0) + log.cost_usd;
				}

				const ledgerData = caps.map(c => ({
					agent: c.agent_identity,
					dailyLimit: c.daily_limit_usd,
					spentToday: c.total_spent_today_usd,
					totalSpent: spendingByAgent[c.agent_identity] || 0,
					isFrozen: c.is_frozen
				}));

				// 4. Fetch Terminal/Events
				const messages = querySdbSync("SELECT * FROM message_ledger ORDER BY timestamp DESC LIMIT 20");

				// Show the dashboard
				renderCockpit(screen, {
					agents: agentData,
					proposals: proposals,
					ledger: ledgerData,
					messages: messages
				} as any);

				// Set up key handlers
				(screen as any).key(["tab"], () => {
					onTabPress();
					(screen as any).destroy();
					resolve("switch");
				});
				(screen as any).key(["q", "C-c"], () => {
					(screen as any).destroy();
					resolve("exit");
				});
			});
		};

		// Main view loop
		while (isRunning) {
			// Show the current view and get the result
			let result: ViewResult;
			switch (currentView) {
				case "proposal-list":
				case "proposal-detail":
					result = await showProposalView();
					break;
				case "kanban":
					result = await showKanbanView();
					break;
				case "cockpit":
					result = await showCockpit();
					break;
				default:
					result = "exit";
			}

			// After the first view, we're no longer on initial load
			isInitialLoad = false;

			// Handle the result
			if (result === "switch") {
				// User pressed Tab, cycle through views
				switch (currentView) {
					case "proposal-list":
					case "proposal-detail":
						currentView = "kanban";
						break;
					case "kanban":
						currentView = "cockpit";
						break;
					case "cockpit":
						currentView = "proposal-list";
						break;
				}
			} else {
				// User pressed q/Esc, exit the loop
				isRunning = false;
			}
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
