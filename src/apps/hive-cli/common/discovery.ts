/**
 * Discovery commands per cli-hive-contract.md §8.
 *
 * Implements `hive --schema`, `hive <domain> --schema`, `hive --recipes`.
 * Each domain module registers its schema descriptor; this module assembles the output.
 */

export interface CommandParameter {
  name: string;
  type: "string" | "number" | "boolean" | "string[]" | "enum";
  enum?: string[];
  required?: boolean;
  repeatable?: boolean;
  description?: string;
  example?: string;
}

export interface CommandFlag {
  name: string;
  type: "string" | "number" | "boolean" | "string[]" | "enum";
  enum?: string[];
  repeatable?: boolean;
  required?: boolean;
  description?: string;
  example?: string;
  default?: unknown;
}

export interface CommandSchema {
  name: string;
  aliases?: string[];
  description: string;
  signature: string;
  parameters?: CommandParameter[];
  flags?: CommandFlag[];
  output?: {
    type: "object" | "array" | "string";
    /**
     * Either a JSON-schema-ish field map or a free-form description string.
     * Lane F's meta domain uses the string form for output types like
     * "Shell completion script"; lane E uses the field map for proposal
     * output. Both shapes are accepted.
     */
    schema?: Record<string, unknown> | string;
  };
  idempotency?: "idempotent" | "non-idempotent";
  formats_supported?: string[];
}

export interface SubcommandSchema extends CommandSchema {
  /**
   * Nested subcommands (e.g. `hive service status`, `hive mcp tools`).
   * Optional — most domains are flat.
   */
  subcommands?: SubcommandSchema[];
}

export interface DomainSchema {
  name: string;
  aliases?: string[];
  description: string;
  subcommands: SubcommandSchema[];
}

export interface CliSchema {
  schema_version: number;
  cli_version: string;
  mcp_protocol_version: string;
  commands: DomainSchema[];
}

// P455 R3 integration: the canonical Recipe/RecipeStep shapes live in
// `./recipes` (lane D). The local placeholder types kept this module
// compilable during R2; it now defers to the canonical types so domain
// modules that build recipes via the recipes.ts factory don't break the
// discovery registry.
import type { Recipe as CanonicalRecipe, RecipeStep as CanonicalRecipeStep } from "./recipes";
export type Recipe = CanonicalRecipe;
export type RecipeStep = CanonicalRecipeStep;

/**
 * Global schema registry.
 * Domains call registerDomain() to add their schemas.
 */
const schemaRegistry: Map<string, DomainSchema> = new Map();
const recipeRegistry: Recipe[] = [];

/**
 * Register a domain's schema.
 */
export function registerDomain(domain: DomainSchema): void {
  schemaRegistry.set(domain.name, domain);
}

/**
 * Register a recipe.
 */
export function registerRecipe(recipe: Recipe): void {
  recipeRegistry.push(recipe);
}

/**
 * Get the full CLI schema (all domains).
 */
export function getFullSchema(cliVersion: string = "0.5.0"): CliSchema {
  return {
    schema_version: 1,
    cli_version: cliVersion,
    mcp_protocol_version: "1.0",
    commands: Array.from(schemaRegistry.values()),
  };
}

/**
 * Get schema for a specific domain.
 */
export function getDomainSchema(domainName: string): DomainSchema | undefined {
  return schemaRegistry.get(domainName);
}

/**
 * Get all recipes.
 */
export function getAllRecipes(): Recipe[] {
  return recipeRegistry;
}

/**
 * Format recipes as JSONL (one per line).
 */
export function formatRecipesAsJsonl(): string {
  return recipeRegistry.map((recipe) => JSON.stringify(recipe)).join("\n");
}

/**
 * Clear the registry (for testing).
 */
export function clearRegistry(): void {
  schemaRegistry.clear();
  recipeRegistry.length = 0;
}
