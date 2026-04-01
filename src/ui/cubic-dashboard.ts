/**
 * Cubic Dashboard View
 *
 * Shows cubics grouped by phase, agent roster, and model usage.
 * Third view accessible via Tab in the board.
 */

// @ts-ignore - blessed types may not be installed
import type blessed from "blessed";
import { getRecentEvents } from '../core/messaging/event-stream.ts';

export interface CubicData {
	cubicId: string;
	phase: string;
	status: string;
	agents: AgentData[];
	createdAt: number;
}

export interface AgentData {
	id: string;
	name: string;
	role: string;
	status: string;
	currentCubic?: string;
	model?: string;
	activeSteps: StepInfo[];
}

export interface StepInfo {
	stepId: string;
	title: string;
	status: string;
}

export interface ModelUsage {
	model: string;
	tokens: number;
	cost: number;
	calls: number;
}

export function renderCubicDashboard(
	screen: blessed.Widgets.Screen,
	data: {
		cubics: CubicData[];
		agents: AgentData[];
		models: ModelUsage[];
	},
): void {
	const { cubics, agents, models } = data;

	// Clear screen
	screen.children.forEach((child: any) => child.destroy());

	// Main container
	const container = (screen as any).box({
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		tags: true,
		scrollable: false,
	});

	// Header
	const headerBox = (screen as any).box({
		parent: container,
		top: 0,
		left: 0,
		width: "100%",
		height: 3,
		tags: true,
		content: `{bold}{cyan-fg}🧩 Cubic Dashboard{/} | Cubics: ${cubics.length} | Agents: ${agents.length} | Phases: D B T S{/}`,
		border: { type: "line", bottom: true },
		style: { border: { fg: "cyan" } },
	});

	// Phase sections (2x2 grid)
	const phases = [
		{ name: "🔮 Design", phase: "design", top: 3, left: 0, width: "50%", height: "40%-3" },
		{ name: "🔨 Build", phase: "build", top: 3, left: "50%", width: "50%", height: "40%-3" },
		{ name: "🧪 Test", phase: "test", top: "43%", left: 0, width: "50%", height: "40%" },
		{ name: "🚀 Ship", phase: "ship", top: "43%", left: "50%", width: "50%", height: "40%" },
	];

	for (const p of phases) {
		const phaseCubics = cubics.filter((c) => c.phase === p.phase);
		const phaseAgents = agents.filter((a) =>
			phaseCubics.some((c) => c.cubicId === a.currentCubic),
		);

		const box = (screen as any).box({
			parent: container,
			top: p.top,
			left: p.left,
			width: p.width,
			height: p.height,
			border: { type: "line" },
			label: ` ${p.name} (${phaseCubics.length}) `,
			tags: true,
			scrollable: true,
			alwaysScroll: true,
			style: { border: { fg: getPhaseColor(p.phase) } },
		});

		if (phaseCubics.length === 0) {
			box.setContent("  {gray-fg}No cubics active{/}");
		} else {
			const lines: string[] = [];
			for (const cubic of phaseCubics) {
				const statusIcon = cubic.status === "active" ? "🟢" : "🔴";
				lines.push(`${statusIcon} {bold}${cubic.cubicId}{/bold}`);
				for (const agent of cubic.agents) {
					const agentIcon = agent.status === "active" ? "●" : "○";
					const modelTag = agent.model ? ` {yellow-fg}[${agent.model}]{/}` : "";
					lines.push(`  ${agentIcon} ${agent.name} (${agent.role})${modelTag}`);
					// Show what steps this agent is working on
					if (agent.activeSteps && agent.activeSteps.length > 0) {
						for (const step of agent.activeSteps) {
							const stepIcon = step.status === "Active" ? "🔨" : step.status === "Review" ? "👀" : "📋";
							lines.push(`     ${stepIcon} ${step.stepId} - ${step.title.substring(0, 40)}`);
						}
					} else {
						lines.push(`     {gray-fg}○ No active steps{/}`);
					}
				}
			}
			box.setContent(lines.join("\n"));
		}
	}

	// Footer with model usage
	const footerTop = "83%";
	const footer = (screen as any).box({
		parent: container,
		top: footerTop,
		left: 0,
		width: "100%",
		height: "17%",
		border: { type: "line" },
		label: " 📊 Model Usage ",
		tags: true,
		style: { border: { fg: "yellow" } },
	});

	if (models.length > 0) {
		const modelLines = models.map((m) => {
			const tokens = m.tokens > 1000000 ? `${(m.tokens / 1000000).toFixed(1)}M` : `${(m.tokens / 1000).toFixed(0)}K`;
			const cost = `$${m.cost.toFixed(2)}`;
			return `{bold}${m.model}{/bold}: ${tokens} tokens | ${cost} | ${m.calls} calls`;
		});
		footer.setContent(modelLines.join("\n"));
	} else {
		footer.setContent("  {gray-fg}No model usage data{/}");
	}

	// Events strip at bottom
	const eventsBox = (screen as any).box({
		parent: container,
		bottom: 0,
		left: 0,
		width: "100%",
		height: 1,
		tags: true,
		style: { bg: "black" },
	});

	const recentEvents = getRecentEvents(5);
	if (recentEvents.length > 0) {
		const eventLine = recentEvents
			.map((e) => {
				const icon: Record<string, string> = { proposal_accepted: "📋", proposal_claimed: "✋", proposal_coding: "💻", proposal_complete: "🎉", proposal_merged: "🔀", proposal_pushed: "🚀", agent_online: "🟢", agent_offline: "🔴", handoff: "🤝", cubic_phase_change: "🔄", custom: "✨", heartbeat: "💓", message: "💬", proposal_reviewing: "👀", review_failed: "❌", review_passed: "✅", review_requested: "🔔" };
				return `${icon[e.type] || "📌"} ${e.message}`;
			})
			.join(" │ ");
		eventsBox.setContent(eventLine);
	}

	screen.render();
}

function getPhaseColor(phase: string): string {
	const colors: Record<string, string> = {
		design: "magenta",
		build: "blue",
		test: "yellow",
		ship: "green",
	};
	return colors[phase] || "white";
}
