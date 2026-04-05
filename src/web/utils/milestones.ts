/**
 * Re-export directive utilities from core for backward compatibility
 * All business logic lives in src/core/directives.ts
 */
export {
	buildDirectiveBuckets,
	buildDirectiveSummary,
	collectArchivedDirectiveKeys,
	collectDirectiveIds,
	getDirectiveLabel,
	isReachedStatus,
	directiveKey,
	normalizeDirectiveName,
	validateDirectiveName,
} from '../../core/proposal/directives.ts';

// Re-export types from core types
export type { DirectiveBucket, DirectiveSummary } from "../../types/index.ts";
