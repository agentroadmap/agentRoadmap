import { createHash } from "node:crypto";

export type TaskType =
	| "gate_review"
	| "code_gen"
	| "research"
	| "review"
	| "test_writing"
	| string;

export interface ContextSection {
	title: string;
	body: string;
	priority?: number;
}

export interface ContextPackageInput {
	proposalId: string;
	taskType: TaskType;
	taskSummary: string;
	sections: ContextSection[];
	maxTokens?: number;
}

export interface DriftMonitorConfig {
	checkEvery?: number;
	relevanceThreshold?: number;
	criticalThreshold?: number;
}

export interface DriftMonitorEvent {
	iteration: number;
	score: number;
	level: "ok" | "warn" | "critical";
}

export function estimateTokenCount(text: string): number {
	if (!text) return 0;
	return Math.max(1, Math.ceil(text.length / 4));
}

export function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}
	const entries = Object.entries(value as Record<string, unknown>)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
	return `{${entries.join(",")}}`;
}

export function makeCacheKey(namespace: string, value: unknown): string {
	return createHash("sha256")
		.update(`${namespace}:${stableStringify(value)}`)
		.digest("hex");
}

export function scoreRelevance(output: string, taskDescription: string): number {
	const taskTerms = taskDescription
		.toLowerCase()
		.split(/[^a-z0-9]+/g)
		.filter((term) => term.length > 3);
	if (taskTerms.length === 0) return 1;

	const lowered = output.toLowerCase();
	const matches = taskTerms.filter((term) => lowered.includes(term)).length;
	return Math.min(1, matches / taskTerms.length);
}

export function createDriftMonitor(
	taskDescription: string,
	config: DriftMonitorConfig = {},
) {
	const checkEvery = Math.max(1, config.checkEvery ?? 5);
	const relevanceThreshold = config.relevanceThreshold ?? 0.6;
	const criticalThreshold = config.criticalThreshold ?? 0.3;
	let iterations = 0;

	return {
		record(outputChunk: string): DriftMonitorEvent | null {
			iterations += 1;
			if (iterations % checkEvery !== 0) return null;

			const score = scoreRelevance(outputChunk, taskDescription);
			if (score < criticalThreshold) {
				return { iteration: iterations, score, level: "critical" };
			}
			if (score < relevanceThreshold) {
				return { iteration: iterations, score, level: "warn" };
			}
			return { iteration: iterations, score, level: "ok" };
		},
	};
}

export function trimToTokenBudget(text: string, maxTokens: number): string {
	if (estimateTokenCount(text) <= maxTokens) return text;
	const maxChars = Math.max(0, maxTokens * 4);
	return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function sectionTokenBudget(maxTokens: number, sections: ContextSection[]): ContextSection[] {
	const ordered = [...sections].sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
	const kept: ContextSection[] = [];
	let total = 0;

	for (const section of ordered) {
		const text = `## ${section.title}\n\n${section.body.trim()}`.trim();
		const tokens = estimateTokenCount(text);
		if (total + tokens > maxTokens && kept.length > 0) continue;
		if (tokens > maxTokens && kept.length === 0) {
			const trimmedBody = trimToTokenBudget(section.body, Math.max(1, maxTokens - 8));
			const trimmedSection = {
				...section,
				body: trimmedBody,
			};
			kept.push(trimmedSection);
			total += estimateTokenCount(
				`## ${trimmedSection.title}\n\n${trimmedSection.body.trim()}`,
			);
			continue;
		}
		kept.push(section);
		total += tokens;
	}

	return kept;
}

export function buildContextPackage(input: ContextPackageInput): string {
	const maxTokens = input.maxTokens ?? 2000;
	const header = [
		`task_type: ${input.taskType}`,
		`proposal_id: ${input.proposalId}`,
		`target_tokens: ${maxTokens}`,
		`task_summary: ${input.taskSummary.trim()}`,
	].join("\n");

	const bodySections = sectionTokenBudget(
		Math.max(200, maxTokens - estimateTokenCount(header) - 50),
		input.sections,
	);

	const renderedSections = bodySections
		.map((section) => `## ${section.title}\n\n${section.body.trim()}`)
		.join("\n\n");

	return [
		"---",
		header,
		"---",
		renderedSections,
	].join("\n");
}
