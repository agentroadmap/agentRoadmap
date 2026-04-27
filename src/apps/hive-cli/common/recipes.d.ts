/**
 * Recipes: Curated multi-step workflows for AI agents.
 *
 * Per cli-hive-contract.md §8.3 and ai-ergonomics.md §2.2 and §5.7:
 * Recipes are static (bundled), not dynamic (loaded from control-plane).
 * Agents read `hive --recipes` once at session start to understand common workflows.
 * Each recipe is a sequence of CLI commands with data flow hints and error handling.
 *
 * @module common/recipes
 */
/**
 * A single step in a recipe workflow.
 */
export interface RecipeStep {
    /** Shell command to execute. Can reference variables like ${proposal_id}. */
    command: string;
    /** Human-readable description of what this step does. */
    description?: string;
    /** Which output fields this step reads (data dependencies). */
    reads?: string[];
    /** Which fields/variables this step writes (for subsequent steps). */
    writes?: string[];
    /** Error handling policy: "abort" stops recipe, "continue" skips to next. */
    on_error?: "abort" | "continue";
    /** Expected output or exit code for validation. */
    expects?: string;
}
/**
 * A recipe: a curated, multi-step workflow.
 */
export interface Recipe {
    /** Unique recipe ID, slug-style. */
    id: string;
    /** Human-readable title. */
    title: string;
    /** When to use this recipe (describes the scenario). */
    when_to_use: string;
    /** Ordered steps in the workflow. */
    steps: RecipeStep[];
    /** Description of what the system should look like on success. */
    terminal_state: string;
}
/**
 * Load all recipes.
 * Static bundled recipes; no network calls.
 *
 * @returns Array of Recipe objects.
 */
export declare function loadRecipes(): Promise<Recipe[]>;
/**
 * Get recipe by ID.
 */
export declare function getRecipeById(id: string): Recipe | undefined;
/**
 * Validate recipe: check that all command references point to known domains.
 * This is called at startup to catch typos.
 *
 * Known domain commands (from contract §1):
 * project, proposal, workflow, state, document, agency, worker, lease, provider,
 * model, route, budget, context-policy, dispatch, offer, queue, service, mcp, db,
 * cubic, audit, scan, lint, knowledge, doctor, board, web, tui, util (help, version, completion, init, status, context, doctor)
 *
 * @param recipe Recipe to validate.
 * @returns Error message if invalid; undefined if valid.
 */
export declare function validateRecipe(recipe: Recipe): string | undefined;
