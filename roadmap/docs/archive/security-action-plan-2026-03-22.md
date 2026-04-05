# Security Action Plan — 2026-03-22

**Authors:** Security Engineer, Alex (Product Manager), Software Architect  
**Date:** 2026-03-22  
**Purpose:** Joint prioritization of security concerns → concrete states to build  
**Prerequisite documents:** Roadmap Reflection 2026-03-22, Security Review 2026-03-22

---

## Purpose

The roadmap is scaling to 276 agents. The security review identified 12 concrete risks across authentication, authorization, rate limiting, data protection, and multi-host communication. This document maps each risk to a specific state (existing or proposed), prioritizes by severity, and defines the dependency chain so work can start immediately.

**Consensus reached:** Security is not a separate workstream — it's a prerequisite layer that must be built *under* the existing roadmap states. Several existing states (STATE-044, STATE-049, STATE-046) need security ACs added before implementation. New states are needed for the gaps that no existing state covers.

---

## 1. Security Concern → State Mapping

### 1.1 Existing States That Need Security Enhancements

These states already exist in the roadmap but have incomplete or missing security requirements.

| State | Current ACs | Security Gap | Required Enhancement |
|-------|-------------|--------------|---------------------|
| **STATE-044** (Rate Limiting) | AC#1-5 | No server-side enforcement, priority boost is abusable, no bypass detection | Add AC#6-9 (see §3.1) |
| **STATE-049** (Inter-Agent Communication) | AC#1-4 | No authentication, no message signing, no sanitization, no rate limit on messages | Add AC#5-8 (see §3.2) |
| **STATE-046** (Multi-Host Federation) | AC#1-4 | No TLS, no host auth, no encryption, no join approval, no quarantine | Add AC#5-11 (see §3.3) |
| **STATE-031** (Push Messaging) | Audit failed | Push notification delivery not implemented; undermines STATE-049 security model | Fix audit failures before STATE-049 (see §3.4) |
| **STATE-038** (Daemon API) | Core API surface | No auth middleware, no rate limiting middleware, no input validation | Add security middleware layer (see §3.5) |

### 1.2 New States Required

These security capabilities don't map to any existing state. They must be created.

| Proposed State | Covers | Depends On | Blocks |
|----------------|--------|------------|--------|
| **STATE-051: Agent Identity & Authentication Protocol** | Agent-to-agent auth, token issuance, identity verification | STATE-005 (Agent Registry), STATE-038 (Daemon API) | STATE-049 security, STATE-046 security, STATE-052 |
| **STATE-052: Secrets Management & Scanning** | API key protection, pre-commit scanning, key rotation | STATE-051 (agent identity for key ownership) | All states handling secrets |
| **STATE-053: Audit Logging & Forensic Trail** | State transitions, auth events, rate limit violations, message delivery | STATE-038 (Daemon API) | Incident response, compliance |
| **STATE-054: Authorization & Access Control** | RBAC middleware, assignee enforcement, phase-gate validation | STATE-038 (Daemon API), STATE-051 (identity) | STATE-044 enforcement, STATE-046 federation |
| **STATE-055: State ID Registry** | Mechanical ID allocation, collision prevention | STATE-008 (File Locking), STATE-038 (Daemon API) | 276-agent coordination |
| **STATE-056: Federation PKI & Host Authentication** | Certificate authority, mTLS, host registry, cert rotation | STATE-051 (identity infrastructure), STATE-038 | STATE-046 (Multi-Host) |
| **STATE-057: Frontmatter Checksum & Recovery** | Corruption detection, atomic writes, recovery protocol | STATE-038 (Daemon API) | Data integrity at scale |

---

## 2. Risk Prioritization Matrix

All security concerns ranked by **severity × likelihood at 276-agent scale**.

### 🔴 CRITICAL — Implement Before Any New Feature Work

| Rank | Concern | Current State | Impact if Exploited | Likelihood | Proposes State |
|------|---------|---------------|--------------------|------------|---------------|
| **C-1** | **No rate limiting** | STATE-044 exists but Medium priority, no security ACs | System DoS, 275 agents idle | **Very High** — 276 agents, no throttle | **STATE-044** (enhance) |
| **C-2** | **No agent authentication** | Nothing exists | Impersonation, message spoofing, state poisoning | **Very High** — any process claims any ID | **STATE-051** (new) |
| **C-3** | **No write authorization** | STATE-037 removed gates; `assignee` is advisory | Any agent modifies any state, supply chain attack | **High** — filesystem access is shared | **STATE-054** (new) |
| **C-4** | **STATE-046 without security** | 4 ACs, none security-related | MITM, eavesdropping, rogue host join, full state exposure | **High** — STATE-046 opens network surface | **STATE-056** (new) + enhance STATE-046 |

### 🟡 HIGH — Implement Before Next Milestone Expansion

| Rank | Concern | Current State | Impact if Exploited | Likelihood | Proposes State |
|------|---------|---------------|--------------------|------------|---------------|
| **H-1** | **No message authentication** | group-pulse.md is unauthenticated | Message spoofing, workflow bypass, social engineering | **High** — 276 agents writing messages | **STATE-049** (enhance) + STATE-051 |
| **H-2** | **No secrets protection** | Nothing exists | API key exfiltration, credential compromise | **Medium** — accidental leaks likely at scale | **STATE-052** (new) |
| **H-3** | **State ID collisions** | No registry, convention-based numbering | Silent data corruption, state overwrites | **Very High** — 276 agents, near-certain within days | **STATE-055** (new) |
| **H-4** | **No audit trail** | activity_log exists but not enforced | No forensic capability, no compliance | **High** — incidents will happen, can't investigate | **STATE-053** (new) |
| **H-5** | **STATE-031 audit failures** | Push delivery not implemented | STATE-049 depends on broken foundation | **Medium** — blocks dependent states | **STATE-031** (fix) |

### 🟢 MEDIUM — Implement This Quarter

| Rank | Concern | Current State | Impact if Exploited | Likelihood | Proposes State |
|------|---------|---------------|--------------------|------------|---------------|
| **M-1** | **No state file recovery** | No backup, no journal, no checksum | Corrupted state files crash `roadmap map audit` | **Medium** — crash mid-write at scale | **STATE-057** (new) |
| **M-2** | **No encryption at rest** | State files are plaintext | Data exposure on non-trusted hosts (STATE-046) | **Low** (single-host) / **High** (multi-host) | **STATE-056** (covers) |
| **M-3** | **No key rotation** | No mechanism exists | Stale credentials remain valid indefinitely | **Low** — until an incident occurs | **STATE-052** (covers) |

---

## 3. Detailed State Specifications

### 3.1 STATE-044: Per-Agent Rate Limiting & Fair Share (Enhance)

**Current ACs:** AC#1 (configurable claim limit), AC#2 (queue system), AC#3 (priority boost bypass), AC#4 (status visibility), AC#5 (global policy)

**Add these security ACs:**

- **AC#6:** Rate limit enforcement is server-side in the daemon middleware. Client-reported rate limits are advisory only. The daemon rejects requests that exceed the agent's configured limit with HTTP 429 and a `Retry-After` header.
- **AC#7:** Priority boost for critical states requires either (a) human reviewer approval via an `admin_override` token, or (b) consensus from ≥3 other agents confirming the state is truly critical. Self-declared priority does not bypass limits.
- **AC#8:** Rate limit violations are logged to the audit trail (STATE-053). After 5 violations within a 1-hour window, the agent is automatically suspended — all further claims and writes are rejected until an admin clears the suspension.
- **AC#9:** Rate limit policy configuration changes require the `admin` role and are themselves rate-limited (max 1 policy change per hour). All changes are logged with before/after values.

**Dependencies:** STATE-038 (Daemon API), STATE-051 (identity — to know *which* agent is making requests)

**Security priority: 🔴 CRITICAL — P0**

---

### 3.2 STATE-049: Inter-Agent Communication Protocol (Enhance)

**Current ACs:** AC#1 (send to channels), AC#2 (persist in markdown), AC#3 (mention notifications), AC#4 (threading)

**Add these security ACs:**

- **AC#5:** Every message includes a cryptographic signature (Ed25519) derived from the sender's private key. The daemon verifies signatures on message read and rejects unsigned or invalid messages. Signature metadata is stored alongside the message but separated from human-readable content.
- **AC#6:** Message content is sanitized before persistence. Messages containing patterns matching API keys (`sk-`, `api_key=`, `token=`, `ghp_`), executable content (`<script>`, `#!/`), or YAML-injection sequences (`---\n`, `]: `) are rejected with an error to the sender.
- **AC#7:** Per-agent message rate limit: maximum 50 messages per hour per agent, separate from state claim rate limits (STATE-044). The message rate limit is enforced server-side and does not apply to system-generated messages (audit results, state transitions).
- **AC#8:** Message history is append-only with a cryptographic hash chain. Each message includes the hash of the previous message, creating a tamper-evident log. The daemon validates the chain on every write and alerts on breaks.

**Dependencies:** STATE-051 (identity — for key pairs and verification), STATE-031 (push notifications — must be fixed first)

**Security priority: 🟡 HIGH — P1**

---

### 3.3 STATE-046: Multi-Host Federation (Enhance)

**Current ACs:** AC#1 (HTTP/WebSocket API), AC#2 (state change propagation), AC#3 (conflict resolution), AC#4 (connection recovery)

**Add these security ACs:**

- **AC#5:** All inter-host communication uses mutual TLS (mTLS). The federation operates its own private certificate authority (CA). Each host presents a client certificate signed by the federation CA, and verifies the peer's certificate against the same CA. Plaintext connections are rejected.
- **AC#6:** Host identity is verified against a daemon-mediated host registry. A host cannot join the federation by simply connecting — it must present a registration token signed by the federation CA. New host registrations require human administrator approval.
- **AC#7:** State changes propagated across hosts include a digital signature from the originating host. Recipients verify the signature before applying the change. Invalid signatures trigger quarantine of the sending host.
- **AC#8:** Network partition detection: if a host cannot communicate with the federation coordinator for 30 seconds, it enters read-only mode automatically. It rejects local writes until connectivity is restored. This prevents split-brain where two hosts make conflicting edits.
- **AC#9:** Federation membership requires a human administrator to approve each host. An `approved_hosts` list is maintained in daemon configuration. Hosts not on the list are logged and rejected.
- **AC#10:** All inter-host messages are logged to an immutable audit trail on both the sender and receiver. Logs include timestamp, source host, destination host, message type, and result (accepted/rejected).
- **AC#11:** Hosts that exceed error thresholds (10 failed signature verifications, 5 connection timeouts, or 3 authorization failures within 1 hour) are automatically quarantined. Quarantined hosts are removed from the `approved_hosts` list and require manual re-approval.

**Pre-implementation prerequisites (must be built before STATE-046):**
- STATE-051 (Agent Identity — establishes the cryptographic infrastructure)
- STATE-056 (Federation PKI — certificate authority and host registry)

**Security priority: 🔴 CRITICAL — P3 (but prerequisites are P1)**

---

### 3.4 STATE-031: Push Messaging (Fix Audit Failures)

**Current status:** Audit found that push notification delivery is not implemented. Subscriptions exist but don't actually deliver messages.

**Required fixes:**
- Implement SSE event delivery to subscribed agents
- Add delivery confirmation (agent acknowledges receipt)
- Add retry logic with exponential backoff for failed deliveries
- Log all delivery attempts to the audit trail (STATE-053)

**Why this is security-relevant:** STATE-049's security model depends on reliable notification delivery. If an agent doesn't receive a message notification, it can't verify the message signature or detect tampering. Unreliable delivery creates a window where message loss is indistinguishable from message suppression.

**Dependencies:** STATE-038 (Daemon API), STATE-019 (Daemon Mode)

**Security priority: 🟡 HIGH — P1 (blocks STATE-049)**

---

### 3.5 STATE-038: Daemon API (Security Middleware Layer)

**Current scope:** Core API surface for agent interaction with the roadmap.

**Required security middleware (add to existing scope):**

1. **Authentication middleware** — Validate bearer tokens (from STATE-051) on every request except health checks
2. **Rate limiting middleware** — Enforce STATE-044 limits at the API gateway level
3. **Authorization middleware** — Check RBAC permissions (from STATE-054) before allowing state mutations
4. **Input validation middleware** — Sanitize all request bodies, frontmatter, and message content
5. **Audit middleware** — Log all API calls to the audit trail (STATE-053)
6. **CORS configuration** — Restrict cross-origin requests to known host origins (STATE-046)

**Dependencies:** STATE-051 (tokens to validate), STATE-044 (limits to enforce)

**Security priority: 🔴 CRITICAL — P0 (middleware must exist before STATE-044/49/46 are built)**

---

## 4. New State Definitions

### 4.1 STATE-051: Agent Identity & Authentication Protocol

```
id: STATE-051
title: Agent Identity & Authentication Protocol
status: Potential
dependencies: [STATE-005, STATE-038]
milestone: m-0
```

**Description:** Establishes cryptographic identity for every agent. Each agent receives an Ed25519 key pair and a unique API token (JWT) signed by the daemon. The token is used for all authenticated API requests. Key pairs are used for message signing (STATE-049) and host certificates (STATE-056).

**Acceptance Criteria:**
- **AC#1:** Each agent registered in STATE-005 (Agent Registry) is automatically issued a unique Ed25519 key pair and a JWT bearer token.
- **AC#2:** The JWT includes the agent ID, issue time, expiry (24h), and scope (read, write, claim, admin). The daemon validates JWTs on every request.
- **AC#3:** Agent key pairs are stored encrypted at rest. The private key is only decrypted in memory during signing operations.
- **AC#4:** Token refresh requires proof of possession — the agent must sign a nonce with its private key to obtain a new JWT.
- **AC#5:** Key revocation is supported: an admin can revoke any agent's token, causing all subsequent requests to be rejected with HTTP 401.
- **AC#6:** Key rotation: agents can request key rotation every 30 days. Old keys are valid for a 7-day grace period after rotation.
- **AC#7:** The identity service is bootstrapped from STATE-005's existing agent registry data. No agent loses its identity during the transition.

**Blocks:** STATE-049 (message signing), STATE-054 (authorization), STATE-056 (federation PKI), STATE-052 (secrets management)

---

### 4.2 STATE-052: Secrets Management & Scanning

```
id: STATE-052
title: Secrets Management & Scanning
status: Potential
dependencies: [STATE-051]
milestone: m-0
```

**Description:** Prevents API keys, tokens, and other secrets from being committed to the roadmap repository or written into state files and messages.

**Acceptance Criteria:**
- **AC#1:** `gitleaks` (or equivalent) is configured as a pre-commit hook. Commits containing patterns matching common API key formats (`sk-*`, `ghp_*`, `xoxb-*`, `AKIA*`, etc.) are blocked with an error message.
- **AC#2:** A `secrets-scanner` CI job runs on every push and fails the build if secrets are detected. Existing secrets in git history are identified and reported.
- **AC#3:** State file content and message content are scanned for secrets patterns before persistence. Messages or state bodies containing secrets are rejected with a warning to the sender.
- **AC#4:** API keys required by the daemon (for LLM providers, external services) are stored in an encrypted vault, not in plaintext `.env` files. The vault is unlocked at daemon startup with a master key.
- **AC#5:** Key rotation procedure is documented and tested. The daemon supports rotating provider API keys without downtime — old keys remain valid during the grace period.
- **AC#6:** Agents are warned (via STATE-049 message) if they attempt to include credentials in any message or state file, with guidance on using the secure vault instead.

**Blocks:** All states that handle secrets

---

### 4.3 STATE-053: Audit Logging & Forensic Trail

```
id: STATE-053
title: Audit Logging & Forensic Trail
status: Potential
dependencies: [STATE-038]
milestone: m-0
```

**Description:** An immutable, append-only audit log that records every security-relevant event in the system. Enables incident investigation, compliance reporting, and anomaly detection.

**Acceptance Criteria:**
- **AC#1:** Every state transition (claim, start, complete, revert) is logged with: timestamp, agent ID, state ID, action, and result (success/failure).
- **AC#2:** Every authentication event is logged: token issuance, token validation, token revocation, failed authentication attempts.
- **AC#3:** Every rate limit event is logged: limit check, bypass attempt, violation, suspension trigger.
- **AC#4:** Every inter-host message (STATE-046) is logged on both sender and receiver with: timestamp, source, destination, message type, signature verification result.
- **AC#5:** Audit logs are append-only — no agent (including admin) can modify or delete entries. Enforcement via file permissions and hash chain validation.
- **AC#6:** Audit logs are retained for 90 days. Older logs are archived to compressed storage but remain queryable.
- **AC#7:** A `roadmap audit query` CLI command supports filtering by agent, state, time range, and event type. Output is human-readable and machine-parseable (JSON).
- **AC#8:** Anomaly detection: the daemon alerts (via STATE-049 channel) when it detects unusual patterns: >100 state claims/hour from one agent, >10 failed authentications in 5 minutes, or hash chain breaks in the audit log.

**Blocks:** STATE-044 (rate limit logging), STATE-046 (inter-host logging), incident response capability

---

### 4.4 STATE-054: Authorization & Access Control

```
id: STATE-054
title: Authorization & Access Control
status: Potential
dependencies: [STATE-038, STATE-051]
milestone: m-0
```

**Description:** Role-based access control (RBAC) enforced at the daemon API level. Replaces the current advisory `assignee` model with mechanical enforcement.

**Acceptance Criteria:**
- **AC#1:** Three roles are defined: `agent` (standard), `reviewer` (can approve phases), `admin` (full access). Roles are stored in the agent registry (STATE-005) and included in JWT claims (STATE-051).
- **AC#2:** The daemon enforces that only the assigned agent (or an admin) can modify a state file's frontmatter or content. Unauthorized writes return HTTP 403.
- **AC#3:** Phase transitions (STATE-050 workflow) require the agent to hold the role assigned to that phase. Only `reviewer` or `admin` roles can execute the REVIEW phase. Only `admin` can execute CERTIFY.
- **AC#4:** State deletion is restricted to `admin` role. All other agents receive HTTP 403 on delete attempts.
- **AC#5:** The `priority boost` bypass in STATE-044 requires `admin` role OR multi-agent consensus (≥3 `reviewer`-role agents co-signing the request).
- **AC#6:** Access control violations are logged to the audit trail (STATE-053) and trigger an alert to the `admin` channel after 3 violations from the same agent.
- **AC#7:** An `access-control` configuration file defines per-role permissions and can be updated by `admin` without daemon restart.

**Blocks:** STATE-044 (enforcement), STATE-046 (federation authorization)

---

### 4.5 STATE-055: State ID Registry

```
id: STATE-055
title: State ID Registry
status: Potential
dependencies: [STATE-008, STATE-038]
milestone: m-0
```

**Description:** Mechanically enforced state ID allocation to prevent ID collisions when 276 agents create states concurrently.

**Acceptance Criteria:**
- **AC#1:** State IDs are allocated by the daemon, not by convention. When an agent requests a new state, the daemon assigns the next available ID atomically.
- **AC#2:** The registry maintains a monotonically increasing counter stored with file locking (STATE-008) until the daemon (STATE-038) is stable. After STATE-038, the counter moves to SQLite with a UNIQUE constraint.
- **AC#3:** The registry validates that proposed state IDs don't collide with existing states. If a collision is detected, the agent is assigned the next available ID and notified.
- **AC#4:** State IDs can be reserved by an agent for a short window (1 hour) to prevent races during state creation. Reservations expire automatically.
- **AC#5:** A `roadmap state next-id` CLI command returns the next available ID without consuming it, for agents that need to pre-check.
- **AC#6:** The registry is queryable: `roadmap state list-ids` shows all allocated and reserved IDs. This is also exposed as an API endpoint for daemon mode.

**Blocks:** Prevents data corruption at 276-agent scale

---

### 4.6 STATE-056: Federation PKI & Host Authentication

```
id: STATE-056
title: Federation PKI & Host Authentication
status: Potential
priority: medium
dependencies: [STATE-051, STATE-038]
milestone: m-7
```

**Description:** Certificate authority and host identity infrastructure required before STATE-046 (Multi-Host Federation) can be implemented securely.

**Acceptance Criteria:**
- **AC#1:** A private certificate authority (CA) is created for the federation. The CA certificate is stored encrypted and is used to sign all host certificates.
- **AC#2:** Each host in the federation receives a unique X.509 certificate signed by the federation CA. The certificate includes the host's identity (hostname, IP range) and is valid for 1 year.
- **AC#3:** A `approved_hosts` registry is maintained by the daemon. Hosts not in the registry are rejected during the TLS handshake (connection refused before application-layer processing).
- **AC#4:** Host certificate renewal is automated: the daemon monitors certificate expiry and initiates renewal 30 days before expiry. Old certificates remain valid during a 7-day grace period.
- **AC#5:** Compromised host certificates can be revoked via a Certificate Revocation List (CRL) that is distributed to all federation members. Revoked certificates are rejected immediately.
- **AC#6:** The PKI supports offline CA operation: the CA root key is kept on an air-gapped machine and only brought online for signing operations. Intermediates are used for day-to-day signing.
- **AC#7:** Federation join procedure: a new host generates a CSR, the CSR is submitted to the admin, the admin signs it with the CA, and the signed certificate is returned. No host can join without this ceremony.

**Blocks:** STATE-046 (Multi-Host Federation)

---

### 4.7 STATE-057: Frontmatter Checksum & Recovery

```
id: STATE-057
title: Frontmatter Checksum & Recovery
status: Potential
priority: medium
dependencies: [STATE-038]
milestone: m-0
```

**Description:** Detects and recovers from corrupted state files caused by concurrent writes or crash mid-write. Critical for data integrity with 276 concurrent agents.

**Acceptance Criteria:**
- **AC#1:** Every state file's frontmatter includes a `checksum` field containing a SHA-256 hash of the frontmatter content (excluding the checksum field itself). The checksum is computed by the daemon on every write.
- **AC#2:** The daemon validates the checksum on every state file read. If the checksum doesn't match, the file is flagged as corrupted and the daemon attempts recovery.
- **AC#3:** Recovery mechanism: the daemon maintains a write-ahead log (WAL) of the last 5 state file modifications. On corruption, the daemon rolls back to the most recent valid version from the WAL.
- **AC#4:** All state file writes go through atomic rename: write to `.state-XX.md.tmp`, validate the temp file, then rename to `.state-XX.md`. This eliminates partial-write corruption.
- **AC#5:** Corrupted files that cannot be recovered are moved to `roadmap/recovery/corrupted/` and a new clean file is created with a `RECOVERED` status note. The original content is preserved for manual inspection.
- **AC#6:** A `roadmap state validate` CLI command scans all state files, checks checksums, and reports any corruption. This can be run as a cron job or heartbeat task.

**Blocks:** Data integrity for all concurrent operations

---

## 5. Implementation Timeline

### Phase 0: Immediate (This Week)

| Action | State | Owner | Effort |
|--------|-------|-------|--------|
| Add security ACs to STATE-044 | STATE-044 (enhance) | Engineering | 2 hours (edit) |
| Add security ACs to STATE-049 | STATE-049 (enhance) | Engineering | 2 hours (edit) |
| Add security ACs to STATE-046 | STATE-046 (enhance) | Engineering | 2 hours (edit) |
| Fix STATE-031 audit failures | STATE-031 (fix) | Engineering | 1 day |
| Create STATE-051 (Agent Identity) | STATE-051 (new) | Engineering | 3-5 days |
| Create STATE-055 (State ID Registry) | STATE-055 (new) | Engineering | 1-2 days |

**Rationale:** STATE-051 and STATE-055 are foundational — everything else depends on them. The AC edits are zero-cost documentation changes that prevent states from being built without security.

### Phase 1: Foundation (Next Sprint)

| Action | State | Owner | Effort |
|--------|-------|-------|--------|
| Implement STATE-051 (Agent Identity) | STATE-051 | Engineering | 3-5 days |
| Implement STATE-055 (State ID Registry) | STATE-055 | Engineering | 1-2 days |
| Implement STATE-044 with security ACs | STATE-044 | Engineering | 2-3 days |
| Create STATE-053 (Audit Logging) | STATE-053 | Engineering | 2-3 days |
| Create STATE-054 (Authorization) | STATE-054 | Engineering | 3-5 days |
| Add security middleware to STATE-038 | STATE-038 (enhance) | Engineering | 2-3 days |

**Rationale:** These form the authentication → authorization → rate limiting → audit chain. No state should be built on the daemon API until this chain is in place.

### Phase 2: Protection (Sprint 2)

| Action | State | Owner | Effort |
|--------|-------|-------|--------|
| Implement STATE-052 (Secrets Management) | STATE-052 | Engineering | 2-3 days |
| Implement STATE-057 (Checksum & Recovery) | STATE-057 | Engineering | 1-2 days |
| Implement STATE-053 (Audit Logging) | STATE-053 | Engineering | 2-3 days |
| Implement STATE-054 (Authorization) | STATE-054 | Engineering | 3-5 days |
| Verify STATE-044 security ACs in testing | STATE-044 | QA | 1 day |

**Rationale:** Secrets scanning and authorization complete the protection layer. Checksum/recovery ensures data integrity.

### Phase 3: Federation Readiness (Sprint 3)

| Action | State | Owner | Effort |
|--------|-------|-------|--------|
| Create STATE-056 (Federation PKI) | STATE-056 (new) | Engineering | 1 week |
| Implement STATE-056 (Federation PKI) | STATE-056 | Engineering | 1 week |
| Implement STATE-049 with security ACs | STATE-049 | Engineering | 3-5 days |
| Verify STATE-031 push notification fix | STATE-031 | QA | 1 day |

**Rationale:** STATE-046 (Multi-Host Federation) cannot begin until STATE-056 (PKI) and STATE-049 (secure messaging) are complete. This phase prepares the ground.

### Phase 4: Multi-Host (Quarter 2)

| Action | State | Owner | Effort |
|--------|-------|-------|--------|
| Implement STATE-046 with all security ACs | STATE-046 | Engineering | 2-3 weeks |
| Penetration test of federated protocol | - | Security | 1 week |
| Document federation security operations | - | PM | 2 days |

---

## 6. Dependency Graph

```
STATE-005 (Agent Registry) ─────┐
STATE-008 (File Locking) ───────┤
                               │
STATE-038 (Daemon API) ─────────┼──────────────────────────────────────────────┐
          │                     │                                              │
          │                     ▼                                              │
          │              STATE-055 (ID Registry) ──→ prevents collisions       │
          │                     │                                              │
          │                     ▼                                              │
          │              STATE-051 (Identity) ──┬──→ STATE-054 (Authorization)  │
          │                     │              │                              │
          │                     │              ├──→ STATE-052 (Secrets)        │
          │                     │              │                              │
          │                     │              └──→ STATE-056 (PKI)            │
          │                     │                         │                   │
          │                     ▼                         ▼                   │
          │              STATE-044 (Rate Limit)      STATE-046 (Multi-Host)     │
          │                     │                                            │
          │                     ▼                                            │
          │              STATE-053 (Audit Log) ◄───────────────────────────────┘
          │                     │
          │                     ▼
          │              STATE-038 security middleware (enhanced)
          │                     │
          │                     ▼
          │              STATE-049 (Secure Messaging) ◄── STATE-031 (fix)
          │
          └──→ STATE-057 (Checksum & Recovery)
```

**Critical path:** STATE-051 → STATE-054 → STATE-044 → STATE-046  
**Fastest security win:** STATE-055 (ID Registry) — 1-2 days, immediate collision prevention  
**Highest leverage:** STATE-051 (Identity) — unblocks auth, signing, PKI, authorization

---

## 7. Consensus Decisions

The three roles (Security Engineer, Product Manager, Architect) reached agreement on the following:

### Decision S-1: Security States Are P0

**Agreement:** STATE-051, STATE-053, STATE-054, and STATE-055 are Priority 0. No feature work (STATE-040, STATE-042, STATE-047) should begin until at least STATE-051 and STATE-055 are implemented. Security is infrastructure, not a nice-to-have.

### Decision S-2: AC Edits Before Implementation

**Agreement:** The security ACs proposed for STATE-044, STATE-049, and STATE-046 must be added to those state files *before* implementation begins. States should not be built without security requirements from the start — retrofitting is more expensive.

### Decision S-3: STATE-046 Requires Prerequisites

**Agreement:** STATE-046 (Multi-Host Federation) will not be implemented until STATE-051 (Identity), STATE-056 (PKI), and STATE-049 (Secure Messaging) are complete. The architect's assessment that STATE-046 is a ~6 month horizon is accepted. Moving it forward without prerequisites would create an unacceptable attack surface.

### Decision S-4: Daemon Is Security-Critical

**Agreement:** STATE-038 (Daemon API) must be treated as a security-critical component from this point forward. All security middleware (auth, rate limiting, authorization, audit) is implemented as part of STATE-038's scope, not as separate states. The daemon is the enforcement point for all security policies.

### Decision S-5: State ID Registry Is Urgent

**Agreement:** STATE-055 (State ID Registry) is elevated from medium to high priority. At 276 agents, ID collisions are a near-certainty within days. The architect's `.next-id` counter with file locking (STATE-008) is the acceptable interim solution until the daemon-based registry is ready.

### Decision S-6: Audit Trail Before Features

**Agreement:** STATE-053 (Audit Logging) must be implemented before STATE-044 (Rate Limiting) because rate limit enforcement is meaningless without audit logging. You can't detect violations, investigate incidents, or prove compliance without an audit trail. The implementation order is: STATE-051 → STATE-055 → STATE-053 → STATE-054 → STATE-044.

---

## 8. What This Means for the Existing Roadmap

### States That Get New ACs (no schedule impact)

| State | Action |
|-------|--------|
| STATE-044 | Add AC#6-9 (security enhancements) |
| STATE-049 | Add AC#5-8 (security enhancements) |
| STATE-046 | Add AC#5-11 (security enhancements) + update description to note prerequisites |

### States That Need Security Review Before Implementation

| State | Security Concern |
|-------|-----------------|
| STATE-040 (Skill Registry) | Skill metadata could include malicious scripts; needs content sanitization |
| STATE-042 (Obstacle Pipeline) | Obstacle-to-state conversion could inject dependencies; needs validation |
| STATE-043 (DAG Health Telemetry) | Telemetry data could be spoofed; needs signed attestations |
| STATE-047 (Knowledge Base) | RAG corpus could include poisoned state summaries; needs provenance |
| STATE-048 (Regression Suite) | Test results could be forged; needs signed test attestations |

### States That Can Proceed As-Is

| State | Why Safe |
|-------|----------|
| STATE-041 (Framework Adapter) | Interface contract only, no runtime security surface |
| STATE-045 (MAP.md Projection) | Daemon-generated output, no external input |

---

## 9. Risk Acceptance

The following risks are acknowledged and accepted by all three roles:

**Risk A:** Between now and STATE-044 implementation, a rogue agent could cause DoS.  
**Acceptance:** 276 agents are already operating without rate limiting. The 2-3 day implementation window for STATE-044 is acceptable. If an incident occurs before implementation, manual intervention (disabling the rogue agent's directory permissions) is the fallback.

**Risk B:** Between now and STATE-051 implementation, agent identity is unverified.  
**Acceptance:** The filesystem permission model provides a weak but functional identity layer (process owner = agent identity). STATE-051 replaces this with cryptographic identity. The transition window is acceptable for the current trust model.

**Risk C:** STATE-046 prerequisites delay multi-host federation significantly.  
**Acceptance:** Multi-host federation is a Q2 deliverable at the earliest. The security prerequisites (STATE-051, STATE-056) take 2-3 weeks total and are justified by the risk of exposing state files to the network without authentication or encryption.

---

*Action plan agreed. All three roles are aligned on priorities and implementation order. Security states are P0.*

*Next review: 2026-03-29 — check on STATE-051 and STATE-055 implementation progress.*
