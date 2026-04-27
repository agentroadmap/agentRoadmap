/**
 * Explain: AI-ergonomics surface for walking agents through context and decisions.
 *
 * Per cli-hive-ai-ergonomics.md §3: formatExplain formats human-readable explanations
 * of why a command was executed, what data was gathered, and what decisions were made.
 *
 * Designed for log aggregation and multi-turn agent reasoning.
 *
 * @module common/explain
 */
/**
 * Formats a human-readable explanation for an AI agent.
 *
 * @param command - The CLI command that was executed (e.g., "hive proposal get P123")
 * @param intent - Why the agent ran this command (e.g., "Check if proposal is stuck in ACTIVE maturity")
 * @param decisions - Array of decision statements made based on the output
 *   Example: ["Found proposal P123 in ACTIVE state for 8 days", "Maturity exceeds 7-day threshold"]
 * @param data - Optional: structured data to include in the explanation (context for reasoning)
 * @returns Formatted explanation string suitable for agent logs or multi-turn reasoning
 *
 * Example output:
 *   Command: hive proposal get P123
 *   Intent: Check if proposal is stuck in ACTIVE maturity
 *   Data gathered:
 *     - proposal_id: P123
 *     - state: ACTIVE
 *     - maturity_days: 8
 *   Decisions made:
 *     1. Found proposal P123 in ACTIVE state for 8 days
 *     2. Maturity exceeds 7-day threshold
 *     3. Suggested next: run `hive doctor` to find remediation steps
 */
export declare function formatExplain(command: string, intent: string, decisions: string[], data?: unknown): string;
/**
 * Explains a proposed remediation step (for doctor output).
 *
 * @param checkName - Name of the health check that triggered this remediation
 * @param status - Current status (e.g., "failing", "warning")
 * @param suggestedCommand - The exact CLI command to run
 * @param rationale - Why this command is suggested
 * @returns Formatted explanation for the operator
 */
export declare function formatRemediation(checkName: string, status: string, suggestedCommand: string, rationale: string): string;
/**
 * Explains a recipe step execution (for recipe logs).
 *
 * @param recipeId - ID of the recipe being executed
 * @param stepIndex - Zero-based step number
 * @param stepCommand - The command that will be/was executed
 * @param stepDescription - Human description of the step
 * @param output - Optional: output from the step execution
 * @param error - Optional: error message if the step failed
 * @returns Formatted explanation for recipe logs
 */
export declare function formatRecipeStep(recipeId: string, stepIndex: number, stepCommand: string, stepDescription: string, output?: string, error?: string): string;
