# P596 — Credential Schema (enhanced)

**Status:** Enhanced via 4-expert squad review. Maturity: mature pending gate review.
**Parent:** P590. **Schema family file (target):** `database/ddl/hivecentral/005-credential.sql`.
**Depends on:** P592 (`core`), P593 (`identity`).
**Reviewers:** Product Manager, Backend Architect, AI Engineer, Software Architect (parallel squad, 2026-04-26).

---

## 1. Synthesis

### Why

The DB never holds plaintext secrets — it holds **pointers** to vault-backed secrets, plus access grants, rotation policy, and immutable audit. Without this schema, agencies and tenants must read plaintext creds from `/etc/agenthive/env`, which has no rotation log, no per-principal grants, no compliance trail. P596 makes credential rotation, revocation, and access provably auditable while staying vault-agnostic (systemd_credential, file_vault, AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager are all swap-by-config).

### Scope (5 tables)

- `credential.vault_provider` — adapter registry; one row per backend
- `credential.credential` — pointer (kind, vault_provider_id, vault_path, rotation_policy, last_rotated_at, next_rotation_at, fallback chain, supersedes chain)
- `credential.credential_grant` — (credential_id, principal_did, permitted_ops[]) with optional expires_at and **scope** (project_id, tool_ids[]) for cross-tenant isolation
- `credential.credential_rotation_log` — append-only, hash-chained, links to `governance.decision_log`
- `credential.credential_access_log` — append-only structured access trail (no plaintext, no vault paths in error fields) — required for SOC 2 / HIPAA / PCI

### Public API

```
credential.get(credential_id, requesting_principal_did, action)
  → {kind, vault_path, last_rotated_at, current_rotation_status}
  + writes credential_access_log + identity.audit_action

credential.verify_grant(principal_did, action, credential_id) → {allowed, grant_id, deny_reason?}
credential.list_grants_for_principal(principal_did) → grant_rows[]
credential.request_rotation(credential_id, by_did, reason) → {rotation_id, pending_until}
credential.list_due_for_rotation(limit) → credential_rows[]   -- scheduler hot path
credential.revoke(credential_id, by_did, severity)            -- severity: normal|urgent|emergency
```

All consequential calls write `identity.audit_action` per §9 layer 3 of the redesign. `verify_grant` writes whether the answer is allow OR deny.

---

## 2. Concrete table outlines (full DDL ships in `005-credential.sql`)

```sql
-- Vault adapter registry
CREATE TABLE credential.vault_provider (
  vault_provider_id  TEXT PRIMARY KEY,            -- 'systemd-bootstrap' | 'aws-sm-prod' | 'vault-eu' | ...
  display_name       TEXT NOT NULL,
  provider_type      TEXT NOT NULL CHECK (provider_type IN
                     ('systemd_credential','file_vault','aws_sm','hashicorp_vault','gcp_sm')),
  config             JSONB NOT NULL,              -- adapter-specific config (endpoint, auth method, region, TLS, namespace) — never secret bytes
  status             TEXT NOT NULL DEFAULT 'healthy'
                     CHECK (status IN ('healthy','degraded','unreachable')),
  is_enabled         BOOLEAN NOT NULL DEFAULT true,
  -- catalog hygiene fields
);

-- Credential pointers
CREATE TABLE credential.credential (
  credential_id              BIGSERIAL PRIMARY KEY,
  kind                       TEXT NOT NULL CHECK (kind IN
                             ('pg_password','api_key','oauth_token','signing_key','tls_cert','other')),
  display_name               TEXT NOT NULL,
  vault_provider_id          TEXT NOT NULL REFERENCES credential.vault_provider,
  vault_path                 TEXT NOT NULL,
  rotation_policy            TEXT NOT NULL DEFAULT 'never'
                             CHECK (rotation_policy IN ('never','external','on_demand','daily','weekly','monthly')),
  last_rotated_at            TIMESTAMPTZ,
  next_rotation_at           TIMESTAMPTZ,
  rotation_window_start_hour INT,                 -- e.g. 02 for off-peak rotations
  -- Supersedes chain (per-credential versioning, mirrors identity.principal_key pattern)
  supersedes_credential_id   BIGINT REFERENCES credential.credential,
  superseded_at              TIMESTAMPTZ,
  superseded_by_credential_id BIGINT REFERENCES credential.credential,
  status                     TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','superseded','revoked')),
  -- Cross-credential fallback (e.g. rate-limit secondary key — same provider only)
  fallback_credential_id     BIGINT REFERENCES credential.credential,
  fallback_condition         TEXT CHECK (fallback_condition IN ('rate_limit','quota_exceeded','provider_unavailable')),
  -- Catalog hygiene fields
  metadata                   JSONB NOT NULL DEFAULT '{}',  -- {tags[], owner_team, alert_on_failure, vault_current_version}
  CONSTRAINT rotation_consistency CHECK (
    (rotation_policy IN ('never','external','on_demand') AND next_rotation_at IS NULL) OR
    (rotation_policy IN ('daily','weekly','monthly') AND next_rotation_at IS NOT NULL)
  )
);

CREATE INDEX credential_due_for_rotation
  ON credential.credential (next_rotation_at)
  WHERE lifecycle_status='active' AND status='active'
    AND rotation_policy IN ('daily','weekly','monthly');

-- Access grants — fine-grained, cross-tenant scope-aware
CREATE TABLE credential.credential_grant (
  grant_id          BIGSERIAL PRIMARY KEY,
  credential_id     BIGINT NOT NULL REFERENCES credential.credential,
  principal_did     TEXT NOT NULL,                 -- 'did:hive:agency:...' | 'did:hive:service:...' | 'did:hive:spawn:...'
  permitted_ops     TEXT[] NOT NULL CHECK (permitted_ops <@ ARRAY['read','rotate','revoke','export']::TEXT[]),
  -- Cross-tenant isolation (per AI Engineer review #5)
  scope_project_id  BIGINT REFERENCES project.project,   -- NULL = platform-wide
  scope_tool_ids    TEXT[],                              -- NULL = any tool
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by_did    TEXT NOT NULL,
  expires_at        TIMESTAMPTZ,
  -- catalog hygiene fields
  UNIQUE (credential_id, principal_did, COALESCE(scope_project_id, 0))
);

CREATE INDEX credential_grant_principal_active
  ON credential.credential_grant (principal_did, credential_id)
  WHERE lifecycle_status='active' AND (expires_at IS NULL OR expires_at > now());

-- Append-only rotation log (hash-chained)
CREATE TABLE credential.credential_rotation_log (
  log_id           BIGSERIAL PRIMARY KEY,
  credential_id    BIGINT NOT NULL REFERENCES credential.credential,
  rotated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_by_did   TEXT NOT NULL,
  outcome          TEXT NOT NULL CHECK (outcome IN ('success','failure','deferred','in_progress')),
  reason           TEXT,
  new_vault_path   TEXT,
  -- Affected work tracking (for emergency rotations)
  affected_active_spawns INT NOT NULL DEFAULT 0,
  delegation_token_id    UUID,                     -- if emergency rotation issued a delegation token
  -- Hash chain
  prev_log_id      BIGINT REFERENCES credential.credential_rotation_log,
  prev_log_hash    TEXT,
  this_log_hash    TEXT NOT NULL,
  -- Link to governance audit
  governance_decision_id BIGINT,                   -- soft FK to governance.decision_log (P605)
  owner_did        TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only access log (compliance — SOC 2 / HIPAA / PCI)
CREATE TABLE credential.credential_access_log (
  access_id          BIGSERIAL PRIMARY KEY,
  credential_id      BIGINT NOT NULL REFERENCES credential.credential,
  principal_did      TEXT NOT NULL,
  operation          TEXT NOT NULL CHECK (operation IN ('read_secret','verify_grant','rotate_request','revoke')),
  outcome            TEXT NOT NULL CHECK (outcome IN ('allowed','denied')),
  deny_reason_kind   TEXT,                          -- enum: 'expired_grant'|'principal_retired'|'scope_mismatch'|'no_permission'|'cred_revoked'|'rate_limit_exceeded'
  deny_reason_detail TEXT,                          -- structured; never vault path or value
  artificial_delay_ms INT NOT NULL DEFAULT 0,        -- timing-attack defense (50-100ms jitter on denied)
  dispatch_id        BIGINT,
  vault_provider_id  TEXT,
  request_ip         INET,
  caller_span_id     UUID,                          -- OpenTelemetry trace linkage to observability
  accessed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX credential_access_log_credential
  ON credential.credential_access_log (credential_id, accessed_at DESC);
CREATE INDEX credential_access_log_principal_denied
  ON credential.credential_access_log (principal_did, accessed_at DESC) WHERE outcome='denied';

-- Emergency rotation events (per AI Engineer #6.C)
CREATE TABLE credential.credential_rotation_emergency (
  event_id            BIGSERIAL PRIMARY KEY,
  old_credential_id   BIGINT NOT NULL REFERENCES credential.credential,
  new_credential_id   BIGINT NOT NULL REFERENCES credential.credential,
  rotation_reason     TEXT NOT NULL,                -- 'security_incident' | 'key_leak' | 'compromise_detected'
  delegation_token_id UUID NOT NULL UNIQUE,
  delegation_expires  TIMESTAMPTZ NOT NULL,
  initiated_by_did    TEXT NOT NULL,
  governance_decision_id BIGINT,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Append-only enforcement:** triggers on `credential_rotation_log`, `credential_access_log`, `credential_rotation_emergency` raise exceptions on UPDATE/DELETE. DELETE privilege REVOKE'd from PUBLIC.

**Hash-chain trigger** on `credential_rotation_log` matches the pattern from P593:
- prev_log_hash = previous row's this_log_hash (genesis = `0`*64)
- this_log_hash = sha256(prev_log_hash || outcome || rotated_by_did || rotated_at || credential_id)
- Incremental verifier (last 24h every 5min, full chain weekly) per §9 layer 6.

---

## 3. Vault adapter abstraction (config-driven swap)

`vault_provider.config` is JSONB; provider-specific. Same code path; one row update = backend swap:

```jsonc
// systemd_credential
{ "type":"systemd_credential", "root_dir":"/var/lib/agenthive/credentials", "file_mode":"0600", "owner_user":"agenthive_runtime" }

// AWS Secrets Manager
{ "type":"aws_sm", "region":"us-west-2", "auth_method":"iam-role", "kms_key_id":"arn:aws:kms:...", "secret_name_prefix":"agenthive/" }

// HashiCorp Vault
{ "type":"hashicorp_vault", "addr":"https://vault.example.com:8200", "auth_method":"kubernetes", "namespace":"agenthive", "mount_path":"secret" }

// file_vault (single-host dev)
{ "type":"file_vault", "root_dir":"/var/lib/agenthive/vault", "encryption_key_path":"/etc/agenthive/vault-key.aes-256", "file_mode":"0400" }
```

Runtime resolves via `VaultAdapterFactory.create(provider_type, config)`. Adding GCP Secret Manager later = add `provider_type='gcp_sm'` to the CHECK + new adapter class.

---

## 4. AI-agent specifics (per AI Engineer review)

### Per-spawn credentials? No.

A spawn never gets its own DB-stored credential. Identity is the workload token (P593 §3a). If a tool needs a per-task token (e.g., GitHub PR token), it's generated **inside the sandbox after workload-token verification** and held in memory only — never persisted. Two credentials per spawn = double rotation/revocation surface; rejected.

### Token rotation impact on in-flight spawns

Three-layer safety:
1. **NOTIFY broadcast on rotation** — `NOTIFY credentials_rotated, '<credential_id>'` triggers cache flush in MCP and orchestrator
2. **Spawn-side grace window** — every spawn's briefing carries `credential_safety_until`; rotations within this window allow one retry with the previous secret. Outside the window: hard fail with structured error
3. **Workload-token independence** — workload tokens are signed by the orchestrator key (not the rotated credential), so a model-API key rotation does NOT invalidate spawns; only the spawn's tool calls fail until refresh

```sql
-- briefing fields (in P603/dispatch design):
credential_snapshot_at  TIMESTAMPTZ NOT NULL,
credential_safety_until TIMESTAMPTZ NOT NULL    -- rotations after this = hard fail
```

### Provider rate-limit handoff

`credential.fallback_credential_id` (same provider only — cross-provider fallback is route-level, not credential-level). At runtime the orchestrator's selector cascades:
1. Try selected route's credential
2. On rate-limit error → try `credential.fallback_credential_id`
3. Still failing → try `model_route.fallback_route_id` (which has its own credential)
4. Log the path taken to `observability.model_routing_outcome` with reason='credential_rate_limit_handoff'

Keeps catalog clean: one credential row per secret; cross-provider routing stays in `model.model_route`.

### Credential-error redaction (sealed enum)

Errors returned to callers are a sealed enum — no vault paths, no values:

```
CredentialError =
  | CredentialNotFound(credential_id)       // never "vault path X missing"
  | CredentialExpired(credential_id, at)    // age, not mechanism
  | CredentialRevoked(credential_id, by)    // revocation principal
  | PermissionDenied(credential_id, actor)  // actor + resource only
  | VaultUnavailable(latency_ms)            // transient, no internals
  | RotationInProgress(credential_id)       // actionable
  | ScopeMismatch(credential_id, required_scope) // for cross-tenant denials
```

The `credential_access_log.deny_reason_kind` mirrors this enum exactly (machine-readable). `deny_reason_detail` is structured human-readable; CI lint rejects `err.toString()` or `.stack` near credential code paths.

### Cross-tenant isolation

Project A's spawn must NOT read project B's credentials even if it knows the credential_id. Three-layer enforcement:

1. **Grant scope** — `credential_grant.scope_project_id` is the gate. The grant for project A's principal carries `scope_project_id = <A>`. Project B's spawn can never resolve a grant on credential 42 if the only matching grants are scoped to project A
2. **Workload-token scope check** — spawn's token carries `scope.project_id`; `credential.get()` rejects if `spawn.scope.project_id ≠ grant.scope_project_id`
3. **Timing-attack defense** — denied requests get 50-100ms artificial jitter to prevent "probe credential_id range and time the response" attacks. Recorded in `credential_access_log.artificial_delay_ms`

### Three autonomous-agent gotchas (squad-surfaced)

1. **Distributed-spawn availability parity** — credential reads always hit the **primary vault**, never a stale read-replica. Spawns issued after rotation timestamp T see the new secret; spawns before T allowed one grace retry with old. Prevents teammates getting different views of "is this credential valid right now?"
2. **Scope staleness on token renewal** — `credential.get()` checks `lifecycle_status` AND `status` on every call (not just at spawn time). Revocation is **immediate**, not eventually consistent. CONVENTIONS.md should document this.
3. **Cascading failure under emergency rotation** — when a credential is emergency-rotated, the orchestrator issues a `delegation_token` (recorded in `credential_rotation_emergency`) that lets in-flight spawns finish their current task with the old credential for ≤ 1 hour. Each delegation logged to `decision_explainability` with the spawn's `briefing_id`.

---

## 5. DR vs vault (independent failure domains)

| Layer | Replication | DR action |
|---|---|---|
| `credential.*` rows (pointers, grants, logs) | Postgres streaming replication to standby | DB failover script (P591) flips PgBouncer; rows arrive intact |
| Vault contents (the actual secret bytes) | Vault's own HA strategy (active-passive, region-local) | Independent vault failover; operator promotes vault standby via MFA-gated runbook |

**Workload tokens issued before failover stay valid** because they're signed by the orchestrator key (in vault, not DB). Verifiers re-fetch the public key from `identity.principal_key` on the new primary; signature check passes.

**If both DB and vault fail simultaneously:**
1. Restore DB from off-host backup (≤ 30 min)
2. Restore vault from its backup (5-15 min depending on provider)
3. Verify in-sync: `MAX(credential_rotation_log.log_id)` matches vault's audit log
4. Resume dispatch

DR drill cadence (per §11.3): monthly failover drill, quarterly backup-restore, annual cold DR including vault. All logged via `governance.decision_log` kind=`dr_drill`.

---

## 6. Migration from `/etc/agenthive/env`

```sql
-- 1. Bootstrap legacy provider
INSERT INTO credential.vault_provider (vault_provider_id, display_name, provider_type, config, owner_did)
VALUES ('systemd-bootstrap','SystemD Credential (legacy)','systemd_credential',
        '{"type":"systemd_credential","root_dir":"/var/lib/agenthive/credentials","file_mode":"0600"}'::jsonb,
        'did:hive:bootstrap');

-- 2. Move plaintext secrets to vault paths; create pointer rows
-- For each existing /etc/agenthive/env entry, run:
INSERT INTO credential.credential (kind, display_name, vault_provider_id, vault_path, rotation_policy, owner_did)
VALUES ('api_key','Anthropic API Key','systemd-bootstrap','agency/claude-code/anthropic-key','external','did:hive:bootstrap');

-- 3. Grant access to the orchestrator (and scope to tools that need it)
INSERT INTO credential.credential_grant (credential_id, principal_did, permitted_ops, granted_by_did, owner_did)
SELECT credential_id, 'did:hive:service:orchestrator', ARRAY['read'], 'did:hive:bootstrap', 'did:hive:bootstrap'
  FROM credential.credential WHERE display_name='Anthropic API Key';

-- 4. Operational: code paths swap from process.env.X to getCredential(credential_id)
-- 5. After all paths verified, /etc/agenthive/env entries are removed in a follow-up commit
```

CI lint rule (added under P596): forbid `process.env.*` reads inside files matched by `**/*credential*` and inside agency/orchestrator code paths.

---

## 7. Anti-features

1. **Plaintext secrets** — never in DB, never in logs, never in error messages
2. **Cached decrypted values** — application-layer cache only, with NOTIFY invalidation; the DB is not a cache
3. **Ephemeral session tokens** — those belong in `agency.agency_session`
4. **Mutable secret bytes** — credentials are immutable; rotation creates a new row + supersedes chain
5. **Unlogged access attempts** — every call writes `credential_access_log`, success or deny
6. **Cross-credential dependencies as data** — model as policy rules in PolicyEvaluator (§9.7), not in credential schema
7. **In-database secret derivation** — never hash/derive secrets in SQL; vault does that
8. **Provider-specific extension columns** — extension fields go in `vault_provider.config` or `metadata` JSONB

---

## 8. Acceptance criteria for P596

- [ ] `database/ddl/hivecentral/005-credential.sql` defines all 5 tables with catalog hygiene, indexes, CHECK constraints, hash-chain trigger
- [ ] DELETE/UPDATE on `credential_rotation_log`, `credential_access_log`, `credential_rotation_emergency` rejected by trigger AND REVOKE
- [ ] `credential.get()`, `verify_grant()`, `request_rotation()`, `revoke()`, `list_due_for_rotation()` exist as SECURITY DEFINER functions; every call writes `credential_access_log`
- [ ] Sealed `CredentialError` enum implemented in `src/infra/credential/errors.ts` with CI lint rule rejecting raw error spillage near credential code
- [ ] Timing-attack defense: denied responses carry 50-100ms jitter; verified via integration test
- [ ] Cross-tenant isolation: project-A spawn cannot read credential granted only to project-B; verified via integration test
- [ ] NOTIFY `credentials_rotated` fires on every rotation; cache layer (§7.5) consumes it
- [ ] Migration script from `/etc/agenthive/env` runs idempotently; no plaintext remains in env files in the post-cutover state
- [ ] Hash-chain incremental verifier wired (5min last-24h, weekly full chain)
- [ ] Vault provider swap exercise: switch `systemd_credential` → `aws_sm` in staging via single row update + service restart; cred reads succeed without code changes

---

## 9. Open questions

1. **MFA approval tracking** — vault enforces MFA on sensitive paths; should `credential_rotation_log.approvals JSONB` capture `[{approver_did, approved_at, method}]`? Recommend: yes, for audit completeness.
2. **Per-spawn credential scope** — extend workload-token scope (P593) with `allowed_credential_ids[]`? Recommend: yes — least privilege per task aligns with the redesign's §9 layer 3a goals.
3. **Versioning vs supersedes chain** — chosen supersedes (mirrors `identity.principal_key`); each version is a separate row linked via `supersedes_credential_id`. Old credential usable for `grace_period_days` (default 7) then hard-expires. Settled.
4. **Vault-failover replication** — multi-vault redundancy is vault's own HA, not in this schema. Documented in operator runbook.
5. **Rotation atomicity across regions (v2)** — when v2 introduces multi-region, leader-elect rotation via `pg_advisory_lock` to prevent concurrent attempts. Out of scope for v1.
6. **Compliance access trail retention** — `credential_access_log` retention 90 days hot, indefinite cold archive for compliance-tagged credentials. Recommend: configurable per credential via `metadata.compliance_retention_days`.

---

## Appendix — Squad transcript

PM, Backend Architect, AI Engineer, Software Architect outputs merged. Key consensus: pointer-only (never plaintext), append-only audit at two levels (rotation + access), hash-chained rotation log links to `governance.decision_log`, sealed `CredentialError` enum prevents path leakage, timing-attack defense via artificial delay on denials, cross-tenant isolation via grant scope + workload-token check, emergency rotation via delegation token to avoid mid-task abort cascade. PM raised compliance gap (rotation log alone insufficient for "every access" audit) → resolved by adding `credential_access_log`. Architect raised MFA tracking + per-spawn credential scope → resolved as schema additions.
