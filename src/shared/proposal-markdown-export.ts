/**
 * Pure-function markdown exporter for a complete proposal.
 *
 * Used by both the TUI (proposal-viewer-with-search.ts) and the web
 * dashboard (ProposalDetailsModal.tsx) to produce a single canonical .md
 * representation that includes every section visible in the detail view —
 * frontmatter, design, criteria, decisions, reviews, discussions, activity.
 *
 * No Node-only or browser-only imports: works in both runtimes.
 */

import type { AcceptanceCriterion, ActivityLogEntry, Proposal } from "./types/index.ts";

export interface DecisionExport {
	decision: string;
	authority?: string;
	rationale?: string | null;
	binding?: boolean;
	decided_at?: string | Date;
}

export interface ReviewExport {
	reviewer_identity?: string;
	verdict?: string;
	notes?: string | null;
	findings?: string | null;
	is_blocking?: boolean;
	reviewed_at?: string | Date;
}

export interface DiscussionExport {
	author_identity?: string;
	context_prefix?: string | null;
	body?: string;
	body_markdown?: string;
	created_at?: string | Date;
}

export interface ProposalExportBundle {
	proposal: Proposal;
	decisions?: DecisionExport[];
	reviews?: ReviewExport[];
	discussions?: DiscussionExport[];
	criteria?: AcceptanceCriterion[];
	activityLog?: ActivityLogEntry[];
}

function ts(value: unknown): string {
	if (!value) return "";
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "string") return value;
	return String(value);
}

function trim(s: string | null | undefined): string {
	return (s ?? "").trim();
}

function section(title: string, body: string): string[] {
	const trimmed = body.trim();
	if (!trimmed) return [];
	return [`## ${title}`, "", trimmed, ""];
}

function arraySection(title: string, items: string[]): string[] {
	const filtered = items.map((s) => s.trim()).filter(Boolean);
	if (filtered.length === 0) return [];
	const lines = [`## ${title}`, ""];
	for (const item of filtered) lines.push(`- ${item}`);
	lines.push("");
	return lines;
}

function frontmatter(p: Proposal): string[] {
	const lines: string[] = ["---"];
	lines.push(`id: ${p.id}`);
	lines.push(`title: ${JSON.stringify(p.title || "")}`);
	if (p.status) lines.push(`status: ${p.status}`);
	if (p.maturity) lines.push(`maturity: ${p.maturity}`);
	if (p.proposalType || p.type) lines.push(`type: ${p.proposalType || p.type}`);
	if (p.priority) lines.push(`priority: ${p.priority}`);
	if (p.assignee?.length) lines.push(`assignee: [${p.assignee.join(", ")}]`);
	if (p.reporter) lines.push(`reporter: ${p.reporter}`);
	if (p.createdDate) lines.push(`createdDate: ${p.createdDate}`);
	if (p.updatedDate) lines.push(`updatedDate: ${p.updatedDate}`);
	if (p.labels?.length) lines.push(`labels: [${p.labels.join(", ")}]`);
	if (p.directive) lines.push(`directive: ${p.directive}`);
	if (p.dependencies?.length) lines.push(`dependencies: [${p.dependencies.join(", ")}]`);
	if (p.references?.length) lines.push(`references: [${p.references.join(", ")}]`);
	if (p.parentProposalId) lines.push(`parent: ${p.parentProposalId}`);
	if (p.builder) lines.push(`builder: ${p.builder}`);
	if (p.auditor) lines.push(`auditor: ${p.auditor}`);
	if (p.branch) lines.push(`branch: ${p.branch}`);
	lines.push("---", "");
	return lines;
}

function criteriaBlock(criteria: AcceptanceCriterion[] | undefined): string[] {
	if (!criteria || criteria.length === 0) return [];
	const lines = ["## Acceptance Criteria", ""];
	const sorted = [...criteria].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
	for (const c of sorted) {
		const box = c.checked ? "[x]" : "[ ]";
		const meta: string[] = [];
		if (c.role) meta.push(`role: ${c.role}`);
		if (c.evidence) meta.push(`evidence: ${c.evidence}`);
		const tail = meta.length ? `  _(${meta.join(" · ")})_` : "";
		lines.push(`- ${box} ${c.text}${tail}`);
	}
	lines.push("");
	return lines;
}

function decisionsBlock(items: DecisionExport[] | undefined): string[] {
	if (!items || items.length === 0) return [];
	const lines = ["## Decisions", ""];
	for (const d of items) {
		const when = ts(d.decided_at);
		const flag = d.binding ? " (binding)" : "";
		lines.push(`### ${trim(d.decision) || "(decision)"}${flag}`);
		const meta: string[] = [];
		if (d.authority) meta.push(`**authority:** ${d.authority}`);
		if (when) meta.push(`**at:** ${when}`);
		if (meta.length) lines.push(meta.join(" · "));
		const rationale = trim(d.rationale ?? "");
		if (rationale) {
			lines.push("");
			lines.push(rationale);
		}
		lines.push("");
	}
	return lines;
}

function reviewsBlock(items: ReviewExport[] | undefined): string[] {
	if (!items || items.length === 0) return [];
	const lines = ["## Reviews", ""];
	for (const r of items) {
		const when = ts(r.reviewed_at);
		const blocking = r.is_blocking ? " (blocking)" : "";
		const verdict = trim(r.verdict ?? "") || "(no verdict)";
		const reviewer = trim(r.reviewer_identity ?? "") || "(unknown reviewer)";
		lines.push(`### ${reviewer} — ${verdict}${blocking}`);
		if (when) lines.push(`**at:** ${when}`);
		const notes = trim(r.notes ?? "");
		if (notes) {
			lines.push("");
			lines.push("**Notes:**");
			lines.push("");
			lines.push(notes);
		}
		const findings = trim(r.findings ?? "");
		if (findings) {
			lines.push("");
			lines.push("**Findings:**");
			lines.push("");
			lines.push(findings);
		}
		lines.push("");
	}
	return lines;
}

function discussionsBlock(items: DiscussionExport[] | undefined): string[] {
	if (!items || items.length === 0) return [];
	const lines = ["## Discussions", ""];
	const sorted = [...items].sort((a, b) => {
		const ta = ts(a.created_at);
		const tb = ts(b.created_at);
		return ta < tb ? -1 : ta > tb ? 1 : 0;
	});
	for (const d of sorted) {
		const when = ts(d.created_at);
		const author = trim(d.author_identity ?? "") || "(unknown)";
		const ctx = trim(d.context_prefix ?? "");
		const head = ctx ? `${author} · ${ctx}` : author;
		lines.push(`### ${head}`);
		if (when) lines.push(`**at:** ${when}`);
		const body = trim(d.body ?? d.body_markdown ?? "");
		if (body) {
			lines.push("");
			lines.push(body);
		}
		lines.push("");
	}
	return lines;
}

function activityBlock(items: ActivityLogEntry[] | undefined): string[] {
	if (!items || items.length === 0) return [];
	const lines = ["## Activity", ""];
	for (const e of items) {
		const reason = e.reason ? ` — ${e.reason}` : "";
		lines.push(`- \`${e.timestamp}\` **${e.actor}** ${e.action}${reason}`);
	}
	lines.push("");
	return lines;
}

export function buildProposalMarkdown(bundle: ProposalExportBundle): string {
	const p = bundle.proposal;
	const lines: string[] = [];

	lines.push(...frontmatter(p));
	lines.push(`# ${p.id} — ${p.title || "(untitled)"}`, "");

	const summary = trim(p.summary ?? "");
	const description = trim(p.description ?? "");
	if (summary) lines.push(...section("Summary", summary));
	else if (description) lines.push(...section("Summary", description));

	lines.push(...section("Motivation", p.motivation ?? ""));

	const design = trim(p.design ?? p.implementationPlan ?? "");
	lines.push(...section("Design", design));

	if (description && summary) {
		lines.push(...section("Description", description));
	}

	lines.push(...section("Drawbacks", p.drawbacks ?? ""));
	lines.push(...section("Alternatives", p.alternatives ?? ""));
	lines.push(...section("Dependency Notes", p.dependency_note ?? ""));

	lines.push(
		...arraySection(
			"Dependencies",
			(p.dependencies ?? []).map((d) => String(d)),
		),
	);
	lines.push(
		...arraySection(
			"References",
			(p.references ?? []).map((d) => String(d)),
		),
	);
	lines.push(
		...arraySection(
			"Required Capabilities",
			(p.required_capabilities ?? p.needs_capabilities ?? []).map((d) => String(d)),
		),
	);
	lines.push(
		...arraySection(
			"Unlocks",
			(p.unlocks ?? []).map((d) => String(d)),
		),
	);

	lines.push(...criteriaBlock(bundle.criteria ?? p.acceptanceCriteriaItems));

	lines.push(...section("Implementation Plan", p.implementationPlan ?? ""));
	lines.push(...section("Implementation Notes", p.implementationNotes ?? ""));
	lines.push(...section("Audit Notes", p.auditNotes ?? ""));
	lines.push(...section("Final Summary", p.finalSummary ?? ""));

	lines.push(...decisionsBlock(bundle.decisions));
	lines.push(...reviewsBlock(bundle.reviews));
	lines.push(...discussionsBlock(bundle.discussions));
	lines.push(...activityBlock(bundle.activityLog ?? p.activityLog));

	lines.push("---", `_Exported ${new Date().toISOString()}_`, "");

	return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function proposalExportFilename(proposal: Proposal): string {
	const id = proposal.id || "proposal";
	const slug = (proposal.title || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	return slug ? `${id}-${slug}-${stamp}.md` : `${id}-${stamp}.md`;
}
