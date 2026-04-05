/**
 * Default directory structure for roadmap projects
 */
export const DEFAULT_DIRECTORIES = {
	/** Main roadmap directory */
	ROADMAP: "roadmap",
	/** Active proposals directory */
	STATES: "proposals",
	/** Draft proposals directory */
	DRAFTS: "drafts",
	/** Completed proposals directory */
	COMPLETED: "completed",
	/** Archive root directory */
	ARCHIVE: "archive",
	/** Archived proposals directory */
	ARCHIVE_STATES: "archive/proposals",
	/** Archived drafts directory */
	ARCHIVE_DRAFTS: "archive/drafts",
	/** Archived directives directory */
	ARCHIVE_MILESTONES: "archive/directives",
	/** Documentation directory */
	DOCS: "docs",
	/** Decision logs directory */
	DECISIONS: "decisions",
	/** Directives directory */
	MILESTONES: "directives",
} as const;

/**
 * Default configuration file names
 */
export const DEFAULT_FILES = {
	/** Main configuration file */
	CONFIG: "config.yml",
	/** Local user settings file */
	USER: ".user",
} as const;

/**
 * Default proposal statuses
 */
export const DEFAULT_STATUSES = ["Draft", "Review", "Building", "Accepted", "Complete", "Rejected", "Abandoned", "Replaced"] as const;

/**
 * Fallback status when no default is configured
 */
export const FALLBACK_STATUS = "Draft";

/**
 * Maximum width for wrapped text lines in UI components
 */
export const WRAP_LIMIT = 72;

/**
 * Default values for advanced configuration options used during project initialization.
 * Shared between CLI and browser wizard to ensure consistent defaults.
 */
export const DEFAULT_INIT_CONFIG = {
	checkActiveBranches: true,
	remoteOperations: true,
	activeBranchDays: 30,
	bypassGitHooks: false,
	autoCommit: true,
	zeroPaddedIds: undefined as number | undefined,
	defaultEditor: undefined as string | undefined,
	defaultPort: 6420,
	autoOpenBrowser: true,
} as const;

/**
 * Default duration for proposal claims in minutes.
 * Used for lease-based claiming semantics.
 */
export const DEFAULT_CLAIM_DURATION_MINUTES = 60;

/**
 * SpacetimeDB database configuration.
 * Central source of truth — do NOT hardcode DB_IDs elsewhere.
 * All 3 identities exist on the local SDB server; only roadmap2 is active.
 */
export const SDB_CONFIG = {
	/** Active database identity (roadmap2) */
	DB_ID: process.env.SDB_DB_ID || "c200929bd0127921065806e4e922c2836007c9a6191f6dca26531e3c67090e3e",
	/** Database name (human-readable) */
	DB_NAME: "roadmap2",
	/** SpacetimeDB server URL */
	SDB_URL: process.env.SDB_URL || "http://127.0.0.1:3000",
	/** HTTP API endpoint */
	HTTP_URI: process.env.SDB_HTTP_URI || "http://127.0.0.1:3000/v1/database/roadmap2/sql",
	/** WebSocket subscribe endpoint */
	WS_URI: process.env.SDB_WS_URI || "ws://127.0.0.1:3000/v1/database/roadmap2/subscribe",
} as const;

