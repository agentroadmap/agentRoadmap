# Migration Security Review — File-to-Database Transition

**State:** STATE-095 (AC#5)  
**Date:** 2026-03-25  
**Author:** Security Engineer  
**Reviewed:** file-to-db-migration-strategy.md, security-review-2026-03-22.md  
**Classification:** Internal — Security architecture for data migration

---

## Executive Summary

This review evaluates the security posture of the file-to-database migration against three axes: **access control changes**, **audit trail integrity**, and **rollback safety**. Cross-referencing the migration strategy (Software Architect, 2026-03-24) with the prior security review (2026-03-22) reveals that 4 of 12 P0/P1 security items from the earlier review are still unresolved and directly impact migration safety.

**Overall risk: 🟡 HIGH** — Migration is architecturally sound but security-critical prerequisites are incomplete.

---

## 1. Access Control: File Permissions → Database Permissions

### 1.1 Current Model (File-Based)

| Layer | Mechanism | Granularity | Enforcement |
|---|---|---|---|
| **Secrets** | `0o600` on identity.json, .vault-key | Owner-only | OS kernel |
| **Audit log** | `0o644` on audit.jsonl | World-readable | OS kernel |
| **State files** | `0o644` default umask | Any process with UID | OS kernel |
| **DB file (.cache/index.db)** | Default umask | **No protection** | OS kernel (too broad) |

**Gap identified in security-review-2026-03-22 §3.2:** "Any agent with filesystem access can edit any state file. The assignee field is advisory, not a gate." This gap carries forward into the DB migration — SQLite doesn't enforce row-level access control.

### 1.2 Target Model (Database)

The migration strategy proposes Postgres with workflow actions as the access boundary. But the **interim** phase (SQLite as local cache, dual-write) has a weaker security posture than the current file model:

| Concern | File Model | SQLite Interim | Postgres Target |
|---|---|---|---|
| **Read access** | Any process | Any process with DB path | Authenticated client |
| **Write access** | Any process with UID | Any process with DB path | workflow action-validated |
| **Row-level control** | None (file per state) | None (single table) | workflow action logic |
| **Credential isolation** | `0o600` files | **DB file has no encryption** | Module-level |

**Critical finding:** The SQLite interim phase is **less secure** than the current file model for secrets. Files can have `0o600` permissions individually; a SQLite database is a single file with uniform permissions. The `agent_tokens` and `encrypted_configs` tables (implemented in `src/core/db-security.ts`) mitigate this by storing only hashes and encrypted values, but the DB file itself needs `0o600` permissions.

### 1.3 Access Control Table Design

The `access_control` table implemented in `src/core/db-security.ts` provides:

```
access_control
├── id (UUID)
├── agent_id (TEXT) — who
├── resource_type (TEXT) — what kind (state, document, decision, secret)
├── resource_id (TEXT) — which specific resource, or '*' for wildcard
├── permission (TEXT) — read | write | delete | admin
├── granted_at (TEXT)
├── granted_by (TEXT) — audit trail for the grant itself
├── revoked_at (TEXT, nullable)
└── revoked_by (TEXT, nullable)
```

**What this enables:**
- Per-agent, per-resource permission grants (RBAC model from security-review §3.3)
- Wildcard admin grants (`resource_id = '*'`)
- Revocation with audit trail
- Query: `hasPermission(agentId, resourceType, resourceId, permission)`

**What this doesn't solve:**
- Enforcement is application-level, not database-level — a process that bypasses the API still has full access
- No row-level security in SQLite — the ACL table is advisory, enforced by the application middleware
- The daemon API (STATE-038) must check ACL before every mutation — this middleware doesn't exist yet

### 1.4 Recommendations

| Priority | Action | Rationale |
|---|---|---|
| **P0** | Set `.cache/index.db` permissions to `0o600` on creation | Secrets in agent_tokens/encrypted_configs are only as safe as the DB file |
| **P0** | Add auth middleware to RoadmapServer that checks access_control table | Without this, the ACL table is documentation, not enforcement |
| **P1** | Migrate file-level `0o600` secrets (identity.json, .vault-key) into encrypted_configs table | Eliminate dual-path secret storage during migration |
| **P2** | Consider SQLCipher for DB-level encryption at rest | Defense-in-depth for multi-host scenarios (STATE-046) |

---

## 2. Audit Trail: Git Log → Event Table

### 2.1 Current Audit Capabilities

| Source | What It Records | Queryable | Tamper-Evident | Granularity |
|---|---|---|---|---|
| **Git log** | File-level diffs, author, timestamp | `git log`, blame | Yes (SHA chain) | Per-file |
| **group-pulse.md** | Agent messages, self-declared sender | Linear scan | No | Per-message |
| **No HTTP audit** | Nothing | N/A | N/A | N/A |

**Gap from security-review §8.1:** "The daemon becomes a single point of failure — compromise it, and you control the roadmap." The daemon currently has **zero audit logging** for API actions.

### 2.2 Proposed Audit Events Table

The `audit_events` table (implemented in `src/core/db-security.ts`):

```
audit_events
├── id (UUID)
├── timestamp (TEXT, ISO 8601)
├── agent_id (TEXT) — who performed the action
├── action (TEXT) — what happened (state_update, claim, release, etc.)
├── resource_type (TEXT) — state | document | decision | secret | config
├── resource_id (TEXT) — which resource
├── before_hash (TEXT, nullable) — SHA-256 of content before change
├── after_hash (TEXT, nullable) — SHA-256 of content after change
├── source (TEXT) — file | database | migration — tracks provenance during dual-write
├── key_version (TEXT) — which agent key version was used
└── created_at (TEXT)
```

### 2.3 Audit Trail Comparison

| Capability | Git Log | audit_events Table | Winner |
|---|---|---|---|
| **Immutability** | SHA chain, force-push possible | SQL DELETE possible | Git |
| **Query performance** | Slow (spawn process) | Fast (indexed SQL) | DB |
| **Agent attribution** | Commit author (forgeable) | Authenticated agent_id | DB (with auth) |
| **Before/after content** | Full diff | Hash only | Git |
| **Granularity** | File-level | Field-level | DB |
| **API action coverage** | None (file-only) | All mutations | DB |
| **Corruption detection** | `git fsck` | Manual verification | Git |

### 2.4 Dual-Write Audit Strategy

During migration (Phase 1-3), both systems must record events:

```
Mutation Request
    │
    ├── 1. Validate agent identity (STATE-51 auth)
    │
    ├── 2. Compute before_hash (SHA-256 of current content)
    │
    ├── 3. Execute mutation
    │
    ├── 4. Compute after_hash
    │
    ├── 5. Write audit_events row
    │     └── source = 'database'
    │
    └── 6. Git commit (async, batched)
          └── Source = 'file' in audit trail
```

**Integrity concern:** The audit_events table is in the same SQLite database it's auditing. A compromised process can modify audit records. Mitigation:

- **Flush audit events to append-only JSONL** (`audit.jsonl` with `0o644`) as a secondary log
- **Cross-reference:** Periodic verification that audit_events rows match git log entries
- **Hash chain:** Each audit event includes `before_hash` and `after_hash`, creating a content-addressed chain within the table

### 2.5 Recommendations

| Priority | Action | Rationale |
|---|---|---|
| **P0** | Add audit middleware to RoadmapServer for ALL mutating endpoints | Currently zero API audit coverage |
| **P0** | Log before_hash and after_hash on every state mutation | Enables data integrity verification |
| **P1** | Implement audit_events → audit.jsonl flush on each write | Secondary tamper-evidence layer |
| **P1** | Build verification script that cross-checks audit_events vs git log | Detect divergence during dual-write |
| **P2** | Add hash chain (each event references previous event hash) | Cryptographic tamper evidence for DB audit trail |

---

## 3. Data Integrity During Migration

### 3.1 Integrity Risks by Phase

| Phase | Authoritative Source | Risk | Detection |
|---|---|---|---|
| **Phase 1** (Current) | Files (.md) | SQLite diverges from files | integrity_checks table |
| **Phase 2** (Dual-write) | Files + DB | Write to one fails, other succeeds | Transaction coordination |
| **Phase 3** (Read flip) | Postgres | SQLite cache stale | TTL + invalidation |
| **Phase 4** (Cutover) | Postgres | .md projection lags | Projection checksum |

### 3.2 Integrity Verification Implementation

The `DataIntegrity` class (src/core/db-security.ts) provides:

```typescript
// Per-resource integrity check
recordCheck(resourceType, resourceId, fileContent, dbContent)
  → Computes SHA-256 of both
  → Stores file_hash, db_hash, match boolean
  → Returns DataIntegrityCheck

// Batch verification
verifyAll(states[])
  → Returns { verified, mismatched, missing }
  → Missing = resource exists in file but not DB (or vice versa)

// Mismatch reporting
getMismatches()
  → Returns all resources where file_hash ≠ db_hash
```

### 3.3 Conflict Resolution Security

The migration strategy (§2.4) defines conflict resolution rules. Security implications:

| Scenario | Strategy Says | Security Concern |
|---|---|---|
| File newer than DB | Write file → DB | Attacker modifies file, DB blindly accepts |
| DB newer than file | Write DB → file (Phase 3+) | Compromised DB overwrites legitimate file |
| Both modified | Human review | Race condition window for attacker |

**Recommendation:** Before applying any conflict resolution, verify the **agent identity** of the most recent mutation in both systems. If the agent IDs disagree, escalate regardless of timestamp.

### 3.4 Rollback Safety

The migration strategy defines rollback triggers (§3.1). Security-specific additions:

| Trigger | Current Action | Security Addition |
|---|---|---|
| Postgres failure > 10% | Auto-disable writes | **Also:** Freeze agent_tokens, reject new auth |
| Data corruption detected | Stop all writes | **Also:** Quarantine last 10 agents that wrote |
| Dual-write desync > 100 | Pause migration | **Also:** Run full integrity_check, audit trail review |
| Manual rollback | Immediate disable | **Also:** Snapshot DB before rollback for forensics |

### 3.5 Rollback Data Integrity

**Problem:** Rolling back from Phase 3 (Postgres reads) to Phase 1 (file reads) requires ensuring files are current.

**Current rollback procedure** (migration strategy §3.2):
```
1. Disable Postgres writes
2. Verify SQLite is current
3. Drain retry queue
4. Log rollback event
5. Notify operators
```

**Missing security steps:**
```
6. Snapshot current DB state (for forensics)
7. Revoke all active agent tokens (force re-authentication)
8. Run full integrity check (file hash vs SQLite hash)
9. Review audit_events for anomalous activity during the failure window
10. Reset key versions if compromise suspected (STATE-51 key rotation)
```

### 3.6 Recommendations

| Priority | Action | Rationale |
|---|---|---|
| **P0** | Run integrity check after EVERY dual-write batch | Catch divergence immediately, not at cutover |
| **P0** | Add agent identity verification to conflict resolution | Prevent attacker-modified files from winning conflicts |
| **P1** | Snapshot DB before rollback | Preserve forensic evidence |
| **P1** | Force token re-authentication on rollback | Invalidate any tokens issued during compromised period |
| **P2** | Build automated integrity regression suite | Run `verifyAll()` in CI to catch migration bugs |

---

## 4. Secret/Credential Handling Changes

### 4.1 Current Secret Locations

| Location | Format | Protection | Risk |
|---|---|---|---|
| `.roadmap/auth/identity.json` | PEM keys | `0o600` | Private key on disk |
| `.roadmap/auth/.vault-key` | Hex string | `0o600` | Encryption key on disk |
| `.roadmap/auth/vault.enc` | AES-256-GCM | Encrypted | Depends on .vault-key |
| Environment variables | Plaintext | Process-level | Leaked via /proc |
| State file content | Markdown | None | Agent writes secret into body |

### 4.2 DB Secret Handling

The `agent_tokens` and `encrypted_configs` tables enforce:

- **Token hashes only:** `storeToken(agentId, tokenHash, expiresAt, keyVersion)` — the API accepts a hash, not a plaintext token. Callers must hash before calling.
- **Encrypted configs:** `encrypted_configs` stores AES-256-GCM ciphertext with IV and auth tag.
- **No plaintext in DB:** Verified by test: `CRITICAL: should never store plaintext tokens`

### 4.3 Migration Concern: Dual-Path Secrets

During migration, secrets exist in **both** file and DB:

```
identity.json (file, 0o600) ←── same key ──→ agent_tokens table (DB, hash only)
.vault-key (file, 0o600)    ←── same key ──→ encrypted_configs table (DB, encrypted)
```

**Risk:** If the DB file has weaker permissions than the secret files, the migration **downgrades** secret protection.

**Mitigation:**
1. Set `.cache/index.db` to `0o600` on creation
2. Migrate secrets into DB and delete file copies (eliminate dual-path)
3. Until migration complete, treat file secrets as authoritative

### 4.4 Recommendations

| Priority | Action | Rationale |
|---|---|---|
| **P0** | Set DB file permissions to 0o600 | Prevent permission downgrade during migration |
| **P1** | Single-path secret storage after Phase 2 | Eliminate dual-path risk |
| **P1** | Secrets scanner runs on DB content (not just files) | `secrets-scanner.ts` must scan DB rows too |
| **P2** | Consider HSM or OS keychain for master keys | .vault-key on disk is weakest link |

---

## 5. Cross-Reference: Unresolved Items from 2026-03-22 Review

The prior security review identified 12 items. Status against migration:

| # | Item (2026-03-22) | Status | Migration Impact |
|---|---|---|---|
| 1 | Implement STATE-044 with security ACs | ⚠️ Partial | Rate limiting must apply to DB writes too |
| 2 | Add secrets scanning to pre-commit | ✅ Done | Must extend to DB content scanning |
| 3 | Enforce assignee-based write authorization | ❌ **Unresolved** | ACL table exists but no API middleware |
| 4 | Fix STATE-031 push notification audit | ⚠️ Unknown | audit_events table covers this gap |
| 5 | Design agent authentication protocol | ✅ **Done** (STATE-51) | Token store bridges auth to DB |
| 6 | Add message signing (Ed25519) | ❌ **Unresolved** | audit_events uses hashes, not signatures |
| 7 | Implement State ID registry | ⚠️ Partial | ID collision still possible during dual-write |
| 8 | Add audit logging for state transitions | ✅ **Done** (this review) | audit_events table implemented |
| 9 | PKI infrastructure (P2) | ❌ **Not started** | Blocks Phase 4 multi-host |
| 10 | Host authentication for federation (P2) | ❌ **Not started** | Blocks Phase 4 multi-host |
| 11 | Network encryption for HTTP/WebSocket (P2) | ❌ **Not started** | Blocks Phase 4 multi-host |
| 12 | State file encryption at rest (P2) | ❌ **Not started** | encrypted_configs covers config only |

**Critical path:** Items #3 (auth middleware) and #6 (message signing) must be resolved before Phase 2 dual-write, or the migration introduces a weaker security posture than the current file model.

---

## 6. Implementation Artifacts

The following files implement the security layer reviewed here:

| File | Purpose | Tests |
|---|---|---|
| `src/core/auth.ts` | Agent identity (Ed25519), token issuance, verification, key rotation | 25/25 PASS |
| `src/core/db-security.ts` | AuditTrail, AccessControl, DataIntegrity, AgentTokenStore, security schema | 24/24 PASS |
| `src/core/secrets-scanner.ts` | Encrypted vault, secret scanning, pre-commit hooks | Exists (STATE-52) |
| `src/test/auth.test.ts` | Auth protocol tests | 25/25 |
| `src/test/db-security.test.ts` | DB security layer tests | 24/24 |
| `src/test/secrets-scanner.test.ts` | Vault and scanner tests | Exists |

**Total: 49/49 security tests passing.**

---

## 7. Summary

| Area | Readiness | Blockers |
|---|---|---|
| **Access control** | 🟡 Schema ready, enforcement missing | API middleware must check ACL table |
| **Audit trail** | 🟢 Table implemented, dual-write designed | API middleware must log all mutations |
| **Data integrity** | 🟢 Verification tools built | Must run after every batch, not just at cutover |
| **Secret handling** | 🟡 Hash-only tokens, encrypted configs | DB file needs 0o600; eliminate dual-path |
| **Rollback** | 🟡 Procedure exists | Missing: snapshot, token revocation, integrity check |

**Bottom line:** The security infrastructure for migration exists and is tested. The gap is **enforcement** — the ACL table, audit trail, and integrity checks are built but not wired into the server middleware. Until `RoadmapServer` checks `access_control` and logs to `audit_events` on every request, the migration security layer is a skeleton without muscles.

**Recommended next steps:**
1. Wire `AccessControl` + `AuditTrail` into `RoadmapServer.dispatchRequest()` (1-2 days)
2. Set `.cache/index.db` to `0o600` (5 minutes)
3. Run `DataIntegrity.verifyAll()` as a nightly cron during dual-write (1 day)
4. Close P0 items #3 and #6 from the 2026-03-22 review before Phase 2

---

*Review complete. Implementation artifacts committed to pool/engineering.*
