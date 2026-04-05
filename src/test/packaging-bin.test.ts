import assert from "node:assert";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("package bin wrapper", () => {
	it("points to scripts/cli.cjs to own .bin/roadmap", async () => {
		const pkgPath = join(process.cwd(), "package.json");
		const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
		assert.strictEqual(pkg?.bin?.roadmap, "scripts/cli.cjs");
	});
});
