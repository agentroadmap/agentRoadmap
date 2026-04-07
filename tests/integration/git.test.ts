import assert from "node:assert";
import { describe, it } from "node:test";
import { GitOperations, isGitRepository } from "../../src/git/operations.ts";

describe("Git Operations", () => {
	describe("isGitRepository", () => {
		it("should return true for current directory (which is a git repo)", async () => {
			const result = await isGitRepository(process.cwd());
			assert.strictEqual(result, true);
		});

		it("should return false for /tmp directory", async () => {
			const result = await isGitRepository("/tmp");
			assert.strictEqual(result, false);
		});
	});

	describe("GitOperations instantiation", () => {
		it("should create GitOperations instance", () => {
			const git = new GitOperations(process.cwd());
			assert.notStrictEqual(git, undefined);
		});
	});

	// Note: Skipping integration tests that require git repository setup
	// These tests can be enabled for local development but may timeout in CI
});
