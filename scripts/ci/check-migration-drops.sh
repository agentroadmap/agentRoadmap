#!/usr/bin/env bash
# P677 — pre-merge migration linkage check.
#
# When a migration in scripts/migrations/*.sql contains DROP COLUMN or
# RENAME COLUMN, grep the rest of the codebase (src/ + scripts/, excluding the
# migration itself) for references to the dropped/renamed name. Fail the build
# if any reference remains.
#
# Default scope: migrations changed in the current branch vs. origin/main.
#   bash scripts/ci/check-migration-drops.sh
#
# CLI override: pass migration paths explicitly to scope to a custom set.
#   bash scripts/ci/check-migration-drops.sh scripts/migrations/067-foo.sql
#
# CI invocation: see .github/workflows/publish-hygiene.yml.
#
# Known limitation: the cross-codebase grep cannot distinguish which table a
# TypeScript reference targets. If the same column name exists on multiple
# tables and only one is dropped, valid references to the surviving table are
# flagged. Resolve via scripts/ci/sql-audit-allowlist.txt entries.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

ALLOWLIST="${REPO_ROOT}/scripts/ci/sql-audit-allowlist.txt"

# Resolve target migrations.
if [ "$#" -gt 0 ]; then
	MIGRATIONS=("$@")
else
	BASE_REF="${BASE_REF:-origin/main}"
	# `git diff --name-only A...B` lists files changed on B since branch from A.
	mapfile -t MIGRATIONS < <(
		git diff --name-only "${BASE_REF}...HEAD" -- 'scripts/migrations/*.sql' 2>/dev/null || true
	)
fi

if [ "${#MIGRATIONS[@]}" -eq 0 ]; then
	echo "check-migration-drops: no migration files in diff (base=${BASE_REF:-arg}) — skipping."
	exit 0
fi

FAIL=0
TOTAL_DROPS=0
TOTAL_RENAMES=0

is_allowlisted() {
	local file="$1" col="$2"
	[ -f "$ALLOWLIST" ] || return 1
	# Allowlist entry format: file:column (or just column for global allow).
	# Comment lines start with #; blank lines ignored.
	grep -E -v '^[[:space:]]*(#|$)' "$ALLOWLIST" \
		| awk -F: -v f="$file" -v c="$col" '
			NF==1 { if ($1 == c) { found=1; exit } }
			NF>=2 { if ($1 == f && $2 == c) { found=1; exit } }
			END { exit !found }
		'
}

scan_refs() {
	# Args: file (the migration), column-name, kind ("DROP" or "RENAME").
	local mig="$1" col="$2" kind="$3"
	# Word-boundary grep across src/ and scripts/, excluding the migration itself
	# and node_modules. Restrict to TS/TSX/JS/JSON sources to avoid hits in
	# unrelated docs or generated files.
	local refs
	refs=$(grep -rln --binary-files=without-match \
		--include='*.ts' --include='*.tsx' \
		--include='*.js'  --include='*.cjs' --include='*.mjs' \
		--include='*.json' \
		--exclude-dir=node_modules \
		--exclude-dir=dist \
		"\\b${col}\\b" \
		src scripts 2>/dev/null || true)
	# Strip the migration itself if it self-matched.
	refs=$(printf '%s\n' "$refs" | grep -v -F "$mig" || true)
	if [ -n "$refs" ]; then
		if is_allowlisted "$mig" "$col"; then
			echo "::notice file=${mig}::${kind} COLUMN ${col} — references found but allowlisted."
			return 0
		fi
		echo "::error file=${mig}::${kind} COLUMN ${col} but still referenced in:"
		printf '%s\n' "$refs" | sed 's/^/  /'
		FAIL=1
		return 1
	fi
	return 0
}

for mig in "${MIGRATIONS[@]}"; do
	[ -f "$mig" ] || continue

	# DROP COLUMN [IF EXISTS] <name>
	while IFS= read -r col; do
		[ -n "$col" ] || continue
		TOTAL_DROPS=$((TOTAL_DROPS + 1))
		scan_refs "$mig" "$col" "DROP" || true
	done < <(
		grep -oP '(?i)DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?\K[a-zA-Z_][a-zA-Z0-9_]*' "$mig" \
			|| true
	)

	# RENAME COLUMN <old> TO <new>  — flag the OLD name.
	while IFS= read -r old_col; do
		[ -n "$old_col" ] || continue
		TOTAL_RENAMES=$((TOTAL_RENAMES + 1))
		scan_refs "$mig" "$old_col" "RENAME" || true
	done < <(
		grep -oP '(?i)RENAME\s+COLUMN\s+\K[a-zA-Z_][a-zA-Z0-9_]*(?=\s+TO)' "$mig" \
			|| true
	)
done

echo "check-migration-drops: scanned ${#MIGRATIONS[@]} migration(s), ${TOTAL_DROPS} DROP, ${TOTAL_RENAMES} RENAME."
exit "$FAIL"
