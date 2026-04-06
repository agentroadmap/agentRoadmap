export * from "./readme.ts";
// Types

export {
	_loadAgentGuideline,
	type AgentInstructionFile,
	addAgentInstructions,
	type EnsureMcpGuidelinesResult,
	ensureMcpGuidelines,
	installClaudeAgent,
} from "./agent-instructions.ts";
// Constants
export * from "./constants/index.ts";
// Project root discovery
export { requireProjectRoot, getProjectRoot, findRoadmapRoot } from "./utils/project-root.ts";

// Core entry point
export { Core } from "./core/roadmap.ts";
export { SearchService } from './core/infrastructure/search-service.ts';

// File system operations
export { FileSystem } from "./file-system/operations.ts";

// Git operations
export {
	GitOperations,
	initializeGitRepository,
	isGitRepository,
} from "./git/operations.ts";
// Markdown operations
export * from "./markdown/parser.ts";
export * from "./markdown/serializer.ts";
export * from "./types/index.ts";
