# P593 — Identity Schema (enhanced)

**Status:** Enhanced via 4-expert squad review. Maturity: mature pending gate review.
**Parent:** P590 (hiveCentral data-model overhaul).
**Schema family file (target):** `database/ddl/hivecentral/002-identity.sql` (DDL produced under P593, applied during P501).
**Reviewers:** Product Manager, Backend Architect, AI Engineer, Software Architect (parallel squad, 2026-04-26).

---

## 1. Synthesis (the proposal)

### 1.1 Why

Every state mutation that crosses a trust boundary in AgentHive must carry a signed envelope (§7). Without a principal+key registry, there are no envelopes; without envelopes, the rest of the v3 security model collapses to bearer tokens. P593 is the cryptographic root of trust: principals, signing keys, DID documents, trust grants, and an immutable audit log. Every other central schema (agency, credential, governance, observability) depends on it.

### 1.2 Scope

`hiveCentral.identity` schema with these tables:

- `principal` — every actor (humans, services, ephemeral spawns)
- `principal_key` — Ed25519 public key records (private keys live in vault); append-only with `superseded` chain so historical signatures verify forever
- `did_document` — W3C-style DID document per principal; immutable per `content_hash`
- `trust_grant` — least-privilege "this principal may do X on resource Y" assertions
- `audit_action` — every signature verify (success OR reject) writes a row; hash-chained via `prev_action_hash`

### 1.3 Public API (the only way other schemas talk to identity)

```
fn resolve_principal(did)                          → principal_row?
fn verify_signature(envelope)                      → {verified, principal_id, audit_row_id}
fn check_trust_grant(actor_did, action, resource)  → {allowed, grant_id}
fn rotate_principal_key(principal_id)              → {old_pub, new_pub, rotation_event_id}
fn revoke_principal(principal_id, reason)          → {revoked_at, grace_until}
fn issue_workload_token(dispatch_id, scope)        → {workload_did, signed_token, expires_at}
```

No other schema reads identity tables directly. Every call writes an `audit_action` row (success or reject), making identity a transparent audit stage.

### 1.4 Concrete table outlines (full DDL ships in `002-identity.sql`)

```sql
CREATE TABLE identity.principal (
  principal_id      BIGSERIAL PRIMARY KEY,
  principal_did     TEXT NOT NULL UNIQUE,           -- did:hive:user:X | did:hive:service:X | did:hive:spawn:...
  kind              TEXT NOT NULL CHECK (kind IN ('human','service','spawn','federation_peer')),
  display_name      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata          JSONB NOT NULL DEFAULT '{}',
  -- catalog hygiene (uniform across central catalogs)
  owner_did, lifecycle_status, deprecated_at, retire_after, notes
);

CREATE TABLE identity.principal_key (
  key_id                BIGSERIAL PRIMARY KEY,
  principal_id          BIGINT NOT NULL REFERENCES identity.principal,
  public_key            BYTEA NOT NULL UNIQUE,      -- Ed25519 32B; private key lives in vault
  serial_number         INT NOT NULL,                -- monotonic per principal
  status                TEXT NOT NULL CHECK (status IN ('active','superseded','revoked')),
  superseded_at         TIMESTAMPTZ,
  superseded_by_key_id  BIGINT REFERENCES identity.principal_key,
  signed_by_principal_id BIGINT REFERENCES identity.principal,  -- attestation chain (root → orchestrator → spawn)
  signed_by_proof       BYTEA,                       -- signature over (principal_id, public_key, valid_from, valid_until)
  valid_from            TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until           TIMESTAMPTZ,
  metadata              JSONB NOT NULL DEFAULT '{}',
  -- catalog hygiene fields
  UNIQUE (principal_id, serial_number)
);

CREATE TABLE identity.did_document (
  did_id            BIGSERIAL PRIMARY KEY,
  principal_did     TEXT NOT NULL UNIQUE REFERENCES identity.principal(principal_did),
  document_jsonb    JSONB NOT NULL,                  -- W3C verificationMethod[], proof[], service[]
  active_key_id     BIGINT NOT NULL REFERENCES identity.principal_key,
  content_hash      TEXT NOT NULL,                   -- sha256(canonical_json(document))
  published_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.trust_grant (
  grant_id          BIGSERIAL PRIMARY KEY,
  granter_id        BIGINT NOT NULL REFERENCES identity.principal,
  grantee_id        BIGINT NOT NULL REFERENCES identity.principal,
  resource_type     TEXT NOT NULL,                    -- 'proposal' | 'project' | 'sandbox' | 'credential' | '*'
  resource_id       TEXT,                             -- NULL = blanket
  action            TEXT NOT NULL,                    -- 'read' | 'write' | 'execute' | 'admin' | '*'
  expires_at        TIMESTAMPTZ,
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- catalog hygiene fields
);

CREATE TABLE identity.audit_action (
  action_id              BIGSERIAL PRIMARY KEY,
  principal_did          TEXT NOT NULL,
  action_type            TEXT NOT NULL,
  resource_type          TEXT NOT NULL,
  resource_id            TEXT,
  result                 TEXT NOT NULL CHECK (result IN ('success','rejected','error')),
  reason                 TEXT,
  signed_envelope        JSONB NOT NULL,
  envelope_signature_key_id BIGINT REFERENCES identity.principal_key,
  prev_action_id         BIGINT REFERENCES identity.audit_action,
  prev_action_hash       TEXT,                         -- sha256(prev row content) — tamper detection
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity.replay_cache (    -- nonce uniqueness window for replay protection
  nonce        TEXT PRIMARY KEY,
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE identity.federation_peer (  -- v2-ready, populated only when federation enabled
  peer_id                  BIGSERIAL PRIMARY KEY,
  peer_hivecentral_did     TEXT UNIQUE NOT NULL,
  peer_root_public_key     BYTEA NOT NULL,
  peer_signed_by           TEXT,                       -- 'self' | parent_root_did
  trusted_at               TIMESTAMPTZ,
  approved_by_principal_id BIGINT REFERENCES identity.principal,
  -- catalog hygiene fields
);
```

---

## 2. The bootstrap problem (Open Q #9 from §15) — solved

A 3-layer attestation chain breaks the meta-circular trust problem:

```
  Installation Root Key  (offline, hardware-backed, in vault, MFA-gated)
         │ signs
         ▼
  Orchestrator Signing Key  (online, weekly rotation, on the orchestrator host)
         │ signs
         ▼
  Workload Tokens for Spawns  (per-task, ≤ 1 hour TTL)
```

**Installation ceremony** (one-time, manual):
1. Operator generates root keypair on an air-gapped machine with hardware backing
2. Public key → `/etc/agenthive/installation-root-public.pem` (version-controlled)
3. Private key → vault under MFA-gated path; never online
4. Operator inserts `did:hive:installation-root` principal + root `principal_key`

**Orchestrator first boot**:
1. Reads `/etc/agenthive/installation-root-public.pem`
2. Generates its own keypair locally; private key in `/var/lib/agenthive/orchestrator-key.json` (mode 0600, owned by service user)
3. Calls `identity.subordinate_key_registration(orchestrator_principal_id, public, signature_by_root)` — function verifies the root signature before inserting the row

**Weekly orchestrator rotation**:
1. Orchestrator generates a new keypair, writes a row to `identity.pending_key_rotation`
2. Operator alerted; retrieves request, signs with root key (vault MFA), submits via API endpoint that validates the root signature
3. New `principal_key` activated; old key marked `valid_until = now()` (status → `superseded`, NOT deleted)
4. **5-minute grace window**: verifiers accept signatures from both the old and new key while orchestrator restarts/reloads
5. `governance.decision_log` entry kind=`orchestrator_key_rotation`, hash-chained
6. Spawns with token expiry < 2 minutes are not renewed mid-rotation; they age out cleanly

**Emergency rotation (compromise detected)**:
- Same flow but the rotation request is signed AND a `delegation token` is minted that authorizes in-flight spawns to keep working under the new key for ≤ 1 hour. This is the "break-glass" path so an emergency rotation doesn't mid-task abort dozens of spawns.

---

## 3. Workload identity (the AI-agent-specific layer)

Every spawn gets an ephemeral `did:hive:spawn:<dispatch_id>:<spawn_serial>` principal with a 1-hour TTL signing key. The DID document carries a **scope blob** that scopes the spawn's authority to one task:

```json
{
  "did": "did:hive:spawn:dispatch-12345:1",
  "iss": "did:hive:service:orchestrator",
  "iat": 1714207200,
  "exp": 1714210800,
  "scope": {
    "project_id": 42,
    "proposal_id": 527,
    "phase": "develop",
    "allowed_tool_ids": ["mcp:gh:pr:list", "mcp:psql:read", "mcp:git:commit"],
    "tool_constraints": {
      "mcp:psql:read": {"projects": [42], "tables": ["proposal.*"]},
      "mcp:git:commit": {"repos": ["agenthive"], "branches": ["p527/*"]}
    },
    "sandbox_id": 89,
    "renewal_deadline": 1714208700
  },
  "aud": ["mcp-server", "pgbouncer", "sandbox"]
}
```

**Tool-call verification path** (every MCP tool call):
1. MCP server extracts workload DID + signature from request
2. Verifies signature against orchestrator's current public key (cached 5min, NOTIFY-invalidated)
3. Loads scope blob from `did_document.document_jsonb`
4. Checks `tool_id ∈ scope.allowed_tool_ids`
5. Checks per-tool constraints (e.g. SQL parser confirms target tables ∈ `tool_constraints.tables`)
6. Writes `observability.decision_explainability` row with allow/deny + structured reasons (so "why was my spawn denied?" is queryable)

**Three agent-system gotchas humans miss** (per AI Engineer review):
- **Scope staleness on lease renewal** — every renewal MUST re-evaluate scope (policy can change mid-lease). If a tool was revoked since spawn time, the renewal scope tightens or denies.
- **Static `allowed_tool_ids` ≠ dynamic catalog** — MCP must additionally check `tooling.tool.lifecycle_status='active'` on every call, not just at spawn time, so a tool deprecated mid-spawn becomes immediately unreachable.
- **Cascading revocation under emergency rotation** — without the `delegation token` (above), an emergency orchestrator-key rotation breaks all in-flight spawns mid-task. The 1-hour delegation window prevents that.

---

## 4. Identity lifecycle (catalog hygiene mapping)

Three lifecycles, each mapped to the uniform `lifecycle_status` field:

| Entity            | Created                              | Active                  | Rotated                | Deprecated                       | Retired                                                        |
|-------------------|--------------------------------------|-------------------------|------------------------|----------------------------------|----------------------------------------------------------------|
| **Principal**     | On agency register / spawn mint      | Verifying signatures    | —                      | `lifecycle_status=deprecated` (no new actions) | After `retire_after`, invisible to dispatch but still resolvable in audit |
| **Principal key** | Vault-backed Ed25519 keypair         | Signing & verifying     | Weekly (orchestrator) / on-demand (services) | Old key `superseded`; can still verify historical signatures | Never deleted; eventually `lifecycle_status=retired` after long grace period |
| **Trust grant**   | Policy decision grants access        | Authorization checks    | —                      | Revoke (policy change)           | After `retire_after`, no new dispatches use this grant         |

**Hard rule:** `principal_key` and `audit_action` are **append-only**. NEVER DELETE. Schema constraint enforces this.

When an agency is decommissioned:
1. **Phase 1 (deprecation):** `lifecycle_status=deprecated`, `retire_after = now() + 90 days`. Dispatch refuses new offers; in-flight leases continue; key still valid for in-flight signatures.
2. **Phase 2 (retirement):** after `retire_after`, principal invisible to dispatch. Tokens issued before `retire_after` with `expires_at > now()` still verify (signed when valid). Historical `audit_action` rows queryable forever — auditor can answer "what did agency-X do on day-Y" five years later.

---

## 5. Disaster recovery handling

Workload tokens **survive failover** because:
- Private keys live in **vault**, not the DB; replication doesn't touch them
- `principal_key` public records replicate via streaming replication (synchronous_commit=on)
- Tokens issued before failover with `expires_at > now()` are still valid on the new primary
- Verifiers re-fetch public key from `identity.principal_key` on the new primary; signature check passes

**Edge case** (documented in DR doc §5): if scheduled key rotation overlaps with failover, rotation is delayed by 1 hour. Operator runbook covers this.

---

## 6. Index strategy — hot paths

| Path                                | Index                                                                    | SLO target  |
|-------------------------------------|--------------------------------------------------------------------------|-------------|
| `verify_signature` → resolve principal by DID | `principal_did_lookup` (active rows only)                              | < 5ms p99   |
| Lookup current key for principal    | `principal_key_active (principal_id, status='active')`                   | < 5ms p99   |
| Walk superseded chain for historical verify | `principal_key_superseded_chain (superseded_by_key_id)`              | < 50ms p99  |
| Check trust grant                   | `trust_grant_grantee (grantee_id, resource_type) WHERE active + not expired` | < 10ms p99 |
| Hash-chain verifier (last 24h)      | `audit_action_hash_chain (prev_action_id)`                                | windowed scan, full chain weekly |
| Forensic resource lookup            | `audit_action_resource (resource_type, resource_id)`                      | < 100ms p99 |

Combined `verify_signature` SLO: **< 20ms p99** end-to-end (this is in the critical path of every signed envelope).

---

## 7. Anti-features — what MUST NOT live in `identity`

1. **Session state** (`session_id`, `last_seen`, `session_timeout`) — belongs in `agency.agency_session`. Identity is "who are you"; session is "are you connected right now."
2. **Plaintext API tokens / OAuth tokens** — belong in `credential.credential` (vault-backed). Identity stores only long-lived signing keys + references.
3. **Mutable policy fields** (`allowed_actions[]`, `max_concurrent_leases`) — belong in `trust_grant`. Identity is immutable; grants change.
4. **Cached resolved trust graph** ("X can do Y on Z" pre-computed) — always compute on demand via `check_trust_grant`. Caching is application layer (§7.5).
5. **Mutable `public_key` fields** — keys are append-only. Never UPDATE; INSERT a new row, mark old `superseded`.
6. **Provider-specific fields** — keep this schema provider-agnostic. Anything Claude-specific or Codex-specific goes in `agency.*` or `principal.metadata` JSON.

---

## 8. Acceptance criteria for P593

- [ ] `database/ddl/hivecentral/002-identity.sql` defines all 6 tables with catalog hygiene fields, indexes, and CHECK constraints
- [ ] DELETE on `principal_key` and `audit_action` is rejected by trigger or explicit role grant restriction (append-only enforced at DB level)
- [ ] Public API functions (`resolve_principal`, `verify_signature`, `check_trust_grant`, `rotate_principal_key`, `revoke_principal`, `issue_workload_token`) exist as `SECURITY DEFINER` functions with audit-row insertion
- [ ] Bootstrap protocol (installation root → orchestrator → workload) is documented in `docs/identity/bootstrap-ceremony.md`
- [ ] Quarterly compliance test passes: sample 10 retired principals, verify audit chain unbroken end-to-end
- [ ] Hash-chain verifier (incremental last-24h every 5min, full weekly) is wired to the central scheduler
- [ ] `signed_by_proof` validation rejects orchestrator-key registration without valid root signature

---

## 9. Open questions for v3 lock review

1. **Operator quorum for root-key rotation?** Single operator works in v1; at 10+ operators a quorum-of-N signing flow may be needed. Defer to a follow-up proposal once operator count > 3.
2. **Workload-token scope enforcement: identity layer or per-tool?** Today each MCP tool checks scope. Centralizing in `verify_signature` is safer but less flexible. Recommend: keep central enforcement for `proposal_id` / `project_id` boundary; leave per-tool semantic constraints (which SQL tables, which git branches) at the tool layer.
3. **Federation key sync** — does region B replicate region A's `principal_key` table, or query on demand? Defer to the federation-launch proposal (post-v1).
4. **Superseded-key hard expiry?** Old keys can still verify forever today. Should they hard-expire 30 days after rotation to limit attacker reuse window? Recommend: yes, 30 days, but make `audit_action` row keep a snapshot of the key bytes for forever-verifiability.
5. **DID document freshness on cache miss** — verifiers cache DID documents 5min. If `hiveCentral` is briefly unreachable, cached docs serve. Should cache TTL drop to seconds for security-critical operations? Recommend: configurable per-tool via runtime_flag.

---

## Appendix — Squad transcript

The full outputs of the 4 reviewers (Product Manager, Backend Architect, AI Engineer, Software Architect) are preserved verbatim in this file as the historical synthesis input. They run in parallel as read-only research; they do not write code or files. The synthesis above merges their consensus and surfaces residual disagreements as open questions.
