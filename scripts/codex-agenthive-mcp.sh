#!/usr/bin/env bash
set -euo pipefail

if [[ -f ".env.agent" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.agent"
  set +a
  unset PG_HOST PG_PORT PG_USER PG_PASSWORD PG_DATABASE PG_SCHEMA
elif [[ -f "${HOME}/.agenthive.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${HOME}/.agenthive.env"
  set +a
fi

exec node --import jiti/register /data/code/AgentHive/src/apps/cli.ts mcp start
