#!/bin/bash
# State feed listener wrapper for systemd — with debug
exec >> "${HOME}/.hermes/cron/output/state-feed-listener.log" 2>&1

echo "=== $(date -u) ==="
echo "PGPASSWORD len=${#PGPASSWORD}"
echo "PGPASSWORD first4=${PGPASSWORD:0:4}"

# Test psql directly
psql -h 127.0.0.1 -U "${PGUSER:-$USER}" -d "${PGDATABASE:-agenthive}" -t -A -c "SELECT 'psql_ok';" 2>&1

cd /data/code/AgentHive
exec /usr/local/bin/bun run scripts/state-feed-listener.ts
