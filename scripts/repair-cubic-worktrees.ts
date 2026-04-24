import process from "node:process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { query } from "../src/infra/postgres/pool.ts";

type CubicRow = {
	cubic_id: string;
	agent_identity: string | null;
	worktree_path: string | null;
};

type Repair = {
	cubicId: string;
	agentIdentity: string | null;
	currentPath: string | null;
	targetPath: string | null;
	reason: string;
};

const CANONICAL_ROOT =
	process.env.AGENTHIVE_WORKTREE_ROOT ?? "/data/code/worktree";
const LEGACY_PREFIX = "/data/code/worktree-";

function hasFlag(name: string): boolean {
	return process.argv.includes(name);
}

function parseMappings(): Map<string, string> {
	const mappings = new Map<string, string>();
	for (const arg of process.argv) {
		if (!arg.startsWith("--map=")) continue;
		const value = arg.slice("--map=".length);
		const splitAt = value.indexOf("=");
		if (splitAt <= 0 || splitAt === value.length - 1) {
			throw new Error(`Invalid --map value "${value}". Use --map=old=new.`);
		}
		mappings.set(value.slice(0, splitAt), value.slice(splitAt + 1));
	}
	return mappings;
}

function sanitizeName(value: string): string {
	return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
}

function inferTarget(row: CubicRow, mappings: Map<string, string>): Repair {
	const current = row.worktree_path;
	const agent = row.agent_identity ? sanitizeName(row.agent_identity) : null;

	if (!current) {
		return {
			cubicId: row.cubic_id,
			agentIdentity: row.agent_identity,
			currentPath: current,
			targetPath: agent ? `${CANONICAL_ROOT}/${agent}` : null,
			reason: agent
				? "missing worktree_path"
				: "missing path and agent_identity",
		};
	}

	if (current.startsWith(`${CANONICAL_ROOT}/`)) {
		return {
			cubicId: row.cubic_id,
			agentIdentity: row.agent_identity,
			currentPath: current,
			targetPath: current,
			reason: "already canonical",
		};
	}

	if (current.startsWith(LEGACY_PREFIX)) {
		const legacyName = sanitizeName(current.slice(LEGACY_PREFIX.length));
		const targetName =
			mappings.get(legacyName) ??
			(agent ? mappings.get(agent) : null) ??
			agent ??
			legacyName;
		return {
			cubicId: row.cubic_id,
			agentIdentity: row.agent_identity,
			currentPath: current,
			targetPath: `${CANONICAL_ROOT}/${targetName}`,
			reason: "legacy /data/code/worktree-* path",
		};
	}

	const finalSegment = sanitizeName(basename(current));
	const targetName =
		mappings.get(finalSegment) ??
		(agent ? mappings.get(agent) : null) ??
		agent ??
		finalSegment;
	return {
		cubicId: row.cubic_id,
		agentIdentity: row.agent_identity,
		currentPath: current,
		targetPath: targetName ? `${CANONICAL_ROOT}/${targetName}` : null,
		reason: "non-canonical worktree path",
	};
}

async function main() {
	const apply = hasFlag("--apply");
	const includeInactive = hasFlag("--include-inactive");
	const requireExisting = !hasFlag("--allow-missing-targets");
	const mappings = parseMappings();

	const statusClause = includeInactive
		? "status NOT IN ('expired', 'complete')"
		: "status = 'active'";
	const { rows } = await query<CubicRow>(
		`SELECT cubic_id, agent_identity, worktree_path
		 FROM roadmap.cubics
		 WHERE ${statusClause}
		   AND (worktree_path IS NULL OR worktree_path NOT LIKE $1)
		 ORDER BY worktree_path NULLS FIRST, cubic_id`,
		[`${CANONICAL_ROOT}/%`],
	);

	const repairs = rows.map((row) => inferTarget(row, mappings));
	if (repairs.length === 0) {
		console.log("No cubic worktree path repairs needed.");
		return;
	}

	let applied = 0;
	let skipped = 0;
	for (const repair of repairs) {
		const target = repair.targetPath;
		if (!target) {
			skipped++;
			console.log(`SKIP ${repair.cubicId}: ${repair.reason}`);
			continue;
		}
		if (requireExisting && !existsSync(target)) {
			skipped++;
			console.log(
				`SKIP ${repair.cubicId}: target missing ${target} (${repair.currentPath ?? "null"})`,
			);
			continue;
		}

		if (apply) {
			await query(
				`UPDATE roadmap.cubics
				 SET worktree_path = $2,
				     metadata = COALESCE(metadata, '{}'::jsonb)
				                || jsonb_build_object(
				                     'worktree_path_repaired_at', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
				                     'worktree_path_previous', $3,
				                     'worktree_path_repair_reason', $4
				                   )
				 WHERE cubic_id = $1`,
				[repair.cubicId, target, repair.currentPath, repair.reason],
			);
			applied++;
			console.log(
				`FIX ${repair.cubicId}: ${repair.currentPath ?? "null"} -> ${target}`,
			);
		} else {
			console.log(
				`DRY ${repair.cubicId}: ${repair.currentPath ?? "null"} -> ${target}`,
			);
		}
	}

	if (!apply) {
		console.log(
			"\nDry run only. Re-run with --apply to update roadmap.cubics.",
		);
	}
	console.log(`Repairs: ${apply ? applied : 0} applied, ${skipped} skipped.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
