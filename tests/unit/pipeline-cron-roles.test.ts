import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * P739 (HF-A): assert STAGE_DISPATCH_ROLES.DEVELOP.gate (and every other
 * gate list) never contains 'developer' or 'engineer'. The const lives
 * inside pipeline-cron.ts and is not exported, so we read the source and
 * extract the literal map. This keeps the test independent of any DB or
 * runtime registry — it's a static guard against future edits.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.resolve(
	__dirname,
	"../../src/core/pipeline/pipeline-cron.ts",
);

function extractStageDispatchRoles(): Record<
	string,
	{ prep: string[]; gate: string[] }
> {
	const src = readFileSync(SOURCE_PATH, "utf8");
	const start = src.indexOf("const STAGE_DISPATCH_ROLES");
	assert.ok(start >= 0, "STAGE_DISPATCH_ROLES const not found in source");
	// Capture from `{` after the type annotation to the matching closing `};`
	const blockStart = src.indexOf("{", start);
	let depth = 0;
	let end = blockStart;
	for (let i = blockStart; i < src.length; i++) {
		const ch = src[i];
		if (ch === "{") depth += 1;
		else if (ch === "}") {
			depth -= 1;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}
	// Strip JS line and block comments before parsing — the source includes
	// inline `// HF-A: was [...]` notes between prep and gate that would
	// otherwise break the regex.
	const literal = src
		.slice(blockStart, end)
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/[^\n]*/g, "");
	// Parse the stage entries with a simple regex — entries look like:
	//   STAGE: {
	//     prep: [...],
	//     gate: [...],
	//   },
	const stageRe =
		/(\w+):\s*\{\s*prep:\s*\[([^\]]*)\]\s*,\s*gate:\s*\[([^\]]*)\]\s*,?\s*\}/g;
	const out: Record<string, { prep: string[]; gate: string[] }> = {};
	let match: RegExpExecArray | null;
	while ((match = stageRe.exec(literal)) !== null) {
		const [, stage, prepLiteral, gateLiteral] = match;
		out[stage] = {
			prep: parseStringList(prepLiteral),
			gate: parseStringList(gateLiteral),
		};
	}
	return out;
}

function parseStringList(literal: string): string[] {
	return literal
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => s.replace(/^["']|["']$/g, ""));
}

describe("P739 HF-A: STAGE_DISPATCH_ROLES gate-role invariants", () => {
	const roles = extractStageDispatchRoles();

	it("parses at least DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE stages", () => {
		for (const stage of ["DRAFT", "REVIEW", "DEVELOP", "MERGE", "COMPLETE"]) {
			assert.ok(
				roles[stage],
				`stage ${stage} not found in STAGE_DISPATCH_ROLES`,
			);
		}
	});

	for (const stage of ["DRAFT", "REVIEW", "DEVELOP", "MERGE"]) {
		it(`${stage} gate contains no 'developer' or 'engineer'`, () => {
			const gateRoles = roles[stage]?.gate ?? [];
			for (const r of gateRoles) {
				assert.notEqual(
					r.toLowerCase(),
					"developer",
					`${stage}.gate must not contain 'developer' (HF-A regression)`,
				);
				assert.notEqual(
					r.toLowerCase(),
					"engineer",
					`${stage}.gate must not contain 'engineer' (HF-A regression)`,
				);
			}
		});

		it(`${stage} gate has at least one review-style role first`, () => {
			const gateRoles = roles[stage]?.gate ?? [];
			assert.ok(gateRoles.length > 0, `${stage}.gate is empty`);
			const first = gateRoles[0].toLowerCase();
			assert.ok(
				/^(skeptic|reviewer|architect|qa|maintainer|gate-)/.test(first),
				`${stage}.gate[0]='${first}' must be a review-style role (skeptic/reviewer/architect/qa/maintainer/gate-*)`,
			);
		});
	}

	it("DEVELOP.prep still allows 'developer' (prep is unchanged)", () => {
		const prep = roles["DEVELOP"]?.prep ?? [];
		assert.ok(
			prep.includes("developer"),
			"DEVELOP.prep should still contain 'developer' — only gate is restricted",
		);
	});

	it("COMPLETE has empty gate (terminal stage)", () => {
		assert.equal(roles["COMPLETE"]?.gate.length, 0);
	});
});
