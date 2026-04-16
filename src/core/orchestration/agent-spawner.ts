/**
 * AgentHive — Agent Spawner (Mode B: CLI process fork)
 *
 * Spawns agent subprocesses inside their dedicated git worktrees.
 * Provider-agnostic: supports Anthropic CLI, OpenAI-compatible, and Google CLI.
 *
 * Security perimeter per spawn:
 *   - cwd        → agent's git worktree (/data/code/worktree/<name>)
 *   - DATABASE_URL → agent's Postgres login user (agent_<name>)
 *   - GIT_CONFIG_GLOBAL → per-agent gitconfig (author identity)
 *   - GIT_CONFIG_NOSYSTEM=1 → never inherit host-level git config
 *
 * The orchestrator calls spawnAgent() with a task payload.
 * The agent process exits when the task is complete; stdout/stderr
 * are captured and stored in agent_runs.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { query } from "../../infra/postgres/pool.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

const WORKTREE_ROOT = "/data/code/worktree";
const GITCONFIG_ROOT = "/data/code/AgentHive/.git/worktrees-config";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentProvider = "claude" | "gemini" | "copilot" | "openclaw";

export interface WorktreeConfig {
	/** Worktree directory name (e.g. "claude-andy") */
	name: string;
	/** Provider type */
	provider: AgentProvider;
	/** Postgres login user */
	dbUser: string;
	/** DB password (from .env.agent — never hardcoded) */
	dbPassword: string;
	/** Branch name */
	branch: string;
}

export interface SpawnRequest {
	/** Worktree name (e.g. "claude-andy") */
	worktree: string;
	/** Task content sent as prompt / message */
	task: string;
	/** Proposal context (optional) */
	proposalId?: number;
	/** Stage context */
	stage?: string;
	/** Preferred model override (provider decides default) */
	model?: string;
	/** Max tokens for this invocation */
	maxTokens?: number;
	/** Wall-clock timeout in milliseconds (default 300 000 = 5 min) */
	timeoutMs?: number;
}

export interface SpawnResult {
	agentRunId: string;
	worktree: string;
	exitCode: number | null;
	stdout: string;
	stderr: string;
	durationMs: number;
}

// ─── Provider CLI builders ────────────────────────────────────────────────────

/**
 * Build the argv + env for an Anthropic Claude CLI invocation.
 * Assumes `claude` is on PATH inside the spawn environment.
 */
function buildClaudeArgs(
	req: SpawnRequest,
	model: string,
): { argv: string[]; env: Record<string, string> } {
	const argv = [
		"claude",
		"--print", // non-interactive: print response and exit
		"--model",
		model,
		req.task,
	];
	return { argv, env: { ANTHROPIC_MODEL: model } };
}

/**
 * Build args for an OpenAI-compatible CLI (covers OpenRouter, Ollama, MiniMax, OpenClaw).
 * Uses the `llm` CLI tool (https://llm.datasette.io) which supports --model and --system.
 * Falls back to `openai` CLI if `llm` is unavailable.
 */
function buildOpenAICompatArgs(
	req: SpawnRequest,
	model: string,
	baseUrl?: string,
): { argv: string[]; env: Record<string, string> } {
	const argv = ["llm", "--model", model, req.task];
	const env: Record<string, string> = {};
	if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
	return { argv, env };
}

/**
 * Build args for Google Gemini CLI.
 * Assumes `gemini` CLI is on PATH.
 */
function buildGeminiArgs(
	req: SpawnRequest,
	model: string,
): { argv: string[]; env: Record<string, string> } {
	const argv = ["gemini", "--model", model, "--prompt", req.task];
	return { argv, env: {} };
}

// ─── Worktree config loader ───────────────────────────────────────────────────

/** Parse .env.agent file — returns key/value pairs. */
async function loadEnvAgent(
	worktreeName: string,
): Promise<Record<string, string>> {
	const path = join(WORKTREE_ROOT, worktreeName, ".env.agent");
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		throw new Error(
			`Cannot read .env.agent for worktree "${worktreeName}" at ${path}`,
		);
	}

	const env: Record<string, string> = {};
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		const val = trimmed.slice(eq + 1).trim();
		// Expand ${VAR} references using already-parsed keys
		env[key] = val.replace(
			/\$\{([^}]+)\}/g,
			(_, k) => env[k] ?? process.env[k] ?? "",
		);
	}
	return env;
}

/** Detect provider from worktree name prefix. */
function detectProvider(worktreeName: string): AgentProvider {
	if (worktreeName.startsWith("claude")) return "claude";
	if (worktreeName.startsWith("gemini")) return "gemini";
	if (worktreeName.startsWith("copilot")) return "copilot";
	if (worktreeName.startsWith("openclaw")) return "openclaw";
	throw new Error(`Unknown provider prefix for worktree "${worktreeName}"`);
}

// ─── P235: Platform-Aware Model Constraints ──────────────────────────────────

/** Hard-coded platform defaults used when route lookup fails. */
const PROVIDER_DEFAULTS: Record<AgentProvider, string> = {
	claude: "claude-sonnet-4-6",
	gemini: "gemini-2.0-flash",
	copilot: "gpt-4o",
	openclaw: "xiaomi/mimo-v2-pro",
};

/**
 * P235: Resolve and validate model hint against platform constraints.
 *
 * Queries model_routes to confirm there is an enabled route for this
 * (model_name, agent_provider) combination. Prevents cross-platform model
 * leakage (e.g., a claude-sonnet hint passed to an openclaw/Hermes worktree).
 *
 * If no hint is given, returns the lowest-priority enabled route for this
 * agent_provider (i.e., the token-plan route first, then api_key fallback).
 */
async function resolveModel(
	provider: AgentProvider,
	hint?: string,
): Promise<string> {
	const defaultModel = PROVIDER_DEFAULTS[provider];

	if (hint) {
		// Validate: check model_routes for an enabled route matching (hint, provider)
		const { rows } = await query<{ model_name: string; plan_type: string | null }>(
			`SELECT model_name, plan_type
       FROM roadmap.model_routes
       WHERE model_name = $1 AND agent_provider = $2 AND is_enabled = true
       ORDER BY priority ASC
       LIMIT 1`,
			[hint, provider],
		);

		if (rows.length === 0) {
			// No enabled route for this (model, agent_provider) — cross-platform or disabled
			console.warn(
				`[P235] No enabled route for model "${hint}" with agent_provider "${provider}". ` +
					`Falling back to "${defaultModel}".`,
			);
			return defaultModel;
		}
		// Route exists — use hint as-is (route may be token_plan or api_key)
		return hint;
	}

	// No hint: pick lowest-priority (cheapest) enabled model for this provider
	const { rows } = await query<{ model_name: string }>(
		`SELECT model_name
     FROM roadmap.model_routes
     WHERE agent_provider = $1 AND is_enabled = true
     ORDER BY priority ASC, cost_per_1k_input ASC
     LIMIT 1`,
		[provider],
	);

	if (rows.length > 0) return rows[0].model_name;

	// No routes in DB at all — use hard-coded default
	return defaultModel;
}

async function buildProposalContextPackage(input: {
	proposalId: number;
	taskType: string;
	agentIdentity: string;
	maxTokens: number;
}): Promise<string> {
	const { rows } = await query<{
		display_id: string | null;
		title: string;
		status: string;
		summary: string | null;
		design: string | null;
	}>(
		`SELECT display_id, title, status, summary, design
     FROM roadmap_proposal.proposal
     WHERE id = $1
     LIMIT 1`,
		[input.proposalId],
	);
	const proposal = rows[0];
	if (!proposal) {
		return [
			"## Proposal Context",
			`- Proposal: #${input.proposalId}`,
			`- Task type: ${input.taskType}`,
			`- Agent: ${input.agentIdentity}`,
			"- Source: proposal not found",
		].join("\n");
	}

	const context = [
		"## Proposal Context",
		`- Proposal: ${proposal.display_id ?? `#${input.proposalId}`}`,
		`- Title: ${proposal.title}`,
		`- Status: ${proposal.status}`,
		`- Task type: ${input.taskType}`,
		`- Agent: ${input.agentIdentity}`,
		proposal.summary ? `\n### Summary\n${proposal.summary}` : "",
		proposal.design ? `\n### Design\n${proposal.design}` : "",
	]
		.filter(Boolean)
		.join("\n");
	const maxChars = Math.max(1000, input.maxTokens * 4);
	return context.length > maxChars
		? `${context.slice(0, maxChars)}\n...`
		: context;
}

// ─── Core spawn logic ─────────────────────────────────────────────────────────

/**
 * Spawn an agent subprocess inside its worktree.
 * Records the run in agent_runs and agent_budget_ledger.
 */
export async function spawnAgent(req: SpawnRequest): Promise<SpawnResult> {
	const {
		worktree,
		task,
		proposalId,
		stage,
		model: modelHint,
		timeoutMs = 300_000,
	} = req;

	const provider = detectProvider(worktree);
	const model = await resolveModel(provider, modelHint); // P235: async platform validation
	const agentEnv = await loadEnvAgent(worktree);
	let assembledTask = task;

	if (proposalId !== undefined) {
		const contextPackage = await buildProposalContextPackage({
			proposalId,
			taskType: stage ?? "unknown",
			agentIdentity: worktree,
			maxTokens: 2000,
		});
		assembledTask = `${contextPackage}\n\n## Task\n${task}`;
	}

	const spawnReq = { ...req, task: assembledTask };

	// Build provider-specific argv and additional env
	let argv: string[];
	let extraEnv: Record<string, string>;

	switch (provider) {
		case "claude":
			({ argv, env: extraEnv } = buildClaudeArgs(spawnReq, model));
			break;
		case "gemini":
			({ argv, env: extraEnv } = buildGeminiArgs(spawnReq, model));
			break;
		case "copilot":
		case "openclaw":
			({ argv, env: extraEnv } = buildOpenAICompatArgs(spawnReq, model));
			break;
	}

	// Assemble process environment (agent-scoped, not inheriting secrets from host)
	const processEnv: Record<string, string> = {
		// Carry through essential PATH
		PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
		HOME: process.env.HOME ?? "/root",
		// Agent-specific overrides from .env.agent
		DATABASE_URL: agentEnv.DATABASE_URL ?? "",
		AGENT_WORKTREE: worktree,
		AGENT_PROVIDER: provider,
		// Git identity isolation
		GIT_CONFIG_GLOBAL: `${GITCONFIG_ROOT}/${worktree}.gitconfig`,
		GIT_CONFIG_NOSYSTEM: "1",
		// API keys: pass through from host environment (agents need them)
		...(process.env.ANTHROPIC_API_KEY && {
			ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
		}),
		...(process.env.GEMINI_API_KEY && {
			GEMINI_API_KEY: process.env.GEMINI_API_KEY,
		}),
		...(process.env.OPENAI_API_KEY && {
			OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		}),
		// Provider-specific overrides from argv builder
		...extraEnv,
	};

	// Insert agent_runs row (status = running)
	const { rows } = await query(
		`INSERT INTO agent_runs
       (proposal_id, display_id, agent_identity, stage, model_used, status, started_at)
     VALUES ($1, $2, $3, $4, $5, 'running', now())
     RETURNING id`,
		[proposalId ?? null, `wt:${worktree}`, worktree, stage ?? "unknown", model],
	);
	const agentRunId = String(rows[0].id);

	const startMs = Date.now();
	const cwd = join(WORKTREE_ROOT, worktree);

	const { stdout, stderr, exitCode } = await runProcess(
		argv,
		cwd,
		processEnv,
		timeoutMs,
	);
	const durationMs = Date.now() - startMs;

	// Update agent_runs on completion
	const status = exitCode === 0 ? "completed" : "failed";
	await query(
		`UPDATE agent_runs
     SET status = $1, duration_ms = $2, output_summary = $3, completed_at = now()
     WHERE id = $4`,
		[status, durationMs, stdout.slice(0, 500), agentRunId],
	);

	return { agentRunId, worktree, exitCode, stdout, stderr, durationMs };
}

// ─── Process runner ───────────────────────────────────────────────────────────

interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

function runProcess(
	argv: string[],
	cwd: string,
	env: Record<string, string>,
	timeoutMs: number,
): Promise<ProcessResult> {
	return new Promise((resolve) => {
		const [cmd, ...args] = argv;
		const child: ChildProcess = spawn(cmd, args, {
			cwd,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (d: Buffer) => {
			stdout += d.toString();
		});
		child.stderr?.on("data", (d: Buffer) => {
			stderr += d.toString();
		});

		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			stderr += "\n[agent-spawner] Killed after timeout";
		}, timeoutMs);

		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ stdout, stderr, exitCode: code });
		});

		child.on("error", (err) => {
			clearTimeout(timer);
			resolve({
				stdout,
				stderr: `${stderr}\n[agent-spawner] spawn error: ${err.message}`,
				exitCode: null,
			});
		});
	});
}

// ─── Escalation ladder helper ─────────────────────────────────────────────────

/**
 * Escalation ladder: basic → standard → advanced → premium → USER.
 *
 * Called when a spawn returns a non-zero exit code or known error patterns.
 * Each escalation step retries with a stronger model.
 * If all models fail, inserts a CRITICAL notification_queue row for the USER.
 */
export async function escalateOrNotify(
	req: SpawnRequest,
	result: SpawnResult,
	proposalId?: number,
): Promise<SpawnResult | null> {
	const provider = detectProvider(req.worktree);

	// P235: build ladder from model_routes, filtered to this agent_provider
	// Ordered by cost_per_1k_input ASC (cheap → expensive = escalation order)
	const { rows: ladderRows } = await query<{ model_name: string }>(
		`SELECT DISTINCT ON (model_name) model_name, cost_per_1k_input
     FROM roadmap.model_routes
     WHERE agent_provider = $1 AND is_enabled = true
     ORDER BY model_name, priority ASC, cost_per_1k_input ASC`,
		[provider],
	);

	const ladder = ladderRows.map((r) => r.model_name);

	if (ladder.length === 0) {
		// No models in registry for this provider — skip escalation, notify
		await query(
			`INSERT INTO notification_queue (proposal_id, severity, channel, title, body)
       VALUES ($1, 'CRITICAL', 'discord', $2, $3)`,
			[
				proposalId ?? null,
				`Agent task failed — no escalation ladder for provider "${provider}"`,
				`Worktree: ${result.worktree}\nExit: ${result.exitCode}\nStderr: ${result.stderr.slice(0, 400)}`,
			],
		);
		return null;
	}

	// Find current position (req.model is the model used for this run)
	const currentModel = req.model ?? PROVIDER_DEFAULTS[provider];
	const currentIdx = ladder.indexOf(currentModel);
	const nextIdx = currentIdx + 1;

	if (nextIdx < ladder.length) {
		const nextModel = ladder[nextIdx];
		console.log(
			`[escalate] ${provider} ladder: "${currentModel}" → "${nextModel}" (step ${nextIdx}/${ladder.length - 1})`,
		);
		return spawnAgent({ ...req, model: nextModel });
	}

	// All escalations exhausted — notify USER
	await query(
		`INSERT INTO notification_queue (proposal_id, severity, channel, title, body)
     VALUES ($1, 'CRITICAL', 'discord', $2, $3)`,
		[
			proposalId ?? null,
			`Agent task failed after full escalation ladder`,
			`Worktree: ${result.worktree}\nExit: ${result.exitCode}\nStderr: ${result.stderr.slice(0, 400)}`,
		],
	);

	return null;
}
