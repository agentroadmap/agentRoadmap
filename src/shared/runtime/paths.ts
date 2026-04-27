/**
 * Central path resolution.
 *
 * The harness was historically full of /home/xiaomi, /data/code/AgentHive,
 * and /data/code/worktree literals. Those literals break every time the
 * deployment moves to a different host or operator, so we route them
 * through env-overridable accessors that fail loudly when not configured.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";

import { AgentHiveConfigError } from "./endpoints.ts";

const PROJECT_ROOT_ENV = "AGENTHIVE_PROJECT_ROOT";
const WORKTREE_ROOT_ENV = "AGENTHIVE_WORKTREE_ROOT";
const HOME_ENV = "AGENTHIVE_HOME";

let projectRootCache: string | null = null;
let worktreeRootCache: string | null = null;

/**
 * Resolve the AgentHive project root.
 * Order: $AGENTHIVE_PROJECT_ROOT → CWD if it contains roadmap/.
 *
 * Throws AgentHiveConfigError if it cannot be determined deterministically.
 */
export function getProjectRoot(): string {
	if (projectRootCache !== null) return projectRootCache;

	const fromEnv = process.env[PROJECT_ROOT_ENV]?.trim();
	if (fromEnv) {
		projectRootCache = resolve(fromEnv);
		return projectRootCache;
	}

	const cwd = process.cwd();
	if (/AgentHive(\/|$)/.test(cwd)) {
		projectRootCache = cwd.replace(/(AgentHive)(\/.*)?$/, "$1");
		return projectRootCache;
	}

	throw new AgentHiveConfigError(
		`Project root not configured. Set ${PROJECT_ROOT_ENV} or run from inside the AgentHive checkout.`,
	);
}

/**
 * Resolve the worktree root.
 * Order: $AGENTHIVE_WORKTREE_ROOT → sibling "worktree" dir next to project root.
 */
export function getWorktreeRoot(): string {
	if (worktreeRootCache !== null) return worktreeRootCache;

	const fromEnv = process.env[WORKTREE_ROOT_ENV]?.trim();
	if (fromEnv) {
		worktreeRootCache = resolve(fromEnv);
		return worktreeRootCache;
	}

	// Sibling-of-project-root convention (CONVENTIONS.md §5).
	const project = getProjectRoot();
	worktreeRootCache = resolve(project, "..", "worktree");
	return worktreeRootCache;
}

/**
 * Resolve the operator's home directory.
 *
 * Order: $AGENTHIVE_HOME → $HOME → os.homedir().
 * The result is whatever the runtime says — never a hardcoded host literal.
 */
export function getHomeDir(): string {
	const explicit = process.env[HOME_ENV]?.trim();
	if (explicit) return resolve(explicit);
	const home = process.env.HOME?.trim();
	if (home) return resolve(home);
	return homedir();
}

/**
 * Reset memoised paths. Test-only.
 * @internal
 */
export function clearPathsCache(): void {
	projectRootCache = null;
	worktreeRootCache = null;
}
