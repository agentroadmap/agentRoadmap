/**
 * Common module exports.
 *
 * Re-exports all common utilities (errors, envelope, context, formatters,
 * discovery, MCP, control-plane, recipes, doctor, explain) so domain modules
 * can import from a single entry point.
 *
 * Recipe / RecipeStep are intentionally re-exported from `recipes.ts`
 * (lane D, the canonical authoring shape). The discovery registry's
 * placeholder types are exported under the `RegistryRecipe` /
 * `RegistryRecipeStep` aliases.
 */

export * from "./error";
export * from "./exit-codes";
export * from "./envelope";
export * from "./context";
export * from "./formatters";
export {
  registerDomain,
  registerRecipe,
  getFullSchema,
  getDomainSchema,
  getAllRecipes,
  formatRecipesAsJsonl,
} from "./discovery";
export type {
  CliSchema,
  DomainSchema,
  CommandSchema,
  CommandFlag,
  Recipe as RegistryRecipe,
  RecipeStep as RegistryRecipeStep,
} from "./discovery";
export * from "./discovery-helpers";
export * from "./control-plane-types";
export * from "./control-plane-client";
export * from "./mcp-client";
export * from "./mcp-tools";
export * from "./recipes";
export * from "./doctor";
export * from "./explain";
