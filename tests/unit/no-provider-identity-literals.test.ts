import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * P743: provider/agency identity strings must originate from DB tables,
 * not source-code literals. CLI binary names used as argv[0] or in
 * build-time type unions are exempt because the binary name is a
 * deployment fact, not a provider concept.
 *
 * This test guards a curated list of files that must NOT contain a
 * provider-identity "hermes" literal. Files in the WHITELIST may contain
 * the literal because they encode CLI binary names (cli-builders.ts,
 * agent-spawner.ts) or are the source-of-truth for the rule itself
 * (CONVENTIONS.md).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const FORBIDDEN_FILES = [
	"scripts/start-agency.ts",
	"scripts/cleanup-cubics.ts",
	"src/apps/hive-cli/domains/stop/stop-schema.ts",
	"src/infra/trust/trust-resolver.ts",
];

describe("P743: forbidden provider-identity literals in audited files", () => {
	for (const relpath of FORBIDDEN_FILES) {
		it(`${relpath} contains no provider-identity 'hermes' literal`, () => {
			const full = path.join(REPO_ROOT, relpath);
			const src = readFileSync(full, "utf8");
			// Match either single-quoted or double-quoted "hermes" as a standalone
			// string literal (not part of a longer identifier or comment-illustrating
			// example wrapped in <angle-brackets>).
			const matches = src.match(/(?<!\w)["']hermes["'](?!\w)/g) ?? [];
			assert.equal(
				matches.length,
				0,
				`${relpath}: found ${matches.length} provider-identity 'hermes' literal(s) — provider identity must be DB-sourced (CONVENTIONS.md §6.0a). Whitelist intentional CLI binary names in this test if applicable.`,
			);
		});
	}
});

describe("P743: agent-spawner.ts retains NoProviderConfigured throw, not silent default", () => {
	it("detectProvider() ends with a throw, not a hardcoded fallback", () => {
		const full = path.join(
			REPO_ROOT,
			"src/core/orchestration/agent-spawner.ts",
		);
		const src = readFileSync(full, "utf8");
		// Locate the detectProvider function body (rough but stable).
		const fnStart = src.indexOf("export async function detectProvider(");
		assert.ok(fnStart > 0, "detectProvider() not found");
		const fnEnd = src.indexOf("\n}", fnStart);
		const rawBody = src.slice(fnStart, fnEnd);
		// Strip JS line and block comments before regex match — comments may
		// legitimately mention `?? "hermes"` (e.g. in a "removed the X fallback"
		// note) without representing executable code.
		const codeOnly = rawBody
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/[^\n]*/g, "");
		assert.ok(
			!/\?\?\s*["']hermes["']/.test(codeOnly),
			"detectProvider() still has a `?? \"hermes\"` fallback — must throw NoProviderConfigured",
		);
		assert.ok(
			codeOnly.includes("NoProviderConfigured"),
			"detectProvider() must throw NoProviderConfigured when all sources exhausted",
		);
	});
});
