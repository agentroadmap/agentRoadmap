# AgentHive Workflow State Machine — Current State (2026-04-26)

> Snapshot of what is **wired in production** vs **persisted as design but not yet running**, after the 2026-04-26 gate-profile + role-profile + e2e-section work. Read this alongside `docs/architecture/implicit-maturity-gating.md` for the prior conceptual model and `CONVENTIONS.md` §4 for the operator-facing rules.

---

## 1. Two-axis state — `status` × `maturity`

A proposal is positioned by two orthogonal columns on `roadmap_proposal.proposal`:

| Axis | Column | Values | Source of change |
|------|--------|--------|------------------|
| **Workflow phase** | `status` | `Draft → Review → Develop → Merge → Complete` (+ `Abandoned`, `Rejected`, `Replaced`) | Gate cubic agents call `prop_transition`; guarded by `fn_guard_gate_advance` (P290) |
| **Readiness within phase** | `maturity` | `new → active → mature → obsolete` | Enhancing/developing agents call `set_maturity`; gate dispatch loop reads this to decide what to claim |

`status` and `maturity` evolve **independently**. A typical happy path through one phase looks like:

```
Draft/new  →  Draft/active   →  Draft/mature   →  Review/new
   ^             ^                  ^                ^
   created       claim by           enhancer         D1 advance
                 enhancer           done; ready      (gate cubic)
```

A held proposal cycles within its phase:

```
Draft/mature  → [D1 hold] → Draft/active  → [enhancer revises] → Draft/mature → [D1 retry]
```

### Gate map (status → status)

| Gate | From | To | Cubic role | Required capabilities (DB) |
|------|------|------|------------|----------------------------|
| **D1** | Draft | Review | `skeptic-alpha` | gating, skeptic-review, review, system-design |
| **D2** | Review | Develop | `architecture-reviewer` | gating, review, system-design, design |
| **D3** | Develop | Merge | `skeptic-beta` | gating, skeptic-review, qa, code |
| **D4** | Merge | Complete | `gate-reviewer` | gating, review, devops, ops, qa, e2e-testing, regression-testing |

Gate definitions live in `roadmap.gate_task_templates` (one row per gate_number 1-4). Each row carries: `role_label`, `required_capabilities[]`, `min_proficiency`, `author_identity_template`, `responsibilities` JSONB, `mcp_action_allowlist[]`, `task_prompt`. The orchestrator's hard-coded `GATE_ROLES` constant (`scripts/orchestrator.ts:1434`) currently mirrors this row content; convergence on the DB rows is part of P463.

---

## 2. The three-action contract (every gate cubic, every gate)

Every gate dispatch must end with **one** of three actions. No exceptions.

| Verdict | Decision row | Discussion row | Enforcement call (mandatory) |
|---------|--------------|----------------|------------------------------|
| **advance** | `gate_decision_log` `decision='advance'` + rationale + `ac_verification.details` JSONB | `proposal_discussions` context_prefix=`gate-decision:` | `mcp_proposal action=transition target_state=<next>` THEN `set_maturity maturity=new` |
| **hold** | `gate_decision_log` `decision='hold'` + rationale + per-AC failure list | discussion with `## Failures` + `## Remediation` | `mcp_proposal action=set_maturity maturity=active` (NO transition) |
| **reject** | `gate_decision_log` `decision='reject'` + rationale | discussion explaining why | `mcp_proposal action=set_maturity maturity=obsolete` |

**Why "enforcement call" matters:** The orchestrator does NOT promote `status` based on a `gate_decision_log` row alone. It polls `proposal.status` after the agent exits and only marks the dispatch complete if `status == toStage`. A gate that writes `decision='advance'` but skips `prop_transition` strands the proposal at the source state with a logged advance — exactly what happened to **P472 on 2026-04-26 21:24Z** (operator advanced manually). Closing this gap is **P611**.

---

## 3. Maturity → gate dispatch wakeup

The orchestrator (`scripts/orchestrator.ts:1538` `claimImplicitGateReady`) selects gate-ready proposals as:

```sql
WHERE p.maturity = 'mature'
  AND LOWER(p.status) IN ('draft','review','develop','merge')
  AND no active dispatch already exists
ORDER BY modified_at ASC
```

This is the **only** signal that triggers a gate. Two corollaries:

1. **No `set_maturity('mature')` call → no gate ever runs.** The proposal sits at `active` invisible to the loop. P598-P608 lost hours on 2026-04-26 because the autonomous Copilot enhancement runs hit the gpt-4.1 weekly rate limit mid-flight and never called `set_maturity('mature')`. Manual SQL UPDATE enrichment also bypasses the role contract entirely.
2. **Hold flips maturity.** The orchestrator's hold path (`scripts/orchestrator.ts:1709`) sets `maturity='new'` after a hold (today). This is a half-wired loop: nothing autonomous picks up the hold and revises. The `enhancer` role (now persisted in `agent_role_profile`) is designed for this but the liaison-side dispatch is part of **P463**.

---

## 4. Agent role profiles (persisted)

Two tables hold the canonical contracts the liaison (smart layer) reads when routing work to agencies and building spawn briefings.

### 4.1 `roadmap.gate_task_templates` (gate roles, D1-D4)

One row per gate_number. Columns:

| Column | Type | Use |
|--------|------|-----|
| `gate_number` | int (1-4) | Primary key |
| `from_state`, `to_state` | text | Gate target |
| `role_label` | text | Canonical role name (skeptic-alpha, architecture-reviewer, skeptic-beta, gate-reviewer) |
| `required_capabilities` | text[] | Liaison gate: refuse claim if agency lacks any |
| `min_proficiency` | int | Capability threshold (default 4) |
| `author_identity_template` | text | `{provider}/<role>-d<level>-p{proposal_id}` — pinned naming |
| `responsibilities` | jsonb | `must_call_advance` / `must_call_hold` / `must_call_reject` / `output_contract` / `evaluation_rubric` / `consumer_protocol` |
| `mcp_action_allowlist` | text[] | Tools the spawned child may invoke |
| `task_prompt` | text | Briefing body, with `{display_id}`, `{title}`, `{status}`, `{maturity}`, `{provider}` placeholders |

**Consumer is the LIAISON, not the orchestrator.** Table COMMENT documents this. The orchestrator is a systemd-managed TS service and does not interpret role profiles — it carries `gate_number + required_capabilities + proposal_id` on the bus envelope as data; the liaison reads the row, matches caps, decides claim/decline, merges template into spawn briefing.

### 4.2 `roadmap.agent_role_profile` (non-gate roles)

| role_label | phase | required_capabilities | Final-step contract |
|------------|-------|----------------------|---------------------|
| `architect` | draft | system-design, design, docs, research | `set_maturity('mature')` after design + ACs landed |
| `researcher` | draft | research, docs, system-design | `set_maturity('mature')` after findings + ACs landed |
| `developer` | develop | code, qa, review, integration | verify_criteria for each AC + `set_maturity('mature')` |
| `enhancer` | any | research, docs, review, code | Read latest gate_decision_log; close cited gaps; `set_maturity('mature')` so gate re-runs |
| `e2e-tester` | merge | qa, e2e-testing, regression-testing, devops, code, triage | Section-aware E2E (see §6); bisect on failure |

Every role's `responsibilities.must_call_complete` documents the failure mode if the final call is skipped.

---

## 5. Runtime flow (today)

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Operator / autonomous agent / cron writes to proposal table         │
  └────────────────────────┬────────────────────────────────────────────┘
                           │
                           ▼
              maturity = 'mature' (the wakeup signal)
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Orchestrator (systemd: agenthive-orchestrator)                      │
  │  - claimImplicitGateReady() polls every ~5s (LISTEN proposal_       │
  │    maturity_changed for instant wake)                               │
  │  - For each ready proposal: postWorkOffer()                         │
  │    → INSERT roadmap_workforce.squad_dispatch                        │
  │    → pg_notify('work_offers', {dispatch_id})                        │
  │  - Also INSERT roadmap.liaison_message direction=orch->liaison      │
  │    kind=offer_dispatch (P468 wiring; outbound only today)           │
  └────────────────────────┬────────────────────────────────────────────┘
                           │
                           ▼
            agency LISTEN work_offers — race to claim
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Agency (e.g. claude/agency-bot via scripts/start-agency.ts)         │
  │  - OfferProvider.executeOffer() resolves provider, model route      │
  │  - briefing_assemble() builds the context package (P466)            │
  │  - spawnAgent() launches: claude --print --model X                  │
  │  - Today: liaisonHeartbeat() updates agency.last_heartbeat_at       │
  │    DIRECTLY — bypasses the bus (P468 stub gap)                      │
  └────────────────────────┬────────────────────────────────────────────┘
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Spawned child agent (the gate cubic)                                │
  │  - Reads briefing via mcp_agent action=briefing_load                │
  │  - Reads proposal via mcp_proposal action=detail                    │
  │  - Reads ACs via mcp_proposal action=list_criteria                  │
  │  - Adjudicates: advance | hold | reject                             │
  │  - Writes:                                                          │
  │      * proposal_discussions (gate-decision:)                        │
  │      * gate_decision_log (verdict + rationale + ac_verification)    │
  │      * mcp_proposal action=transition OR set_maturity ← MANDATORY   │
  └────────────────────────┬────────────────────────────────────────────┘
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Orchestrator post-check (handleImplicitGate, ~line 1670)            │
  │  - SELECT status, maturity FROM proposal WHERE id = X               │
  │  - If status == toStage: set_maturity('new'), mark dispatch         │
  │    complete, release lease                                          │
  │  - Else: recordGateDecisionFromOrchestrator() — writes hold to      │
  │    gate_decision_log; emits feedback discussion; sets maturity      │
  │    to 'new'                                                         │
  │  - GAP: if agent wrote decision='advance' but skipped transition,   │
  │    proposal strands. P611 fixes via trigger + reconciler.           │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 6. E2E section model (D4 / e2e-tester)

E2E suites take 10-40 min. Running them per-proposal at D4 scale is uneconomic. Two new tables encode a section-aware execution model.

### 6.1 `roadmap.e2e_section` — section catalog (10 sections seeded)

| Column | Use |
|--------|-----|
| `section_id` | PK (e.g. `auth-identity`, `liaison-protocol`, `dispatch-gate-loop`) |
| `est_duration_seconds` | Cost-aware planning |
| `trigger_paths` text[] | File globs — if a changed file matches, run this section (test impact analysis) |
| `trigger_tags` text[] | Capabilities/labels that require this section; `'ALL'` = always run |
| `depends_on_sections` text[] | Topo-sorted prerequisites |
| `parallel_group` | Sections sharing a group run concurrently in isolated sandboxes |
| `flake_rate` | Auto-quarantine when > 5% over last 100 runs |
| `test_command` | Shell invocation |

**Seeded layout** (~37 min if every section runs serial; much less in parallel):

| group-1 (parallel, ≤ 180s) | group-2 (depends on group-1) | group-3 (depends on group-2) | serial |
|---|---|---|---|
| regression-smoke 60s | briefing-spawn 180s | observability 150s | merge-pipeline 300s |
| governance-chain 90s | liaison-protocol 240s |  | multi-tenant 600s |
| mcp-routing 120s | dispatch-gate-loop 420s |  |  |
| auth-identity 180s |  |  |  |

`regression-smoke` and `governance-chain` carry `'ALL'` in `trigger_tags` — they always run.

### 6.2 `roadmap.e2e_run_log` — outcome history

One row per (section_id, batch_id) with `outcome ∈ {pass, fail, skip, flake, timeout}`, `failed_test_names`, `duration_seconds`. Drives flake detection + planning history.

### 6.3 e2e-tester contract (in `agent_role_profile`)

Encoded under `responsibilities`:

- **Test Impact Analysis** — `git diff --name-only` × `trigger_paths` ∪ proposal capabilities × `trigger_tags` → minimum required sections
- **Parallel execution** — same `parallel_group` runs concurrently in isolated DBs; siblings keep running on first failure (max signal per CI minute)
- **Section-level bisect** — on section failure with > 1 proposal in batch:
  1. Revert batch merge
  2. Re-merge proposals one-by-one
  3. After each re-merge, re-run **only the failing section** (60s targeted vs 30-min full suite)
  4. Hold culprit (`set_maturity='active'`) with section_id + failed_test_names in discussion
  5. Re-merge survivors as a smaller batch with one confirmation run
- **Flake quarantine** — `flake_rate > 0.05` → `is_active=false` + open issue; doesn't block proposals; records skip in discussion so it isn't forgotten; auto-restore after 100 consecutive dev passes
- **Time-budget escape hatch** — total > 30 min → run impacted only, defer full sweep to nightly cron

---

## 7. What's wired vs persisted-only

| Component | Persisted in DB | Wired in code (today) | Notes |
|-----------|-----------------|------------------------|-------|
| Proposal lifecycle (status × maturity) | ✓ | ✓ | Production for many months |
| `fn_guard_gate_advance` (P290) | ✓ | ✓ | Enforces D1-D4 transitions need recent decision log entry or review approve |
| Orchestrator gate dispatch loop | n/a | ✓ | Hardcoded `GATE_ROLES` mirrors `gate_task_templates` |
| `gate_task_templates` extended profile (capabilities, allowlist, responsibilities) | ✓ | ✗ | Liaison-side reader is P463 work |
| `agent_role_profile` (architect, researcher, developer, enhancer, e2e-tester) | ✓ | ✗ | Liaison-side reader is P463 work |
| `e2e_section` + `e2e_run_log` | ✓ | ✗ | e2e-tester implementation is P463 / new D4 work |
| Liaison registration (`agency_liaison_session`) | ✓ | ✓ | claude/agency-bot active today |
| Heartbeats onto bus | ✗ | ✗ | `liaisonHeartbeat()` writes directly to `agency.last_heartbeat_at`; bus-based heartbeat is P468 |
| `liaison_message` LISTEN/NOTIFY wakeup | ✗ | ✗ | `createMessageListener()` yields once and stops; `storeMessage()` doesn't `pg_notify` — both P468 stubs |
| Signed envelopes | ✗ | ✗ | `signature='stub-orchestrator'` literal everywhere; verify returns true unconditionally — **P472** |
| Auto-advance reconciler | ✗ | ✗ | **P611** filed; trigger + 30s sweep |
| Hold → revise → re-mature loop | ✗ | partial | Orchestrator writes hold; no autonomous enhancer dispatch; manual today |
| Author identity convention | ✓ (templates) | ✗ | Three patterns observed in 2026-04-26 dispatch (`claude/one-gate-d1`, `skeptic-alpha`, `claude/skeptic-alpha-p463`); pin lives in P611 ACs |

---

## 8. Source-of-truth rule

**Postgres is canonical.** Specifically:

- `proposal.design` + `proposal_acceptance_criteria` = the proposal's substance. Markdown files in the repo may **supplement** (e.g. `docs/multi-project-redesign.md` was the lift source for P598-P608) but the DB wins on divergence.
- `gate_decision_log.rationale` + `ac_verification.details` JSONB = the gate's verdict and what to fix. The next agent reads these, **not** any markdown.
- `proposal_discussions` (with `context_prefix` namespacing) = the conversational layer.
- The orchestrator's MCP message channels are best-effort; they may not reach the next cubic. `gate_decision_log` is the canonical handoff.

---

## 9. Author identity convention (target, not yet enforced)

`{provider}/<role_label>-d<gate_number>-p<proposal_id>` for gate cubics
`{provider}/<role_label>-p<proposal_id>` for non-gate roles

Examples:
- `claude/skeptic-alpha-d1-p472`
- `claude/architecture-reviewer-d2-p463`
- `claude/architect-p611`

Pinned in `gate_task_templates.author_identity_template` and `agent_role_profile.author_identity_template`. Enforcement lives in P463 (liaison-built briefings) + P611 (CONVENTIONS.md update).

---

## 10. Implementation map — files to read

| Concern | File / table |
|---------|--------------|
| Lifecycle columns | `roadmap_proposal.proposal` (status, maturity, modified_at) |
| Maturity audit | `roadmap.proposal_maturity_transitions` (view) |
| Gate decisions (canonical handoff) | `roadmap_proposal.gate_decision_log` |
| Gate role profiles | `roadmap.gate_task_templates` |
| Non-gate role profiles | `roadmap.agent_role_profile` |
| E2E section catalog | `roadmap.e2e_section` |
| E2E run history | `roadmap.e2e_run_log` |
| Capabilities per agent | `roadmap_workforce.agent_capability` |
| Agency registration | `roadmap.agency`, `roadmap.agency_liaison_session` |
| A2A bus (one-way today) | `roadmap.liaison_message` |
| Orchestrator entry | `scripts/orchestrator.ts` (`claimImplicitGateReady` ~1538, `handleImplicitGate` ~1670, `GATE_ROLES` ~1434) |
| Agency entry | `scripts/start-agency.ts` |
| Spawn | `src/core/orchestration/agent-spawner.ts` |
| Briefing protocol (P466) | `src/infra/agency/spawn-briefing-service.ts` |
| Liaison heartbeat | `src/infra/agency/liaison-service.ts:154` (`liaisonHeartbeat`) |
| Liaison message bus (stubs) | `src/infra/agency/liaison-message-service.ts:21` (storeMessage), `:249` (signature stub), `:279` (yield-once listener) |
| Gate evaluator scaffolding | `src/core/gate/evaluator.ts`, `src/apps/cubic-agents/gate-evaluator.ts` |
| Auth/identity guard | `roadmap_proposal.fn_guard_gate_advance` (P290) |
| Conventions (operator-facing) | `CONVENTIONS.md` (§4 Operational Workflow, §10a spawned-cubic settings) |

---

## 11. Known structural gaps (open proposals)

| Proposal | Gap | State |
|----------|-----|-------|
| **P463** | Liaison-side reactor + capacity-aware claim + reads role profiles + builds briefings | DEVELOP/mature |
| **P468** | Two-way liaison_message bus: pg_notify on writes, real LISTEN, ack flow, heartbeat-onto-bus | DEVELOP/mature (reopened from mislabeled COMPLETE) |
| **P472** | Unified auth + identity (Ed25519 signatures, public key on agency, replay protection, legacy migration) | DEVELOP/mature |
| **P611** | Auto-advance reconciler: trigger on `gate_decision_log.decision='advance'` + 30s sweep + author_identity convention + verdict vocabulary | DRAFT/mature |

These four close the loop on the 2026-04-26 incidents (liaison silence, P472 strand, three author-identity patterns). Once landed, every gate decision becomes a durable, signed, auto-acted contract; the liaison reads role profiles + capabilities + spawns qualified children; and stranded-advance failure modes self-heal within 30 s.

---

*Last updated: 2026-04-26 by claude/gary based on the day's gate-profile + role-profile + e2e-section work. Refresh when P463/P468/P472/P611 land or when the role catalog changes.*
