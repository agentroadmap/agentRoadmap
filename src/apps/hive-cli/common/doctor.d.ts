/**
 * Doctor: System health checks and diagnostics.
 *
 * Per cli-hive-contract.md §8.4 and ai-ergonomics.md §2.3:
 * `hive doctor` runs 12+ checks covering MCP, DB, schema, services, and system state.
 * Each check returns status, message, and optional remediation suggestions.
 * Per P455 Round 2 decision: --remediate suggests fixes only (no auto-execution).
 *
 * @module common/doctor
 */
/**
 * Result from a single health check.
 */
export interface DoctorCheckResult {
    /** Check ID (slug-style). */
    id: string;
    /** Severity: info (FYI), warn (should fix), error (blocks work). */
    severity: "info" | "warn" | "error";
    /** Whether check passed (ok=true) or failed (ok=false). */
    ok: boolean;
    /** Human-readable status message. */
    message: string;
    /** Additional context/details (optional). */
    details?: Record<string, unknown>;
    /** Suggested fix (only when ok=false and fixable). */
    remediation?: {
        /** Type of remediation: "commands", "sql", "manual". */
        type: "commands" | "sql" | "manual";
        /** Ordered steps to resolve. */
        steps: Array<{
            description: string;
            command: string;
        }>;
    };
}
/**
 * Overall health report.
 */
export interface DoctorReport {
    /** Overall status: healthy, degraded, unhealthy. */
    overall_status: "healthy" | "degraded" | "unhealthy";
    /** Timestamp when report was generated. */
    generated_at: string;
    /** Array of check results. */
    checks: DoctorCheckResult[];
    /** Count of errors (blocks work). */
    error_count: number;
    /** Count of warnings (should fix). */
    warning_count: number;
    /** Count of info (FYI). */
    info_count: number;
}
/**
 * Run all doctor checks.
 *
 * @param opts Options: { remediate?: string } to suggest fixes for a specific check.
 * @returns Full health report.
 */
export declare function runDoctor(opts?: {
    remediate?: string;
}): Promise<DoctorReport>;
/**
 * Get remediation for a specific check by ID.
 * Per P455 Round 2 decision: suggest only (no auto-execution).
 *
 * @param checkId Check ID to get remediation for.
 * @returns Remediation steps, or undefined if check has none.
 */
export declare function getRemediation(checkId: string): Promise<Array<{
    description: string;
    command: string;
}> | undefined>;
