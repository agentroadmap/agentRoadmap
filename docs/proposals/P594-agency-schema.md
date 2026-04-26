# P594 — Agency Schema (enhanced)

**Status:** Enhanced via 4-expert squad review. Maturity: mature pending gate review.
**Parent:** P590 (hiveCentral data-model overhaul).
**Schema family file (target):** `database/ddl/hivecentral/003-agency.sql`.
**Depends on:** P592 (`core` schema), P593 (`identity` schema).
**Reviewers:** Product Manager, Backend Architect, AI Engineer, Software Architect (parallel squad, 2026-04-26).

---

## 1. Synthesis (the proposal)

### 1.1 Why

`hiveCentral.agency` is the long-lived registry of work-execution contexts. Each row is a deployed CLI provider instance (claude-code/agency-bot, codex/agency-gary, …) bound to a cryptographic principal from `identity` (P593). Without this schema, the orchestrator has no place to ask "who is dispatchable right now," "what can they do," "is their key still valid." The dormancy state machine, controlled A2A message vocabulary, and migration path from today's `roadmap.agency.*` tables all live here.

### 1.2 Scope

Five tables in `hiveCentral.agency`:

- `agency_provider` — directory of CLI providers (claude-code, codex, copilot, hermes, …)
- `agency` — registered agency instances bound to identity.principal + identity.principal_key
- `agency_session` — live session lifecycle with heartbeats and dormancy state machine
- `agency_capacity` — current dispatch capacity envelope (per agency, per route)
- `liaison_message_kind_catalog` — controlled vocabulary for A2A message kinds

### 1.3 Public API (what other schemas may call)

```
fn agency.get_active(agency_id)               → {id, status, last_heartbeat, capacity_envelope}
fn agency.is_dispatchable(agency_id)          → bool
fn agency.list_by_provider(provider_id)       → agency_rows[]
fn agency.session_heartbeat(agency_id, snap)  → {session_renewed_until, dispatchable}
fn agency.list_stale_sessions(cutoff_seconds) → agency_id[]   -- dormancy sweep
fn agency.mark_dormant(agency_ids[])          → count
fn agency.mark_reconnecting(agency_id, until) → ok            -- DR grace window
```

No other schema reads agency tables directly. All access via these functions, which encapsulate session-state logic and write `identity.audit_action` rows on consequential transitions.

---

## 2. Concrete table outlines (full DDL ships in `003-agency.sql`)

```sql
-- Provider directory
CREATE TABLE agency.agency_provider (
  provider_id        TEXT PRIMARY KEY,             -- 'claude-code' | 'codex' | 'copilot' | 'hermes'
  display_name       TEXT NOT NULL,
  auth_credential_id BIGINT REFERENCES credential.credential,   -- vault pointer; never plaintext
  config             JSONB NOT NULL DEFAULT '{}',  -- provider-specific quirks (rate limits, rotation cadence, fallback)
  is_enabled         BOOLEAN NOT NULL DEFAULT true,
  -- catalog hygiene fields (uniform across central catalogs)
);

-- Agency instances — one row per deployed (provider, host, os_user) tuple
CREATE TABLE agency.agency (
  agency_id          TEXT PRIMARY KEY,             -- 'claude-code/agency-bot'
  provider_id        TEXT NOT NULL REFERENCES agency.agency_provider,
  principal_id       BIGINT NOT NULL REFERENCES identity.principal,        -- P593
  signing_key_id     BIGINT NOT NULL REFERENCES identity.principal_key,    -- P593
  host_id            BIGINT NOT NULL REFERENCES core.host,
  os_user_id         BIGINT NOT NULL REFERENCES core.os_user,
  display_name       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','dormant','reconnecting','retired')),
  status_reason      TEXT,
  capabilities       TEXT[] NOT NULL DEFAULT '{}',
  last_heartbeat_at  TIMESTAMPTZ,
  registered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata           JSONB NOT NULL DEFAULT '{}',  -- provider-specific quirks here, not new columns
  -- catalog hygiene fields
  UNIQUE (provider_id, host_id, os_user_id)         -- logical uniqueness
);

-- Live sessions (one open session per agency at a time, enforced by app + lease)
CREATE TABLE agency.agency_session (
  session_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id               TEXT NOT NULL REFERENCES agency.agency,
  liaison_host            INET,
  started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at                TIMESTAMPTZ,
  end_reason              TEXT,
  last_heartbeat_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  silence_seconds         INT GENERATED ALWAYS AS (
                            CASE WHEN ended_at IS NULL
                              THEN EXTRACT(EPOCH FROM (now() - last_heartbeat_at))::int
                              ELSE EXTRACT(EPOCH FROM (ended_at - last_heartbeat_at))::int
                            END
                          ) STORED,
  dormancy_state          TEXT NOT NULL DEFAULT 'active'
                          CHECK (dormancy_state IN ('active','dormant','reconnecting')),
  reconnect_grace_until   TIMESTAMPTZ,              -- DR: holder may rejoin within this window
  capacity_snapshot       JSONB NOT NULL DEFAULT '{}',
  in_flight_work_count    INT NOT NULL DEFAULT 0,
  consecutive_heartbeat_failures INT NOT NULL DEFAULT 0,
  last_error              TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}'
);

-- Capacity envelope — read by dispatch scheduler on every cycle
CREATE TABLE agency.agency_capacity (
  agency_id              TEXT PRIMARY KEY REFERENCES agency.agency,
  available_slots        INT NOT NULL,             -- decrement on offer, increment on completion
  max_slots              INT NOT NULL,
  current_route_id       TEXT,                     -- references model.model_route (P595)
  p99_latency_ms         INT,                      -- rolling 5min window
  backpressure_factor    NUMERIC NOT NULL DEFAULT 1.0,
  last_updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Controlled A2A vocabulary — adding a kind requires a self-evo proposal
CREATE TABLE agency.liaison_message_kind_catalog (
  kind             TEXT PRIMARY KEY,                -- 'heartbeat' | 'work_claim' | 'dispatch_result' | ...
  category         TEXT NOT NULL,                   -- 'lifecycle' | 'workflow' | 'error'
  schema_version   INT NOT NULL DEFAULT 1,
  payload_schema   JSONB NOT NULL,                  -- JSONSchema; MCP validates payloads
  is_enabled       BOOLEAN NOT NULL DEFAULT true,
  retention_days   INT NOT NULL DEFAULT 14,
  description      TEXT,
  -- catalog hygiene fields
);
```

---

## 3. Heartbeat & dormancy state machine — cluster-safe

### State transitions

```
                 (heartbeat received)                     (operator)
       active ◄─────────────────────────  active        active ────────► paused
         │                                              │                  │
         │ silence ≥ 90s                                │ (manual unpause)
         ▼                                              │
      dormant ────► (next heartbeat) ────► active   ◄──┘
         │
         │ (failover detected)
         ▼
   reconnecting ─── (heartbeat within 60s) ──► active
         │
         │ (grace expired, no heartbeat)
         ▼
      dormant
         │
         │ (operator command + retire_after elapsed)
         ▼
       retired   (lifecycle_status='deprecated' → 'retired')
```

### Cluster-safety contract (per §11.0 of the redesign)

The orchestrator is **single-process v0** but every state transition uses Postgres-level locking so the path to N orchestrator instances is a config flip:

1. **Heartbeat receipt** — single-row UPDATE; trigger fires on session insert/update to flip agency.status from dormant→active.
2. **Dormancy sweep** — competing instances partition the work via `SELECT … FOR UPDATE SKIP LOCKED`; advisory lock `pg_advisory_lock(hashtext(agency_id))` ensures any one transition (`active → dormant`) is serialized.
3. **Lease renewal** — uses lease row's `FOR UPDATE` lock; session update is subordinate within the same txn.
4. **Heartbeat times** are always DB-generated (`DEFAULT now()`), never client-supplied. Prevents skewed-clock corruption of SLO data.

### Grace policy

- **Dormancy threshold**: 90s of silence. Configurable in v1.1 via `core.runtime_flag` (`agency.dormancy_threshold_seconds`).
- **Lease release grace**: when transitioning `active → dormant`, leases are NOT released for the first 30s. This prevents false-positive orphans when an agency is restarting and will reconnect within that window. (Per PM review.)
- **DR reconnect grace**: on failover, sessions whose `last_heartbeat_at < failover_time - 60s` are eligible for orphan release; sessions inside the window get `dormancy_state='reconnecting'` with `reconnect_grace_until = failover_time + 60s`. Lease released only if the holder doesn't return within that window.
- **Restart loop guard**: `agency_session.consecutive_heartbeat_failures` counter; after 3 in a row, agency moves to `paused` (fail-open; operator must manually unpause). Prevents systemd thrash from a permanently-broken agency.

---

## 4. Cryptographic binding to `identity` (the unsigned-agency rule)

**The rule:** an agency without a registered `identity.principal_key` cannot dispatch.

Enforced at three points:

1. **Schema** — `agency.signing_key_id BIGINT NOT NULL REFERENCES identity.principal_key`.
2. **Bootstrap** — agency registration calls `identity.subordinate_key_registration(...)` which validates that the agency's public key is signed by the orchestrator key (which is itself signed by the offline installation root). Forms an attestation chain.
3. **Runtime** — every dispatch envelope is verified via `identity.verify_signature(envelope)`; if the signing key is `revoked` or `expired`, dispatch fails and an `audit_action` row is written.

**Revocation path (compromise detected):**

```sql
UPDATE identity.principal_key SET status='revoked' WHERE key_id=<key>;
NOTIFY metadata_revoked, '<agency_id>';
```

The NOTIFY triggers immediate cache flush in every connected service (per §7.5 cache layer rules). In-flight spawns under that key fail their next signature check.

---

## 5. AI-agent specifics (per AI Engineer review)

### Capacity envelope

`agency.agency_capacity` is the orchestrator's source of truth for "may I offer work to this agency right now?" Updated by:
- Heartbeat (every 30s with current load + p99 latency)
- Lease claim (decrement available_slots)
- Lease completion / timeout (increment available_slots)

Dispatch scheduler reads `available_slots > 0 AND backpressure_factor < threshold` before posting an offer. SLO target: < 100ms read.

### Provider quirks live in `metadata` JSONB, not new columns

```jsonc
agency.metadata = {
  "claude-code": {
    "session_token_ttl_min": 60,
    "rate_limit_rpm": 10,
    "rate_limit_tpm": 100000,
    "rotation_cadence": "weekly",
    "fallback_model": "claude-sonnet-4-6"
  },
  "codex": {
    "api_key_rotation_days": 30,
    "rate_limit_rpm": 100,
    "batch_size_max": 50
  }
}
```

Forces v1 schema to predict every provider's quirks would create a maintenance nightmare. JSON metadata + CI lint that validates the structure per provider keeps the schema lean.

### Persona ≠ agency

The same agency can act as `senior-backend` on one dispatch and `skeptic-alpha` on the next. Persona is a **runtime parameter** (`briefing.persona_id` in the dispatch contract), not an agency attribute. `workforce.agent` (P597) defines personas; agency just executes them.

### Subagent spawn policy enforcement

Three layers, all required:
1. **Capacity envelope** — limits resource consumption (server side)
2. **Workload token scope** — limits what the spawn *believes* it may do (token side; from P593 §3a)
3. **Audit trail** — `dispatch.work_claim` records `parent_dispatch_id, spawn_serial, approved_max_spawns` for forensic audit

Any one alone is insufficient; capacity prevents exhaustion but not malice; tokens declare limits but require the agent to honor them; audit catches violations after the fact. Together they make exceeding the policy an auditable event.

### Three autonomous-agent gotchas

1. **Capability snapshot versioning** — when an agency spawns a child, the workload token captures `capabilities_version` at mint time. If that version was revoked since mint, spawn is rejected with `capability_mismatch`. Prevents grant-rotation race conditions.
2. **Cascading latency in nested spawns** — depth-3 spawn chains add multiplicative overhead. Workload token enforces a `max_depth` (default 3) and tracks cumulative `spend_so_far_usd` against the parent budget. Spawn denied if budget would overflow.
3. **Credential leakage via exception backtraces** — vault paths in error tracebacks expose secret locations. Credential errors logged as structured `{credential_id, vault_provider_id, outcome}` — never paths or values. CI lint rule rejects `err.toString()` near credential code.

---

## 6. DR reconciliation (per §11.3 of the redesign)

On failover, the new primary must distinguish stale sessions from sessions whose holder may rejoin:

```sql
-- 1. Sessions whose last heartbeat was BEFORE failover - 60s = stale; release leases
UPDATE agency.agency_session
   SET dormancy_state = 'dormant'
 WHERE last_heartbeat_at < failover_time - interval '60 seconds'
   AND dormancy_state = 'active';

-- 2. Sessions whose last heartbeat is recent enough = give 60s reconnect grace
UPDATE agency.agency_session
   SET dormancy_state = 'reconnecting',
       reconnect_grace_until = failover_time + interval '60 seconds'
 WHERE last_heartbeat_at >= failover_time - interval '60 seconds'
   AND dormancy_state = 'active';

-- 3. After grace expires, any still-reconnecting session moves to dormant
-- (run from the dormancy sweep; stays cluster-safe)
```

The lease reconciliation pass in `scripts/dr/lease-reconcile.sql` reads from this state.

---

## 7. A2A topic coupling — convention not FK

Topics are named `agency.<agency_id>.heartbeat`, `agency.<agency_id>.assistance`, etc. Schema **does not** carry a FK from `agency` to `messaging.a2a_topic`:

- **Why no FK:** circular dependency (agency → messaging → identity → agency for envelope verify). Convention is sufficient.
- **Validation:** `messaging.validate_topic_name(name, pattern)` enforces the `agency.<id>.<kind>` shape. New patterns must match `liaison_message_kind_catalog.kind`.
- **Topic creation:** implicit on first publish; idempotent.

This keeps the schema decoupled and makes cleanup of stale agencies a non-event (no orphan topics block cleanup).

---

## 8. Migration from v1 (`roadmap.*` → `hiveCentral.agency.*`)

| v1 (`roadmap.*`)                  | v3 (`hiveCentral.agency.*`)         | New fields in v3                                                                                   |
|-----------------------------------|-------------------------------------|----------------------------------------------------------------------------------------------------|
| `roadmap.agency`                  | `agency.agency`                     | `principal_id`, `signing_key_id`, `os_user_id`, `dormancy_state`, catalog hygiene fields            |
| `roadmap.agency_liaison_session`  | `agency.agency_session`             | `liaison_host`, `dormancy_state`, `reconnect_grace_until`, `capacity_snapshot`, `consecutive_heartbeat_failures` |
| `roadmap.liaison_message`         | `messaging.a2a_message` (P603)      | (moves to messaging schema; not in agency)                                                          |
| `roadmap.liaison_message_kind_catalog` | `agency.liaison_message_kind_catalog` | `payload_schema`, `category`, `retention_days`, catalog hygiene                                  |

Migration script (rough, ships in P594 implementation):

```sql
-- Each existing agency gets a principal + signing key (key population deferred to credential wave)
INSERT INTO identity.principal (principal_did, kind, ...)
SELECT 'did:agency:' || provider_id || '/' || agency_id, 'service', ...
  FROM roadmap.agency
  ON CONFLICT DO NOTHING;

-- Copy agency rows with v3 columns
INSERT INTO agency.agency (...)
SELECT ... FROM roadmap.agency a
  JOIN identity.principal p ON p.principal_did = 'did:agency:' || a.provider || '/' || a.agency_id
  ...
  ON CONFLICT (agency_id) DO UPDATE SET ...;

-- Sessions copy 1:1
INSERT INTO agency.agency_session (...) SELECT ... FROM roadmap.agency_liaison_session;

-- Catalog: enrich with payload_schema (manual review per kind)
INSERT INTO agency.liaison_message_kind_catalog (kind, category, payload_schema, ...)
  SELECT kind, 'workflow', '{}'::jsonb, ... FROM roadmap.liaison_message_kind_catalog;
-- payload_schema then filled in incrementally per Tier-A enhancement proposal
```

Post-migration validation: orphan-principal count = 0; orphan-session count = 0; rowcounts match v1 tables.

---

## 9. Anti-features — what MUST NOT live in `agency.*`

1. **Per-spawn state** — spawns are ephemeral; their state belongs in `<tenant>.dispatch.work_claim`, not `agency_session`. Agency rows are long-lived.
2. **In-memory caches of trust grants** — caching is application layer (§7.5), NOTIFY-invalidated. The DB does not store cached grants.
3. **Provider-specific mutable behavior flags as columns** — they live in `agency.metadata` JSONB or `core.runtime_flag` scoped to the agency.
4. **Credential plaintext or references to plaintext** — credentials live only in vault; `agency_provider.auth_credential_id` is an opaque pointer.
5. **Coordinator election state** ("I am the reaper leader") — belongs in a future `orchestration.leadership` table or `pg_advisory_lock`. Never in agency.
6. **Mutable signing-key bytes** — keys are immutable in `identity.principal_key`; agency only references via FK.
7. **Plaintext liaison-message payloads as columns** — payloads live in `messaging.a2a_message.payload` JSONB; agency holds only the kind catalog.

---

## 10. Acceptance criteria for P594

- [ ] `database/ddl/hivecentral/003-agency.sql` defines all 5 tables with catalog hygiene, indexes, CHECK constraints, GENERATED `silence_seconds` column
- [ ] `agency.is_dispatchable()`, `agency.session_heartbeat()`, `agency.list_stale_sessions()`, `agency.mark_dormant()`, `agency.mark_reconnecting()` exist as `SECURITY DEFINER` functions
- [ ] RLS on `agency.agency_session` enforces `current_setting('app.current_agency_id')` matching
- [ ] DELETE on `agency.agency`, `agency_session`, `liaison_message_kind_catalog` is REVOKE'd from PUBLIC (lifecycle only)
- [ ] Dormancy sweep is cluster-safe (SKIP LOCKED + advisory lock); test under 4 simulated orchestrator instances confirms exactly-one transition per stale session
- [ ] DR reconciliation transitions match the failover script in `scripts/dr/lease-reconcile.sql`
- [ ] Restart-loop guard (3 consecutive heartbeat failures → `paused`) verified in integration test
- [ ] Migration script from `roadmap.agency.*` to `hiveCentral.agency.*` runs idempotently against a snapshot of today's DB, with orphan-row counts = 0
- [ ] `liaison_message_kind_catalog` seeded with current 4 kinds + JSONSchema for each, sourced from `src/infra/agency/liaison-message-types.ts`

---

## 11. Open questions for v3 lock

1. **Dormancy threshold configurability** — 90s is hardcoded in v1 schema; making it a runtime_flag is deferred to v1.1 unless an early operator demands tuning. Recommend: defer.
2. **Session row archival** — long-running install accumulates millions of `agency_session` rows. Recommend: v1 ships no cleanup; add date-partitioning + 30-day cold-tier archive in v1.1 if growth becomes measurable.
3. **Multi-region dormancy SLA** — when agencies cross regions (v2), `silence > 90s` measured at the control plane is biased by inter-region latency. Recommend: v1 single-region; v2 redefines as `silence > 90s + 2 × max_inter_region_latency` via PolicyEvaluator (§9.7).
4. **Project agency allow-lists** — should projects be able to restrict which agencies they accept? Recommend: defer to v2 via `project.project_agency_allow_list` (optional). Adds complexity v1 doesn't need.
5. **DR re-issuance of agency identity** — if an agency host dies and operator spins a new one, does the principal get reused (vault restore) or replaced? Recommend: reuse if old session was explicitly retired with retire_after grace; new principal otherwise.
6. **Heartbeat compression at scale** — > 100 active agencies = measurable write pressure. Recommend: defer; revisit when agency count > 50.

---

## Appendix — Squad transcript

The full PM, Backend Architect, AI Engineer, and Software Architect outputs are merged into the synthesis above. They ran in parallel as read-only research agents. Key consensus points: cluster-safety via SKIP LOCKED + advisory locks, JSON metadata for provider quirks (not explicit columns), reconnecting state for DR, controlled liaison_message_kind catalog with JSONSchema validation, persona is a runtime parameter not an agency attribute, three autonomous-agent gotchas (capability versioning, cascading latency, credential leakage via tracebacks).
