import yaml from "js-yaml";
import type { SMDLRoot, SMDLTransition, SMDLWorkflow } from "./smdl-loader.ts";

export type SMDLMermaidInput = SMDLRoot | SMDLWorkflow | string;

type NormalizedWorkflow = SMDLWorkflow;

function normalizeWorkflow(input: SMDLMermaidInput): NormalizedWorkflow {
	const parsed =
		typeof input === "string" ? (yaml.load(input) as SMDLRoot) : input;
	const workflow = "workflow" in parsed ? parsed.workflow : parsed;
	if (!workflow?.stages?.length) {
		throw new Error("Invalid SMDL: workflow.stages is required");
	}
	if (!workflow?.transitions?.length) {
		throw new Error("Invalid SMDL: workflow.transitions is required");
	}
	return workflow;
}

function stateId(name: string): string {
	return name.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([0-9])/, "_$1");
}

function quoteLabel(label: string): string {
	return label.replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
}

function transitionLabel(transition: SMDLTransition): string {
	const parts: string[] = [];
	if (transition.labels.length) {
		parts.push(transition.labels.join(", "));
	}
	if (transition.allowed_roles.length) {
		parts.push(`roles: ${transition.allowed_roles.join(", ")}`);
	}
	if (transition.requires_ac) {
		parts.push("requires AC");
	}
	if (transition.gating?.type) {
		parts.push(`gate: ${transition.gating.type}`);
	}
	return quoteLabel(parts.join(" | "));
}

export function smdlToMermaid(input: SMDLMermaidInput): string {
	const workflow = normalizeWorkflow(input);
	const stages = [...workflow.stages].sort((a, b) => a.order - b.order);
	const stageIds = new Map(
		stages.map((stage) => [stage.name, stateId(stage.name)]),
	);
	const lines = [
		"stateDiagram-v2",
		`  title ${quoteLabel(workflow.name)}`,
		"  direction LR",
	];

	for (const stage of stages) {
		const id = stageIds.get(stage.name) ?? stateId(stage.name);
		lines.push(`  state "${quoteLabel(stage.name)}" as ${id}`);
		const notes = [
			stage.description,
			stage.requires_ac ? "requires AC" : undefined,
			stage.maturity_gate !== undefined
				? `maturity gate ${stage.maturity_gate}`
				: undefined,
			stage.quorum?.required_count
				? `quorum ${stage.quorum.required_count}`
				: undefined,
		].filter(Boolean);
		if (notes.length) {
			lines.push(`  note right of ${id}: ${quoteLabel(notes.join(" | "))}`);
		}
	}

	const start = workflow.start_stage ?? stages[0]?.name;
	if (start && stageIds.has(start)) {
		lines.push(`  [*] --> ${stageIds.get(start)}`);
	}

	for (const transition of workflow.transitions) {
		const from = stageIds.get(transition.from) ?? stateId(transition.from);
		const to = stageIds.get(transition.to) ?? stateId(transition.to);
		const label = transitionLabel(transition);
		lines.push(label ? `  ${from} --> ${to}: ${label}` : `  ${from} --> ${to}`);
	}

	for (const terminal of workflow.terminal_stages ?? []) {
		const id = stageIds.get(terminal);
		if (id) {
			lines.push(`  ${id} --> [*]`);
		}
	}

	return `${lines.join("\n")}\n`;
}
