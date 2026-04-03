/**
 * Cockpit Dashboard View
 *
 * The "Engineer's Cockpit" for real-time monitoring and control of the agent workforce.
 * Shows Workforce Pulse, Pipeline Status, Spending Ledger, and Terminal Messages.
 */

// @ts-ignore - blessed types may not be installed
import type blessed from "blessed";

export interface WorkforceAgent {
	id: string;
	name: string;
	role: string;
	status: "active" | "zombie" | "offline";
	currentProposal?: string;
	statusMessage: string;
	lastSeen?: number;
}

export interface PipelineProposal {
	id: string;
	display_id: string;
	title: string;
	status: string;
	priority: string;
	proposal_type: string;
}

export interface LedgerEntry {
	agent: string;
	dailyLimit: number;
	spentToday: number;
	totalSpent: number;
	isFrozen: boolean;
}

export interface TerminalMessage {
	sender_identity: string;
	content: string;
	timestamp: number;
}

export function renderCockpit(
	screen: blessed.Widgets.Screen,
	data: {
		agents: WorkforceAgent[];
		proposals: PipelineProposal[];
		ledger: LedgerEntry[];
		messages: TerminalMessage[];
	},
): void {
	const { agents, proposals, ledger, messages } = data;

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
		content: `{bold}{cyan-fg}🚀 ENGINEER'S COCKPIT{/} | Agents: ${agents.length} | Pipeline: ${proposals.length} | Status: {green-fg}ONLINE{/}`,
		border: { type: "line", bottom: true },
		style: { border: { fg: "cyan" } },
	});

	// 1. Workforce [Top Left]
	const workforceBox = (screen as any).box({
		parent: container,
		top: 3,
		left: 0,
		width: "50%",
		height: "50%-3",
		border: { type: "line" },
		label: " [F1] Workforce Pulse ",
		tags: true,
		scrollable: true,
		alwaysScroll: true,
		style: { border: { fg: "green" } },
	});

	if (agents.length === 0) {
		workforceBox.setContent("  {gray-fg}No agents registered{/}");
	} else {
		const lines = agents.map(a => {
			const icon = a.status === "active" ? "🟢" : a.status === "zombie" ? "🧟" : "⚪";
			const proposal = a.currentProposal ? ` {yellow-fg}[${a.currentProposal}]{/}` : "";
			return `${icon} {bold}${a.id}{/bold} (${a.role})${proposal}\n   └─ ${a.statusMessage}`;
		});
		workforceBox.setContent(lines.join("\n"));
	}

	// 2. Pipeline [Top Right]
	const pipelineBox = (screen as any).box({
		parent: container,
		top: 3,
		left: "50%",
		width: "50%",
		height: "50%-3",
		border: { type: "line" },
		label: " [F4] Pipeline Traffic ",
		tags: true,
		scrollable: true,
		alwaysScroll: true,
		style: { border: { fg: "magenta" } },
	});

	const statusCounts: Record<string, number> = {};
	proposals.forEach(p => {
		statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
	});

	const pipelineLines: string[] = [];
	const statuses = ["New", "Draft", "Active", "Review", "Accepted", "Complete"];
	statuses.forEach(s => {
		const count = statusCounts[s] || 0;
		const color = s === "Active" ? "yellow-fg" : s === "Complete" ? "green-fg" : "gray-fg";
		pipelineLines.push(`{${color}}${s.padEnd(10)}{/} : ${count}`);
	});
	pipelineLines.push("\n{bold}Recent Activity:{/}");
	proposals.slice(-5).reverse().forEach(p => {
		pipelineLines.push(`• ${p.display_id}: ${p.title.substring(0, 30)}...`);
	});
	pipelineBox.setContent(pipelineLines.join("\n"));

	// 3. Ledger [Bottom Left]
	const ledgerBox = (screen as any).box({
		parent: container,
		top: "50%",
		left: 0,
		width: "50%",
		height: "50%-1",
		border: { type: "line" },
		label: " [F2] The Ledger (Spending) ",
		tags: true,
		scrollable: true,
		alwaysScroll: true,
		style: { border: { fg: "yellow" } },
	});

	if (ledger.length === 0) {
		ledgerBox.setContent("  {gray-fg}No spending data{/}");
	} else {
		const ledgerLines = ledger.map(l => {
			const status = l.isFrozen ? "{red-fg}FROZEN{/}" : "{green-fg}ACTIVE{/}";
			const percent = ((l.spentToday / l.dailyLimit) * 100).toFixed(0);
			return `{bold}${l.agent.padEnd(10)}{/} | ${status} | $${l.spentToday.toFixed(2)} / $${l.dailyLimit.toFixed(0)} (${percent}%)`;
		});
		ledgerBox.setContent(ledgerLines.join("\n"));
	}

	// 4. Terminal [Bottom Right]
	const terminalBox = (screen as any).box({
		parent: container,
		top: "50%",
		left: "50%",
		width: "50%",
		height: "50%-1",
		border: { type: "line" },
		label: " [F3] Terminal bridge ",
		tags: true,
		scrollable: true,
		alwaysScroll: true,
		style: { border: { fg: "cyan" } },
	});

	if (messages.length === 0) {
		terminalBox.setContent("  {gray-fg}No messages{/}");
	} else {
		const messageLines = messages.map(m => {
			const time = new Date(Number(m.timestamp) / 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			return `[{gray-fg}${time}{/}] {bold}${m.sender_identity}{/}: ${m.content}`;
		});
		terminalBox.setContent(messageLines.join("\n"));
	}

	// Events strip at bottom
	const footerBox = (screen as any).box({
		parent: container,
		bottom: 0,
		left: 0,
		width: "100%",
		height: 1,
		tags: true,
		style: { bg: "black" },
		content: " {white-fg}Tab: Switch View | Q: Exit | F1-F4: Info Sections{/}"
	});

	screen.render();
}
