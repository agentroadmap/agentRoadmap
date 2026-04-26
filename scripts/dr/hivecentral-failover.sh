#!/usr/bin/env bash
# scripts/dr/hivecentral-failover.sh
#
# P591 — Control-plane disaster recovery: standby promotion + service reconnect.
#
# This script is OPERATOR-DRIVEN, not automatic. The operator runs it after
# verifying primary is genuinely dead (see docs/dr/hivecentral-dr-design.md §3).
#
# It is idempotent: re-running mid-failure is safe; each step checks state.
#
# Required env:
#   AGENTHIVE_PRIMARY_HOST     — current primary hostname (e.g. hostA1)
#   AGENTHIVE_STANDBY_HOST     — standby to promote (e.g. hostA2)
#   AGENTHIVE_PGBOUNCER_CONFIG — path to pgbouncer.ini (default: /etc/pgbouncer/pgbouncer.ini)
#   AGENTHIVE_DR_ARTIFACTS_DIR — where lease-reconcile.sql + verify.sql live
#                               (default: /usr/local/share/agenthive/dr)
#
# Exit codes:
#   0 — success
#   1 — pre-flight failed; safe to re-run after fixing
#   2 — failover partially completed; manual recovery needed (see logs)

set -euo pipefail

PRIMARY="${AGENTHIVE_PRIMARY_HOST:?AGENTHIVE_PRIMARY_HOST required}"
STANDBY="${AGENTHIVE_STANDBY_HOST:?AGENTHIVE_STANDBY_HOST required}"
PGBOUNCER_CONF="${AGENTHIVE_PGBOUNCER_CONFIG:-/etc/pgbouncer/pgbouncer.ini}"
DR_DIR="${AGENTHIVE_DR_ARTIFACTS_DIR:-/usr/local/share/agenthive/dr}"

FAILOVER_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG="/var/log/agenthive/dr-failover-${FAILOVER_TIME//[:]/-}.log"
mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
fail() { log "FATAL: $*"; exit "${2:-2}"; }

log "=== hiveCentral failover starting at ${FAILOVER_TIME} ==="
log "  Primary (assumed dead): ${PRIMARY}"
log "  Standby to promote:     ${STANDBY}"

# ----------------------------------------------------------------
# Pre-flight: standby is reachable and caught up
# ----------------------------------------------------------------
log "Step 0: Pre-flight checks"

if ! ssh -o ConnectTimeout=5 "${STANDBY}" "true"; then
  fail "Cannot SSH to standby ${STANDBY}. Aborting." 1
fi

# I9: hard-fail on SSH errors instead of swallowing with a sentinel string.
# Previously `|| echo "ERROR"` masked transient SSH failures and caused
# downstream string comparisons to silently misbehave.
STANDBY_IN_RECOVERY=$(ssh "${STANDBY}" "sudo -u postgres psql -tAc 'SELECT pg_is_in_recovery();'") \
  || fail "SSH/psql to standby ${STANDBY} failed during pg_is_in_recovery() check." 1
if [[ "$STANDBY_IN_RECOVERY" != "t" ]]; then
  fail "Standby is not in recovery mode (already promoted? primary?). Got: $STANDBY_IN_RECOVERY" 1
fi

LAG_LSN=$(ssh "${STANDBY}" "sudo -u postgres psql -tAc \"SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn());\"") \
  || fail "SSH/psql to standby ${STANDBY} failed during replay-lag check." 1
log "  Standby replay lag (bytes behind receive): ${LAG_LSN}"
# We don't fail on lag — the operator already accepted RPO ≤ 60s.

# ----------------------------------------------------------------
# Step 1: Pause dispatch on every running orchestrator + agency
# ----------------------------------------------------------------
log "Step 1: Pause services"
for unit in agenthive-orchestrator agenthive-copilot-agency agenthive-claude-agency; do
  if systemctl is-active --quiet "$unit"; then
    log "  Stopping $unit"
    systemctl stop "$unit" || log "  (warning: stop $unit failed; continuing)"
  fi
done
# a2a stays up so messages can buffer; agencies can't claim anything new without orchestrator anyway.

# ----------------------------------------------------------------
# Step 2: Promote standby
# ----------------------------------------------------------------
log "Step 2: Promote standby ${STANDBY}"
# I8: -w makes pg_ctl wait for the promotion to actually complete (default
# timeout 60s) instead of returning while the postmaster is still mid-promote.
# Without -w the shell-side wait loop can race against an in-flight promote.
ssh "${STANDBY}" "sudo -u postgres pg_ctl promote -w -t 60 -D /var/lib/postgresql/16/main" \
  || fail "pg_ctl promote failed on ${STANDBY}"

# Belt-and-braces: even with -w, re-poll pg_is_in_recovery() in case the
# remote pg_ctl returns success before pg_is_in_recovery() flips to f.
for i in {1..30}; do
  STANDBY_IN_RECOVERY=$(ssh "${STANDBY}" "sudo -u postgres psql -tAc 'SELECT pg_is_in_recovery();'" 2>/dev/null) \
    || { sleep 1; continue; }
  [[ "$STANDBY_IN_RECOVERY" == "f" ]] && break
  sleep 1
done

if [[ "${STANDBY_IN_RECOVERY:-}" != "f" ]]; then
  fail "Standby did not exit recovery within 30s; manual investigation required."
fi
log "  Standby promoted; new primary is ${STANDBY}"

# ----------------------------------------------------------------
# Step 3 (C5: was Step 4): Lease reconciliation FIRST — must complete before
# clients can reach the new primary. If we flip PgBouncer first, in-flight
# clients connect to the new primary and observe stale 'active' leases for
# orphan agents until reconciliation runs ~30s later. Reverse the order so
# the reconcile-then-flip window is closed.
# ----------------------------------------------------------------
log "Step 3: Run lease reconciliation against the newly promoted primary"
# C1: lease-reconcile.sql now iterates tenant DBs internally (per project.project_db).
# It connects directly to the standby host (not via PgBouncer) since PgBouncer
# is still pointed at the dead primary at this stage.
psql -U admin -h "${STANDBY}" -p 5432 -d hiveCentral \
  -v failover_time="${FAILOVER_TIME}" \
  -f "${DR_DIR}/lease-reconcile.sql" \
  >> "$LOG" 2>&1 \
  || fail "Lease reconciliation failed; see ${LOG}"
log "  Lease reconciliation complete"

# ----------------------------------------------------------------
# Step 4 (C5: was Step 3): Flip PgBouncer pool target — only after orphan
# leases have been released, so newly-arriving clients see a consistent state.
# ----------------------------------------------------------------
log "Step 4: Update PgBouncer config and reload"
if [[ ! -f "$PGBOUNCER_CONF" ]]; then
  fail "PgBouncer config not found at $PGBOUNCER_CONF" 1
fi

cp "$PGBOUNCER_CONF" "${PGBOUNCER_CONF}.bak.${FAILOVER_TIME//[:]/-}"
# I7: idempotent edit — if the config already points at STANDBY (e.g. operator
# manually edited or a re-run after partial success), don't run sed and risk
# a no-op-then-revert pattern. Detect explicitly and skip.
if grep -q "host=${STANDBY}" "$PGBOUNCER_CONF" && ! grep -q "host=${PRIMARY}" "$PGBOUNCER_CONF"; then
  log "  PgBouncer config already targets ${STANDBY}; no edit needed (idempotent re-run)."
else
  sed -i "s/host=${PRIMARY}/host=${STANDBY}/g" "$PGBOUNCER_CONF"
fi
systemctl reload pgbouncer || fail "PgBouncer reload failed"
log "  PgBouncer reloaded; pool now targets ${STANDBY}"

# ----------------------------------------------------------------
# Step 5: Post-failover verification
# ----------------------------------------------------------------
log "Step 5: Post-failover verification"
psql -U admin -h 127.0.0.1 -p 6432 -d hiveCentral \
  -f "${DR_DIR}/post-failover-verify.sql" \
  >> "$LOG" 2>&1 \
  || log "  (warning: verification reported anomalies; review ${LOG})"

# ----------------------------------------------------------------
# Step 6: Resume services
# ----------------------------------------------------------------
log "Step 6: Resume services"
for unit in agenthive-orchestrator agenthive-copilot-agency; do
  log "  Starting $unit"
  systemctl start "$unit" || log "  (warning: start $unit failed; investigate)"
done
# claude-agency stays paused (P501 hold).

# Wait for agencies to reconnect
sleep 10
RECONNECTED=$(psql -U admin -h 127.0.0.1 -p 6432 -d hiveCentral -tAc \
  "SELECT COUNT(*) FROM roadmap.v_agency_status WHERE status='active' AND silence_seconds < 30;" 2>/dev/null || echo "?")
log "  Active agencies reconnected within 30s: ${RECONNECTED}"

# ----------------------------------------------------------------
# Step 7: Log the event in governance.decision_log
# ----------------------------------------------------------------
# C2: bind variables via psql -v (parameter binding) instead of shell-string
# interpolation into a SQL heredoc. The previous form was vulnerable to SQL
# injection if any of $FAILOVER_TIME / $PRIMARY / $STANDBY / $LOG contained
# a single quote (e.g. malicious env override on a shared operator host).
log "Step 7: Record DR event in governance.decision_log"
psql -U admin -h 127.0.0.1 -p 6432 -d hiveCentral \
  -v failover_time="${FAILOVER_TIME}" \
  -v old_primary="${PRIMARY}" \
  -v new_primary="${STANDBY}" \
  -v log_path="${LOG}" \
  -f "${DR_DIR}/record-dr-event.sql" \
  >> "$LOG" 2>&1 \
  || log "  (warning: failed to record DR event; investigate)"

log "=== Failover complete at $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
log "Next manual step: rebuild ${PRIMARY} as the new standby (separate runbook)."
log "Full log at: ${LOG}"
