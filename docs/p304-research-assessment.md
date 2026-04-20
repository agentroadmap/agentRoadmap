# P304 Research Assessment — LLM-Free Mechanical Status Reporting

**Proposal:** P304 — LLM-free mechanical status reporting and delivery pipeline
**Phase:** DRAFT → design review
**Date:** 2026-04-20
**Agent:** hermes-andy (researcher)

## Executive Summary

The core pipeline (report generation → file save → Discord webhook delivery) is implemented and running hourly via user crontab. However, several quality and operational gaps prevent advancing to DEVELOP without fixes.

## Implementation Status

### What Exists (uncommitted on main)

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Status report | `scripts/status-report.sh` | 166 | Working |
| Delivery wrapper | `scripts/status-report-deliver.sh` | 38 | Working |
| Template pattern | `docs/report-templates.md` | 103 | Documented |
| Crontab | User crontab `0 * * * *` | — | Active |

### AC Assessment

| AC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-1 | status-report.sh produces correct markdown | PASS | 178 proposals reported, correct type×state grouping |
| AC-2 | Discord webhook delivery on crontab | PARTIAL | User crontab (not system crontab). Webhook delivers HTTP 204 on success. |
| AC-3 | Reports on the hour, no LLM | PARTIAL | Runs hourly but intermittent failures (exit 2) at some :00 marks |
| AC-4 | Failed delivery logs to syslog | PASS | `journalctl -t agenthive-report` shows ERROR/WARNING/OK entries |
| AC-5 | New templates follow same pattern | PARTIAL | Pattern documented, only status report implemented |

## Issues Found

### Critical (blocks DRAFT→REVIEW)

1. **Files uncommitted** — All three files are untracked on main. Must be committed before they survive branch operations or service restarts.

2. **Intermittent exit 2 failures** — Syslog shows ~30% failure rate at :00 marks:
   ```
   Apr 20 13:00:01 ERROR: status-report.sh failed (exit 2)
   Apr 20 13:24:24 ERROR: status-report.sh failed (exit 2)
   ```
   Root cause: likely PGPASSWORD authentication failure (exit code 2 = psql auth error). The script uses `export PGPASSWORD="***"` — if the actual password differs from what's in the env, some runs fail.

3. **Webhook URL hardcoded** — The Discord webhook URL is in plaintext in `status-report-deliver.sh`. This should be an env var or config file for rotation and security.

### Medium (address before DEVELOP)

4. **Discord 2000-char truncation** — Report is truncated at 1900 chars for webhook. As proposals grow (currently 178), the report will lose detail silently. No summary/expand mechanism.

5. **No retry on webhook failure** — Webhook failure is soft (file saved), but there's no retry. Next hour gets a fresh attempt, which is acceptable for status reports but not for time-critical delivery.

6. **System crontab deferred** — Design specifies `/etc/cron.d/agenthive-reports` for multi-user. Currently user crontab. Document why this is acceptable for now.

### Low (future improvement)

7. **No dispatch/lease-audit/changes reports** — Template docs list 3 planned reports (dispatch, proposal-changes, lease-audit). Only status exists.

8. **Report content grows with system** — 178 proposals → ~1000 chars. At 500+ proposals, report may exceed Discord limit before truncation kicks in.

## Design Observations

### Strengths
- Pure SQL+bash — zero LLM cost, zero token usage
- Syslog integration is proper (tagged, severity-aware)
- Error strategy is correct: report failure = hard exit, webhook failure = soft warning
- Template pattern is clean and extensible

### Risks
- Credential in script file (PGPASSWORD) — if leaked via git, DB is exposed
- No monitoring of the monitor — if crontab stops, nobody notices until manual check
- Single delivery channel (Discord webhook only) — if webhook URL changes, all delivery stops silently

## Recommendations

### Before advancing DRAFT→REVIEW

1. Commit the three files to main
2. Fix intermittent exit 2 (investigate PGPASSWORD, add retry or env file)
3. Move webhook URL to env var or `~/.hermes/config.yaml`
4. Add crontab health check (meta-monitoring: if no report in 2h, alert)

### Before advancing REVIEW→DEVELOP

5. Implement at least one more report template (dispatch-report.sh) to validate the pattern
6. Add summary mode for webhook (key metrics only, full report to file)
7. Document the webhook rotation procedure

### For future (P303 gateway integration)

8. When P303 gateway exists, replace webhook POST with gateway delivery
9. Gateway enables multi-platform (Telegram, Matrix) without changing report scripts
10. Gateway can add retry, delivery confirmation, and dead-letter queue

## Conclusion

The core concept is proven and running. The implementation is solid for a v1 but needs the three files committed and the intermittent failure resolved before the proposal can credibly advance. The template pattern is well-designed and ready for extension.
