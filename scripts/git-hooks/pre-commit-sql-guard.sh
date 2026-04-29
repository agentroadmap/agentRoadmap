#!/bin/bash
# P677 — pre-commit SQL guard.
#
# Runs the migration linkage check against any staged migration SQL files.
# Skips the live-DB column audit (that runs in CI to keep commits fast).
#
# Install once per checkout:
#   git config core.hooksPath scripts/git-hooks

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

STAGED=$(git diff --cached --name-only --diff-filter=ACM 'scripts/migrations/*.sql' 2>/dev/null || true)
if [ -z "$STAGED" ]; then
	exit 0
fi

# Pass staged files explicitly so the script doesn't re-derive them from
# `git diff origin/main...HEAD`.
# shellcheck disable=SC2086
bash "$REPO_ROOT/scripts/ci/check-migration-drops.sh" $STAGED
