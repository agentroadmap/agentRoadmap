import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { traceOrigin } from "../../src/core/schema-drift/origin.ts";

describe("traceOrigin", () => {
	it("extracts P-id from git pickaxe commit subject", () => {
		const exec = (cmd: string, args: string[]): string => {
			if (cmd === "git" && args[0] === "log") {
				return [
					"abc1234567890\tfeat(P634): drop cost_per_1k_input from model_routes",
					"def0000000000\tunrelated commit no proposal id",
				].join("\n");
			}
			throw new Error(`unexpected exec: ${cmd}`);
		};

		const guess = traceOrigin("cost_per_1k_input", { repoRoot: "/tmp/repo", exec });
		assert.equal(guess.proposalDisplayId, "P634");
		assert.equal(guess.proposalNumericId, 634);
		assert.equal(guess.commitSha, "abc1234567890");
		assert.equal(guess.source, "git_pickaxe");
	});

	it("falls back to migration filename when git history yields no P-id", () => {
		const exec = (cmd: string, args: string[]): string => {
			if (cmd === "git") {
				return "deadbeef\trefactor: move things around";
			}
			if (cmd === "grep") {
				// Simulate a migration file matching the column name.
				return "scripts/migrations/034-p235-model-pricing-per-million.sql\n";
			}
			throw new Error(`unexpected exec: ${cmd}`);
		};

		const guess = traceOrigin("cost_per_1k_input", { repoRoot: "/tmp/repo", exec });
		// Pickaxe matched a commit but had no P-id, so we fell through to the
		// migration-filename grep which extracted P235.
		assert.equal(guess.source, "migration_filename");
		assert.equal(guess.proposalDisplayId, "P235");
		assert.equal(guess.proposalNumericId, 235);
	});

	it("returns 'none' when neither git nor grep finds anything", () => {
		const exec = (cmd: string): string => {
			if (cmd === "git") return "";
			if (cmd === "grep") return "";
			return "";
		};
		const guess = traceOrigin("nonexistent_column", { repoRoot: "/tmp/repo", exec });
		assert.equal(guess.source, "none");
		assert.equal(guess.proposalDisplayId, null);
		assert.equal(guess.commitSha, null);
	});

	it("survives exec throwing (e.g. git not in PATH)", () => {
		const exec = (): string => {
			throw new Error("ENOENT: git");
		};
		const guess = traceOrigin("anything", { repoRoot: "/tmp/repo", exec });
		assert.equal(guess.source, "none");
	});

	it("handles regex-special characters in the missing name", () => {
		const exec = (cmd: string, args: string[]): string => {
			// Confirm the column name is escaped before being injected into grep -E.
			if (cmd === "grep") {
				const pattern = args.find((a) => a.includes("DROP COLUMN"));
				assert.ok(pattern, "expected a grep pattern arg");
				assert.match(pattern!, /\\\./);
				return "";
			}
			return "";
		};
		traceOrigin("table.col_with_dots", { repoRoot: "/tmp/repo", exec });
	});
});
