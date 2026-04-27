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
 * Descriptor for a CLI flag/option.
 */
export interface FlagDescriptor {
    /** Flag name (without dashes): "format", "include", "filter". */
    name: string;
    /** Short form (single char) if available: "f", "i", etc. */
    short?: string;
    /** Type of flag value. */
    type: "string" | "number" | "boolean" | "string[]" | "enum";
    /** Enum values (only if type === "enum"). */
    enum?: string[];
    /** Whether flag is repeatable (e.g., --include leases --include ac). */
    repeatable?: boolean;
    /** Default value if not provided. */
    default?: unknown;
    /** Human-readable description. */
    description: string;
    /** Example value or usage. */
    example?: string;
    /** Whether this flag is required. */
    required?: boolean;
}
/**
 * Descriptor for a positional argument.
 */
export interface OptionDescriptor {
    name: string;
    type: "string" | "number" | "boolean" | "enum";
    enum?: string[];
    required?: boolean;
    description: string;
    example?: string;
}
/**
 * Descriptor for a single CLI command.
 */
export interface CommandDescriptor {
    /** Command name: "claim", "get", "list", etc. */
    name: string;
    /** Short description of what the command does. */
    summary: string;
    /** Full command signature: "hive proposal claim <proposal_id>" */
    signature: string;
    /** Positional arguments (if any). */
    options?: OptionDescriptor[];
    /** Flags this command supports. */
    flags: FlagDescriptor[];
    /** Whether this command modifies state (mutation). */
    mutating: boolean;
    /** Whether this command requires MCP for mutations. */
    mcp_required: boolean;
    /** Whether repeated invocation with same args is safe. */
    idempotent: boolean;
    /** Output formats supported. */
    formats_supported: string[];
    /** Example command invocation. */
    example?: string;
    /** Exit codes this command can return. */
    exit_codes?: Record<string, string>;
}
/**
 * Descriptor for a domain (e.g., "proposal", "agency").
 */
export interface SchemaDescriptor {
    /** Domain name. */
    domain: string;
    /** All commands in this domain. */
    commands: CommandDescriptor[];
}
/**
 * Build a SchemaDescriptor from a list of commands.
 *
 * @param domain Domain name (e.g., "proposal").
 * @param commands Array of CommandDescriptors.
 * @returns SchemaDescriptor ready for `hive --schema` output.
 */
export declare function buildSchemaDescriptor(domain: string, commands: CommandDescriptor[]): SchemaDescriptor;
/**
 * Helper to create a FlagDescriptor for common flags.
 * Reduces boilerplate for domain modules.
 */
export declare const CommonFlags: {
    format: () => FlagDescriptor;
    quiet: () => FlagDescriptor;
    yes: () => FlagDescriptor;
    reallyYes: () => FlagDescriptor;
    explain: () => FlagDescriptor;
    idempotencyKey: () => FlagDescriptor;
    limit: () => FlagDescriptor;
    cursor: () => FlagDescriptor;
    filter: () => FlagDescriptor;
    fields: () => FlagDescriptor;
    include: () => FlagDescriptor;
    schema: () => FlagDescriptor;
    project: () => FlagDescriptor;
    agency: () => FlagDescriptor;
    host: () => FlagDescriptor;
};
/**
 * Example: Build a schema descriptor for the "proposal" domain.
 * This is illustrative; actual domain schemas are defined in domains/*.ts.
 */
export declare function buildProposalDomainSchema(): SchemaDescriptor;
/**
 * Build a schema descriptor for common/global commands (not domain-specific).
 */
export declare function buildUtilityCommandSchema(): SchemaDescriptor;
