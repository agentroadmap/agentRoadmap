# P591 — Gate Review (skeptic squad verdict)

**Proposal:** P591 (control-plane DR) — formerly P530.0.
**Reviewers:** Reality Checker, Code Reviewer, Software Architect (skeptic mode).
**Date:** 2026-04-26.
**Aggregate verdict:** **BACK-TO-DRAFT.** Schema mismatch is dispositive — the lease-reconcile script writes to tables that won't exist in the v3 layout. Plus 2 SQL bugs, 1 SQL-injection vector, 3 architectural assumptions that need explicit answers.

---

## Per-reviewer verdicts

| Reviewer            | Verdict          | Headline finding                                                                             |
|---------------------|------------------|----------------------------------------------------------------------------------------------|
| Reality Checker     | BACK-TO-DRAFT    | Scripts reference `roadmap_workforce.proposal_lease` + `roadmap_workforce.squad_dispatch` but per v3 §3, leases live in `<tenant>.proposal.proposal_lease` and dispatch in `<tenant>.dispatch.work_offer`. **The script will not work against v3 tables.** |
| Code Reviewer       | NEEDS-MINOR-FIX  | (1) SQL injection via unsanitized env vars in heredoc (failover.sh:143-162); (2) NULL `last_renewed_at` never marked orphan (lease-reconcile.sql:31); (3) Non-idempotent `sed` on PgBouncer config (failover.sh:99) |
| Software Architect  | NEEDS-MINOR-FIX  | Three critical assumptions hand-waved: (1) tenant-DB DR coupling on shared instance; (2) clock skew invalidates 60s reconciliation window; (3) vault topology + DR not specified — workload-token survival claim untested |

---

## Critical issues (block MATURE)

### C1 — Schema mismatch (Reality Checker)

The lease-reconcile and post-verify scripts target tables in the wrong schema:

- `lease-reconcile.sql:25` writes `roadmap_workforce.proposal_lease` — but per the v3 redesign §3 + P603 design, leases will live in **`<tenant>.proposal.proposal_lease`** (tenant DB) once Wave 4 lands
- `lease-reconcile.sql:55` writes `roadmap_workforce.squad_dispatch` — but v3 dispatch lives in `<tenant>.dispatch.work_offer`
- The DR design assumed today's flat `roadmap.*` layout but P591 ships *for v3*, so tables won't be there at the time of failover

**Two paths to fix:**
1. **Per-tenant reconcile loop**: failover script iterates over `project.project_db` rows, connects to each tenant DB, runs the lease-reconcile within that DB
2. **Materialized cross-tenant view**: tenants write a periodic snapshot of orphaned leases to a central observability table; failover reads from there

Path 1 is simpler and matches the bounded-context contract; recommend it.

### C2 — SQL injection vector (Code Reviewer)

`failover.sh:143-162` interpolates `${PRIMARY}`, `${STANDBY}`, `${LOG}`, `${FAILOVER_TIME}` directly into a SQL heredoc. If any of these contains a single quote (e.g., from a malicious env override), SQL injection is possible. **Use `psql -v` parameter binding** like `lease-reconcile.sql` already does.

### C3 — NULL handling in lease-reconcile (Code Reviewer)

`lease-reconcile.sql:31`: `pl.last_renewed_at < cutoff.ts` returns NULL (not TRUE) when `last_renewed_at IS NULL`. A lease with NULL renewal time is silently kept active. Fix: `(pl.last_renewed_at IS NULL OR pl.last_renewed_at < cutoff.ts)`.

### C4 — `catalog_snapshot_baseline` table doesn't exist (Reality Checker)

`post-failover-verify.sql:62-78` references `roadmap.catalog_snapshot_baseline` for Check 5 (catalog-row-count baseline), but no job creates it and no DDL defines it. Currently a stubbed `RAISE NOTICE`. AC #5 cannot pass.

### C5 — Order of operations: PgBouncer flip BEFORE lease reconcile (Reality Checker)

`failover.sh` runs PgBouncer reload (Step 3) **before** lease-reconcile (Step 4). Clients can connect to the new primary and see stale leases for ~30s. Fix: reverse the order.

---

## Important issues (should fix)

### I1 — Hash-chain check verifies linkage only, not crypto integrity

`post-failover-verify.sql:17-32` uses `LAG()` to confirm row N's `prev_hash` equals row N-1's `this_hash`. It does **not** verify that `this_hash = sha256(prev_hash || canonical_payload)`. An attacker who updates both `prev_hash` and `this_hash` consistently passes this check. Real verifier must recompute the hash.

### I2 — Clock skew breaks the 60s reconciliation window (Software Architect)

The 60s cutoff assumes agency host clocks are within ±30s of the DB host's clock. NTP commonly drifts to 90s+ on poorly-configured hosts. Mitigation: add NTP pre-flight check OR widen window to 180s.

### I3 — Tenant-DB DR coupling (Software Architect)

In v1, `hiveCentral` and tenant DBs share one PG instance. Losing the instance loses all tenants. Design says "control-plane DR is separate from tenant DR" but in v1 they're physically coupled. Document: tenant data RTO can be 30+ min from off-host backup, distinct from the 5-min control-plane RTO claim.

### I4 — Vault topology not specified (Software Architect)

Design says "workload tokens survive failover because keys are in vault." Where is vault? Same DC as primary? Same host? If vault dies with the primary, the claim collapses. Either: (a) document vault HA topology explicitly, or (b) accept that workload verification fails during the 5-min window and add cached-public-key fallback in MCP/PgBouncer auth hooks.

### I5 — Operator decision SLA undefined (Software Architect)

RTO = detection (60s) + operator decision (UNDEFINED) + script (4 min). If operator takes 5 minutes to decide (after-hours, holiday), real RTO is 10 minutes. Document explicit SLA + escalation policy + run a drill outside business hours.

### I6 — Re-resume only 2 of 3 services (Code Reviewer)

`failover.sh` stops orchestrator + copilot-agency + claude-agency, but only restarts orchestrator + copilot-agency. Claude is intentionally paused (P501 hold), but the asymmetry should be commented or hardcoded explicitly to prevent copy-paste errors.

### I7 — Non-idempotent `sed` (Code Reviewer)

`failover.sh:99` `sed -i "s/host=${PRIMARY}/host=${STANDBY}/g"` is silently a no-op on second run after the first succeeded. If operator manually reverts and re-runs, no protection. Add explicit guard: `if grep -q "host=${STANDBY}" "$PGBOUNCER_CONF"; then ... else sed; fi`.

### I8 — `pg_ctl promote` should use `-w` flag (Code Reviewer)

Currently backgrounded; the wait loop may exit at 30s while promotion is mid-flight. `-w` makes pg_ctl wait for promotion to complete.

### I9 — SSH error swallowed by `|| echo "ERROR"` (Code Reviewer)

`failover.sh:50` masks SSH failures with a string sentinel. Better: `... || fail "SSH to STANDBY failed" 1`.

---

## Architectural assumptions that must be made explicit

1. **Synchronous replication (`synchronous_commit=on`) requires healthy reachable standby always.** If standby goes dark, primary blocks. Runbook for "standby unreachable" missing.
2. **PgBouncer reload is "atomic to clients"** — actually causes a 5-10s hiccup for in-flight transactions. Document.
3. **Off-host backup credentials never expire mid-failover** — explicitly: rotate to long TTLs, document credential refresh.
4. **Operator dashboard at `https://grafana.local/d/hivecentral-dr` doesn't exist yet** — placeholder URL in the doc; mark as dependency.
5. **Hourly catalog-snapshot job doesn't exist yet** — mark as dependency.

---

## Path-to-v2 risks

- v1 failover script assumes co-located standby; v2 multi-region peering will need a different script (regional failover via async replication, not streaming).
- Clustering the orchestrator (v2) breaks the per-agent `last_renewed_at` lease semantics — needs distributed-consensus rework. Document as v2 breaking change.
- Tenant-specific backup policies (v2) require P530.10 (Tenant Lifecycle Control) to add per-tenant backup configuration that the failover/restore harness reads.

---

## Action plan

P591 is **sent back to DRAFT** with maturity reset. Required before re-submission:

1. **Fix C1** (the schema mismatch): rewrite lease-reconcile to iterate over tenant DBs OR define a central observability mirror table. Likely affects both `lease-reconcile.sql` and `post-failover-verify.sql`.
2. **Fix C2** (SQL injection): switch heredoc to `psql -v` parameter binding.
3. **Fix C3** (NULL handling): `(pl.last_renewed_at IS NULL OR pl.last_renewed_at < cutoff.ts)`.
4. **Fix C4**: add `catalog_snapshot_baseline` DDL + an hourly snapshot job, OR remove the stubbed Check 5 and document it as deferred.
5. **Fix C5**: reverse order of Step 3 (PgBouncer flip) and Step 4 (lease reconcile).
6. **Fix I1**: implement full hash recompute in the verifier (inline or separate script with documented cadence).
7. **Document I3, I4, I5**: explicit answers in the design doc — tenant-DR coupling, vault topology, operator SLA.
8. **Run one instrumented failover drill in staging** with measured RPO/RTO; log to `governance.decision_log` kind=`dr_drill`. Publish results.
9. **External operator review** of the runbook (per existing AC #11).

Issues I2, I6–I9 fix before re-submission but are not blockers individually.

---

## Why this gate review matters

The friendly enhancement squad (PM/Backend/AI/Software) **praised** P591 and surfaced minor questions. The skeptic squad (Reality Checker / Code Reviewer / Software Architect-skeptic) found:
- A schema mismatch that means **the script literally won't work** when run against the v3 layout
- A SQL injection vector that could let an attacker pivot to data destruction
- A NULL bug that silently leaves orphan leases active
- Three architectural assumptions that were hand-waved in the design doc

This is the gating value-add. Friendly review improves; skeptical review prevents shipping broken work. Going forward, every proposal should pass through both squads before MATURE.

---

## Squad transcripts

The full Reality Checker, Code Reviewer, and Software Architect skeptic outputs are preserved in this review document. They ran in parallel as read-only research agents (no file writes); the verdict above is the synthesis of their independent verdicts.
