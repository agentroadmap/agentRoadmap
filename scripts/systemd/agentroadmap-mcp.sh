#!/bin/bash
set -euo pipefail

source /etc/agentroadmap/env

export HOME="${HOME:-/home/gary}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$PROJECT_ROOT"

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-admin}"
export PG_PASSWORD="${PG_PASSWORD:?PG_PASSWORD must be set in /etc/agentroadmap/env}"

echo "[$(date)] Starting AgentHive MCP SSE server on port $MCP_PORT (Node $(node --version))..."
echo "[$(date)] Config: database.provider=Postgres, project_root=$PROJECT_ROOT"

exec node --import jiti/register scripts/mcp-sse-server.js
