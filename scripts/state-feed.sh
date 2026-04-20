#!/bin/bash
# State & maturity change feed — pure SQL, no LLM required
# Checks for changes since last run and delivers to Discord webhook
set -euo pipefail

export PGPASSWORD="${PG_PASSWORD:-}"
PG="psql -h 127.0.0.1 -U xiaomi -d agenthive -t -A"

# Webhook for state/maturity feed (separate channel)
WEBHOOK_URL="${DISCORD_WEBHOOK_STATEFEED:?ERROR: DISCORD_WEBHOOK_STATEFEED not set — add to ~/.hermes/.env}"

# State file to track last check time
STATE_FILE="$HOME/.hermes/cron/output/.state-feed-last"
mkdir -p "$(dirname "$STATE_FILE")"

# Get last check time (default: 35 minutes ago if first run)
if [ -f "$STATE_FILE" ]; then
  LAST_CHECK=$(cat "$STATE_FILE")
else
  LAST_CHECK=$(date -u -d '35 minutes ago' '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date -u '+%Y-%m-%dT%H:%M:%S')
fi

NOW=$(date -u '+%Y-%m-%dT%H:%M:%S')

# --- Proposal state changes ---
STATE_CHANGES=$($PG -F'|' -c "
SELECT display_id || ': ' || status || ' (' || maturity || ') — ' || LEFT(title, 60)
FROM roadmap_proposal.proposal
WHERE modified_at > '$LAST_CHECK'::timestamptz
ORDER BY modified_at DESC
LIMIT 15;
" 2>/dev/null)

# --- Gate decisions ---
GATE_CHANGES=$($PG -F'|' -c "
SELECT g.proposal_id || ': ' || g.from_state || ' → ' || g.to_state || ' [' || g.decision || '] by ' || g.decided_by
FROM roadmap_proposal.gate_decision_log g
WHERE g.created_at > '$LAST_CHECK'::timestamptz
ORDER BY g.created_at DESC
LIMIT 10;
" 2>/dev/null)

# --- Maturity transitions ---
MATURITY_CHANGES=$($($PG -F'|' -c "
SELECT p.display_id || ': ' || p.maturity || ' — ' || LEFT(p.title, 60)
FROM roadmap_proposal.proposal p
WHERE p.modified_at > '$LAST_CHECK'::timestamptz
  AND p.maturity IN ('mature', 'new')
ORDER BY p.modified_at DESC
LIMIT 10;
" 2>/dev/null))

# Save checkpoint
echo "$NOW" > "$STATE_FILE"

# --- Build message ---
HAS_CHANGES=false
MSG="**State Feed** — $(date -u '+%H:%M UTC')"

if [ -n "$STATE_CHANGES" ]; then
  HAS_CHANGES=true
  MSG="$MSG

**📝 State Changes**
$STATE_CHANGES"
fi

if [ -n "$GATE_CHANGES" ]; then
  HAS_CHANGES=true
  MSG="$MSG

**🚪 Gate Decisions**
$GATE_CHANGES"
fi

if [ -n "$MATURITY_CHANGES" ]; then
  HAS_CHANGES=true
  MSG="$MSG

**⏫ Maturity**
$MATURITY_CHANGES"
fi

# Only send if there are changes
if [ "$HAS_CHANGES" = false ]; then
  exit 0
fi

# Send to Discord
CONTENT=$(echo "$MSG" | head -c 1900)
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg c "$CONTENT" '{content: $c}')" \
  >/dev/null 2>&1 || echo "Webhook delivery failed" >&2
