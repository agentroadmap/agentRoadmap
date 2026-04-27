/**
 * Discovery Helpers: Schema descriptors and builders.
 *
 * Per cli-hive-contract.md §8.1-8.2:
 * Builds CommandDescriptor and SchemaDescriptor objects that lane A's discovery.ts
 * will compose into the `hive --schema` JSON output.
 *
 * @module common/discovery-helpers
 */
/**
 * Build a SchemaDescriptor from a list of commands.
 *
 * @param domain Domain name (e.g., "proposal").
 * @param commands Array of CommandDescriptors.
 * @returns SchemaDescriptor ready for `hive --schema` output.
 */
export function buildSchemaDescriptor(domain, commands) {
    return {
        domain,
        commands,
    };
}
/**
 * Helper to create a FlagDescriptor for common flags.
 * Reduces boilerplate for domain modules.
 */
export const CommonFlags = {
    format: () => ({
        name: "format",
        short: "o",
        type: "enum",
        enum: ["text", "json", "jsonl", "yaml", "sarif"],
        default: "text",
        description: "Output format: text (human), json (single record), jsonl (streaming), yaml, sarif (scan/lint only)",
        example: "--format json",
    }),
    quiet: () => ({
        name: "quiet",
        short: "q",
        type: "boolean",
        default: false,
        description: "Suppress progress output to stderr",
    }),
    yes: () => ({
        name: "yes",
        type: "boolean",
        default: false,
        description: "Skip confirmation prompts for destructive operations",
    }),
    reallyYes: () => ({
        name: "really-yes",
        type: "boolean",
        default: false,
        description: "Skip confirmation for panic operations (stop all, freeze global)",
    }),
    explain: () => ({
        name: "explain",
        type: "boolean",
        default: false,
        description: "Show resolved context and timing information",
    }),
    idempotencyKey: () => ({
        name: "idempotency-key",
        type: "string",
        description: "UUID for idempotent retries (same key + same agency + same project = same result)",
        example: "--idempotency-key 550e8400-e29b-41d4-a716-446655440000",
    }),
    limit: () => ({
        name: "limit",
        type: "number",
        default: 20,
        description: "Pagination limit (max results per response)",
        example: "--limit 50",
    }),
    cursor: () => ({
        name: "cursor",
        type: "string",
        description: "Pagination cursor (opaque token from previous response)",
    }),
    filter: () => ({
        name: "filter",
        type: "string[]",
        repeatable: true,
        description: "Server-side filter (repeatable; AND'd together). Supports =, !=, >, <, in, ~ (regex)",
        example: "--filter status=DRAFT --filter type=feature",
    }),
    fields: () => ({
        name: "fields",
        type: "string",
        description: "Comma-separated field names to include (reduces output size)",
        example: "--fields proposal_id,title,status",
    }),
    include: () => ({
        name: "include",
        type: "string[]",
        repeatable: true,
        description: "Expand related entities in one round-trip (e.g., leases, ac, dependencies)",
        example: "--include leases --include ac",
    }),
    schema: () => ({
        name: "schema",
        type: "boolean",
        default: false,
        description: "Show schema for this command and exit",
    }),
    project: () => ({
        name: "project",
        short: "p",
        type: "string",
        description: "Project slug (overrides HIVE_PROJECT env)",
        example: "--project agenthive",
    }),
    agency: () => ({
        name: "agency",
        short: "a",
        type: "string",
        description: "Agency identity (overrides HIVE_AGENCY env)",
        example: "--agency hermes/agency-xiaomi",
    }),
    host: () => ({
        name: "host",
        short: "h",
        type: "string",
        description: "Host name (overrides HIVE_HOST env)",
        example: "--host hermes",
    }),
};
/**
 * Example: Build a schema descriptor for the "proposal" domain.
 * This is illustrative; actual domain schemas are defined in domains/*.ts.
 */
export function buildProposalDomainSchema() {
    return buildSchemaDescriptor("proposal", [
        {
            name: "get",
            summary: "Fetch a single proposal by ID",
            signature: "hive proposal get <proposal_id>",
            options: [
                {
                    name: "proposal_id",
                    type: "string",
                    required: true,
                    description: "Proposal ID (e.g., P123)",
                    example: "P123",
                },
            ],
            flags: [
                CommonFlags.include(),
                CommonFlags.format(),
                CommonFlags.quiet(),
                CommonFlags.explain(),
            ],
            mutating: false,
            mcp_required: false,
            idempotent: true,
            formats_supported: ["text", "json", "yaml"],
            example: "hive proposal get P123 --format json --include all",
            exit_codes: {
                "0": "Success",
                "2": "Proposal not found",
                "5": "MCP or DB unreachable",
            },
        },
        {
            name: "claim",
            summary: "Claim a proposal for work (acquires a lease)",
            signature: "hive proposal claim <proposal_id> [--duration <time>]",
            options: [
                {
                    name: "proposal_id",
                    type: "string",
                    required: true,
                    description: "Proposal ID to claim",
                },
            ],
            flags: [
                CommonFlags.idempotencyKey(),
                {
                    name: "duration",
                    type: "string",
                    default: "30m",
                    description: "Lease duration (e.g., 5m, 30m, 2h). Default: 30 minutes.",
                    example: "--duration 4h",
                },
                CommonFlags.format(),
                CommonFlags.quiet(),
                CommonFlags.yes(),
            ],
            mutating: true,
            mcp_required: true,
            idempotent: true,
            formats_supported: ["text", "json"],
            example: "hive proposal claim P123 --duration 4h --format json",
            exit_codes: {
                "0": "Claim successful",
                "2": "Proposal not found",
                "3": "Permission denied (agency not allowed)",
                "4": "Already claimed by another agency",
                "6": "Invalid state for claiming",
            },
        },
        {
            name: "list",
            summary: "List proposals (optionally filtered and paginated)",
            signature: "hive proposal list [--filter <expr>] [--limit <n>]",
            flags: [
                CommonFlags.filter(),
                CommonFlags.limit(),
                CommonFlags.cursor(),
                CommonFlags.fields(),
                CommonFlags.include(),
                CommonFlags.format(),
                CommonFlags.quiet(),
            ],
            mutating: false,
            mcp_required: false,
            idempotent: true,
            formats_supported: ["text", "json", "jsonl"],
            example: 'hive proposal list --filter status=DRAFT --filter type=feature --format jsonl',
        },
        {
            name: "show",
            summary: "Show full proposal state with all relations (alias for get --include all)",
            signature: "hive proposal show <proposal_id>",
            options: [
                {
                    name: "proposal_id",
                    type: "string",
                    required: true,
                    description: "Proposal ID",
                },
            ],
            flags: [
                CommonFlags.format(),
                CommonFlags.quiet(),
                CommonFlags.explain(),
            ],
            mutating: false,
            mcp_required: false,
            idempotent: true,
            formats_supported: ["text", "json", "yaml"],
            example: "hive proposal show P123 --format json # Includes leases, AC, deps, discussions, events",
        },
        {
            name: "transition",
            summary: "Transition proposal to a new state",
            signature: "hive proposal transition <proposal_id> <new_state>",
            options: [
                {
                    name: "proposal_id",
                    type: "string",
                    required: true,
                    description: "Proposal ID",
                },
                {
                    name: "new_state",
                    type: "enum",
                    enum: ["DRAFT", "REVIEW", "DEVELOP", "MERGE", "COMPLETE"],
                    required: true,
                    description: "Target state (loaded from control-plane)",
                },
            ],
            flags: [
                {
                    name: "reason",
                    type: "string",
                    description: "Reason for transition (logged)",
                },
                CommonFlags.idempotencyKey(),
                CommonFlags.format(),
                CommonFlags.quiet(),
                CommonFlags.yes(),
            ],
            mutating: true,
            mcp_required: true,
            idempotent: true,
            formats_supported: ["text", "json"],
            example: 'hive proposal transition P123 MERGE --reason "All AC verified"',
        },
        {
            name: "ac",
            summary: "Acceptance criteria: add, list, verify",
            signature: "hive proposal ac <subcommand> <proposal_id> [--description <text>]",
            options: [
                {
                    name: "subcommand",
                    type: "enum",
                    enum: ["add", "list", "verify"],
                    required: true,
                    description: "Subcommand: add (create), list (read), verify (check)",
                },
                {
                    name: "proposal_id",
                    type: "string",
                    required: true,
                    description: "Proposal ID",
                },
            ],
            flags: [
                {
                    name: "description",
                    type: "string",
                    repeatable: true,
                    description: "AC description (repeatable, used with add)",
                },
                CommonFlags.format(),
            ],
            mutating: true,
            mcp_required: true,
            idempotent: false,
            formats_supported: ["text", "json"],
            example: 'hive proposal ac add P123 --description "Tests pass" --description "Docs updated"',
        },
    ]);
}
/**
 * Build a schema descriptor for common/global commands (not domain-specific).
 */
export function buildUtilityCommandSchema() {
    return buildSchemaDescriptor("util", [
        {
            name: "context",
            summary: "Print resolved runtime context (project, agency, host, MCP, DB)",
            signature: "hive context",
            flags: [CommonFlags.format()],
            mutating: false,
            mcp_required: false,
            idempotent: true,
            formats_supported: ["text", "json"],
            example: "hive context --format json",
        },
        {
            name: "doctor",
            summary: "System health check (MCP, DB, schema, services, proposals, dispatches)",
            signature: "hive doctor [--remediate <check_id>]",
            flags: [
                {
                    name: "remediate",
                    type: "string",
                    description: "Get suggested fixes for a specific check (does not auto-execute)",
                    example: "--remediate ORPHAN_LEASE",
                },
                CommonFlags.format(),
            ],
            mutating: false,
            mcp_required: false,
            idempotent: true,
            formats_supported: ["text", "json"],
            example: "hive doctor --format json",
        },
        {
            name: "help",
            summary: "Show help for a command or topic",
            signature: "hive help [<command|topic>]",
            flags: [],
            mutating: false,
            mcp_required: false,
            idempotent: true,
            formats_supported: ["text"],
        },
        {
            name: "version",
            summary: "Show CLI and schema version",
            signature: "hive version",
            flags: [],
            mutating: false,
            mcp_required: false,
            idempotent: true,
            formats_supported: ["text", "json"],
        },
        {
            name: "completion",
            summary: "Shell completion (bash, zsh, fish)",
            signature: "hive completion <shell>",
            flags: [],
            mutating: false,
            mcp_required: false,
            idempotent: true,
            formats_supported: ["text"],
        },
    ]);
}
