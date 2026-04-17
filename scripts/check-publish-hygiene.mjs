#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function git(args) {
	return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function parseBaseRef(argv) {
	const index = argv.indexOf("--base");
	if (index >= 0 && argv[index + 1]) return argv[index + 1];
	return process.env.PUBLISH_BASE_REF || "origin/main";
}

const baseRef = parseBaseRef(process.argv.slice(2));
const changed = git([
	"diff",
	"--name-only",
	"--diff-filter=ACMR",
	`${baseRef}...HEAD`,
])
	.split("\n")
	.map((item) => item.trim())
	.filter(Boolean);

const violations = [];

for (const file of changed) {
	if (/^scripts\/tmp-/.test(file)) {
		violations.push(file);
		continue;
	}

	if (/^(?:_|messaging_|pg_notify_test|.*\/)?[^/]+\.cjs$/i.test(file) && !file.startsWith("scripts/")) {
		violations.push(file);
		continue;
	}

	if (/\.(?:bak(?:-.+)?|orig|rej|tmp|temp|swp|swo)$/i.test(file)) {
		violations.push(file);
	}
}

if (violations.length > 0) {
	console.error("Publish hygiene check failed.");
	console.error(`Base ref: ${baseRef}`);
	console.error("Blocked files:");
	for (const file of violations) {
		console.error(` - ${file}`);
	}
	process.exit(1);
}

console.log(`Publish hygiene passed for ${changed.length} changed file(s).`);
