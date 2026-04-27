/**
 * Tests for recipes: validation, structure, and contract compliance.
 *
 * @module common/recipes.test
 */

import assert from "node:assert";
import { describe, it, before } from "node:test";
import {
  loadRecipes,
  getRecipeById,
  validateRecipe,
} from "./recipes.js";

describe("recipes", () => {
  let recipes;

  before(async () => {
    recipes = await loadRecipes();
  });

  describe("loadRecipes", () => {
    it("should load all recipes", async () => {
      const loaded = await loadRecipes();
      assert(loaded.length > 0, "No recipes loaded");
    });

    it("should load exactly 8 bundled recipes", async () => {
      const loaded = await loadRecipes();
      assert.strictEqual(loaded.length, 8, "Expected 8 recipes");
    });

    it("should load recipes with correct IDs", async () => {
      const loaded = await loadRecipes();
      const ids = loaded.map((r) => r.id).sort();
      assert.deepStrictEqual(ids, [
        "audit-before-commit",
        "capture-defect",
        "claim-and-develop",
        "doctor-self-test",
        "investigate-stuck-proposal",
        "multi-agent-dispatch",
        "operator-stop-runaway",
        "project-bootstrap",
      ]);
    });

    it("should return a new array each time (no shared mutable state)", async () => {
      const r1 = await loadRecipes();
      const r2 = await loadRecipes();
      assert.notStrictEqual(r1, r2, "Should return different array instances");
      assert.deepStrictEqual(r1, r2, "Content should be the same");
    });
  });

  describe("getRecipeById", () => {
    it("should return a recipe by ID", () => {
      const recipe = getRecipeById("claim-and-develop");
      assert(recipe !== undefined, "Recipe should be found");
      assert.strictEqual(recipe?.id, "claim-and-develop");
    });

    it("should return undefined for unknown recipe ID", () => {
      const recipe = getRecipeById("nonexistent-recipe");
      assert.strictEqual(recipe, undefined, "Recipe should not be found");
    });

    it("should return all 8 recipes by ID", () => {
      const ids = [
        "claim-and-develop",
        "audit-before-commit",
        "capture-defect",
        "operator-stop-runaway",
        "investigate-stuck-proposal",
        "project-bootstrap",
        "multi-agent-dispatch",
        "doctor-self-test",
      ];

      ids.forEach((id) => {
        const recipe = getRecipeById(id);
        assert(recipe !== undefined, `Recipe ${id} should be found`);
        assert.strictEqual(recipe?.id, id);
      });
    });
  });

  describe("validateRecipe", () => {
    it("should validate all bundled recipes as correct", async () => {
      const loaded = await loadRecipes();
      loaded.forEach((recipe) => {
        const error = validateRecipe(recipe);
        assert.strictEqual(
          error,
          undefined,
          `Recipe "${recipe.id}" should be valid: ${error}`
        );
      });
    });

    it("should detect invalid domain in hive command", () => {
      const badRecipe = {
        id: "test",
        title: "Test",
        when_to_use: "Test",
        steps: [
          {
            command: "hive invalid-domain get test",
            description: "Bad domain",
          },
        ],
        terminal_state: "Test",
      };

      const error = validateRecipe(badRecipe);
      assert(error !== undefined, "Should detect invalid domain");
      assert(
        error.includes("invalid-domain"),
        "Error should mention the invalid domain"
      );
    });

    it("should accept valid domains", () => {
      const validDomains = [
        "project",
        "proposal",
        "agency",
        "dispatch",
        "doctor",
      ];

      validDomains.forEach((domain) => {
        const recipe = {
          id: "test",
          title: "Test",
          when_to_use: "Test",
          steps: [
            {
              command: `hive ${domain} list`,
              description: `Valid domain: ${domain}`,
            },
          ],
          terminal_state: "Test",
        };

        const error = validateRecipe(recipe);
        assert.strictEqual(error, undefined, `Domain "${domain}" should be valid`);
      });
    });

    it("should allow external commands (git, npm, jq)", () => {
      const externalCommands = [
        "git diff HEAD",
        "npm test",
        "jq '.data'",
        "bash -c 'echo test'",
        "grep pattern file",
      ];

      externalCommands.forEach((command) => {
        const recipe = {
          id: "test",
          title: "Test",
          when_to_use: "Test",
          steps: [
            {
              command,
              description: `External: ${command}`,
            },
          ],
          terminal_state: "Test",
        };

        const error = validateRecipe(recipe);
        assert.strictEqual(
          error,
          undefined,
          `External command "${command}" should be allowed`
        );
      });
    });

    it("should allow variable substitution in commands", () => {
      const recipe = {
        id: "test",
        title: "Test",
        when_to_use: "Test",
        steps: [
          {
            command: "hive proposal get ${proposal_id}",
            description: "Variable substitution",
          },
        ],
        terminal_state: "Test",
      };

      const error = validateRecipe(recipe);
      assert.strictEqual(error, undefined, "Variable substitution should be allowed");
    });

    it("should allow pipes and logical operators", () => {
      const recipe = {
        id: "test",
        title: "Test",
        when_to_use: "Test",
        steps: [
          {
            command:
              "hive proposal list --format json | jq '.data[] | select(.state == \"DRAFT\")'",
            description: "Pipe with jq",
          },
          {
            command: "git add -A && git commit -m 'test'",
            description: "Logical AND",
          },
        ],
        terminal_state: "Test",
      };

      const error = validateRecipe(recipe);
      assert.strictEqual(error, undefined, "Pipes and operators should be allowed");
    });
  });

  describe("recipe structure", () => {
    it("should have all required fields on each recipe", () => {
      recipes.forEach((recipe) => {
        assert(recipe.id !== undefined, "id should be defined");
        assert.strictEqual(typeof recipe.id, "string");
        assert(recipe.id.length > 0, "id should not be empty");

        assert(recipe.title !== undefined, "title should be defined");
        assert.strictEqual(typeof recipe.title, "string");
        assert(recipe.title.length > 0, "title should not be empty");

        assert(recipe.when_to_use !== undefined, "when_to_use should be defined");
        assert.strictEqual(typeof recipe.when_to_use, "string");
        assert(recipe.when_to_use.length > 0, "when_to_use should not be empty");

        assert(recipe.steps !== undefined, "steps should be defined");
        assert(Array.isArray(recipe.steps), "steps should be an array");
        assert(recipe.steps.length > 0, "steps should not be empty");

        assert(recipe.terminal_state !== undefined, "terminal_state should be defined");
        assert.strictEqual(typeof recipe.terminal_state, "string");
        assert(recipe.terminal_state.length > 0, "terminal_state should not be empty");
      });
    });

    it("should have unique recipe IDs", () => {
      const ids = recipes.map((r) => r.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(
        uniqueIds.size,
        ids.length,
        "All recipe IDs should be unique"
      );
    });

    it("should have recipe IDs that are slug-style (lowercase, hyphens, no spaces)", () => {
      recipes.forEach((recipe) => {
        assert(
          /^[a-z0-9-]+$/.test(recipe.id),
          `Recipe ID "${recipe.id}" should be slug-style`
        );
      });
    });

    it("should have at least 3 steps in each recipe", () => {
      recipes.forEach((recipe) => {
        assert(
          recipe.steps.length >= 3,
          `Recipe "${recipe.id}" should have at least 3 steps`
        );
      });
    });

    it("should have each step with a command", () => {
      recipes.forEach((recipe) => {
        recipe.steps.forEach((step, idx) => {
          assert(step.command !== undefined, "command should be defined");
          assert.strictEqual(typeof step.command, "string");
          assert(step.command.length > 0, "command should not be empty");
        });
      });
    });

    it("should have valid on_error values (abort or continue)", () => {
      recipes.forEach((recipe) => {
        recipe.steps.forEach((step) => {
          if (step.on_error) {
            assert(
              ["abort", "continue"].includes(step.on_error),
              `on_error should be "abort" or "continue", got "${step.on_error}"`
            );
          }
        });
      });
    });

    it("should have reads/writes that reference valid field names", () => {
      recipes.forEach((recipe) => {
        recipe.steps.forEach((step) => {
          if (step.reads) {
            assert(Array.isArray(step.reads), "reads should be an array");
            step.reads.forEach((field) => {
              assert.strictEqual(typeof field, "string");
              assert(field.length > 0, "field should not be empty");
            });
          }

          if (step.writes) {
            assert(Array.isArray(step.writes), "writes should be an array");
            step.writes.forEach((field) => {
              assert.strictEqual(typeof field, "string");
              assert(field.length > 0, "field should not be empty");
            });
          }
        });
      });
    });
  });

  describe("recipe semantics", () => {
    it("claim-and-develop recipe should capture necessary context", () => {
      const recipe = getRecipeById("claim-and-develop");
      assert(recipe !== undefined);
      assert(recipe?.steps.length >= 5, "Should have at least 5 steps");

      const commands = recipe?.steps.map((s) => s.command) || [];
      assert(
        commands.some((c) => c.includes("context")),
        "Should have context step"
      );
      assert(
        commands.some((c) => c.includes("proposal")),
        "Should have proposal step"
      );
      assert(
        commands.some((c) => c.includes("claim")),
        "Should have claim step"
      );
      assert(
        commands.some((c) => c.includes("maturity")),
        "Should have maturity step"
      );
    });

    it("audit-before-commit recipe should check scan/lint/test before commit", () => {
      const recipe = getRecipeById("audit-before-commit");
      assert(recipe !== undefined);

      const commands = recipe?.steps.map((s) => s.command) || [];
      assert(
        commands.some((c) => c.includes("scan")),
        "Should have scan step"
      );
      assert(
        commands.some((c) => c.includes("lint")),
        "Should have lint step"
      );
      assert(
        commands.some((c) => c.includes("npm test")),
        "Should have npm test step"
      );
      assert(
        commands.some((c) => c.includes("git commit")),
        "Should have git commit step"
      );

      const lastCmd = recipe?.steps[recipe.steps.length - 1].command || "";
      assert(lastCmd.includes("commit"), "Last step should be commit");
    });

    it("doctor-self-test recipe should include doctor command", () => {
      const recipe = getRecipeById("doctor-self-test");
      assert(recipe !== undefined);

      const commands = recipe?.steps.map((s) => s.command) || [];
      assert(
        commands.some((c) => c.includes("hive doctor")),
        "Should have doctor step"
      );
    });

    it("capture-defect recipe should transition to REVIEW state", () => {
      const recipe = getRecipeById("capture-defect");
      assert(recipe !== undefined);

      const commands = recipe?.steps.map((s) => s.command) || [];
      assert(
        commands.some((c) => c.includes("transition") && c.includes("REVIEW")),
        "Should transition to REVIEW"
      );
    });

    it("project-bootstrap recipe should include db create and agency register", () => {
      const recipe = getRecipeById("project-bootstrap");
      assert(recipe !== undefined);

      const commands = recipe?.steps.map((s) => s.command) || [];
      assert(
        commands.some((c) => c.includes("project init")),
        "Should have project init step"
      );
      assert(
        commands.some((c) => c.includes("db create")),
        "Should have db create step"
      );
      assert(
        commands.some((c) => c.includes("agency register")),
        "Should have agency register step"
      );
    });
  });
});
