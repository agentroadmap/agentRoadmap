# Security Review — 2026-03-22

**Author:** Security Engineer  
**Date:** 2026-03-22  
**Scope:** Roadmap architecture — 276 agents, STATE-044/46/49, inter-agent communication  
**Classification:** Internal — Contains attack surface analysis and key management concerns

---

## Executive Summary

The roadmap is scaling to 276 agents with **three critical security gaps**: no agent-to-agent authentication protocol, no secrets protection layer, and no rate limiting. STATE-044 (Rate Limiting), STATE-046 (Multi-Host Federation), and STATE-049 (Inter-Agent Communication) introduce new attack surfaces that don't exist in the current single-host, shared-filesystem model. This review identifies 12 concrete risks and provides prioritized remediation.

**Overall risk rating: 🔴 HIGH** — The system currently relies on filesystem permissions and social trust. At 276 agents, that's insufficient.

---

## 1. Threat Model — Attack Vectors at Scale (276 Agents)

### 1.1 Adversary Profiles

| Adversary | Capability | Motivation | Likelihood |
|-----------|-----------|------------|------------|
| **Rogue Agent** | Compromised or misconfigured agent running in the shared environment | Resource hoarding, data exfiltration, state corruption | **High** — 276 agents means statistically several will behave badly |
| **Colluding Agents** | Two+ agents coordinating to bypass controls | Work hoarding, privilege escalation, state ID collision | **Medium** — No current mechanism prevents this |
| **External Attacker** | Access to network layer (relevant for STATE-046) | API key theft, message injection, denial of service | **Medium** — STATE-046 opens this surface |
| **Insider Threat** | Legitimate agent operator with roadmap write access | State file poisoning, dependency injection, supply chain | **Low** — but catastrophic if realized |

### 1.2 Attack Surface Map

```
┌─────────────────────────────────────────────────────┐
│                  ATTACK SURFACE                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  FILE SYSTEM LAYER                                   │
│  ├── State file writes (276 concurrent writers)     │
│  ├── MAP.md manual editing (no validation)          │
│  ├── Message files (group-pulse.md — append-only?)  │
│  └── Frontmatter YAML injection                     │
│                                                      │
│  COMMUNICATION LAYER                                 │
│  ├── group-pulse.md — unauthenticated messages?     │
│  ├── Direct mentions — spoofing agent identity      │
│  ├── SSE push notifications — STATE-031 gaps         │
│  └── Future: HTTP/WebSocket (STATE-046, STATE-049)    │
│                                                      │
│  IDENTITY LAYER                                      │
│  ├── No agent authentication protocol               │
│  ├── No agent identity verification                 │
│  ├── State ID collision (no registry)               │
│  └── Assignee field — unvalidated strings           │
│                                                      │
│  SECRETS LAYER                                       │
│  ├── API keys in environment variables              │
│  ├── API keys potentially in state file content     │
│  ├── No key rotation mechanism                      │
│  └── No secrets scanning in commits                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 1.3 Critical Attack Scenarios

**AS-1: State File Poisoning**
- An agent writes malicious content to a state file's frontmatter or body
- Other agents read and trust this content for dependency resolution, scoring, and skill discovery
- **Impact:** Supply chain attack through the roadmap itself

**AS-2: Message Injection / Spoofing**
- An agent sends a message to group-pulse.md claiming to be another agent
- Other agents act on the spoofed message (e.g., "STATE-044 is approved — proceed")
- **Impact:** Workflow bypass, unauthorized state transitions

**AS-3: Resource Starvation (DoS)**
- A misconfigured or malicious agent rapidly claims states
- Other agents are starved of work; system throughput collapses
- **Impact:** 275 agents idle, 1 agent monopolizing the DAG

**AS-4: Network-Level Attack (STATE-046)**
- Multi-host federation exposes HTTP/WebSocket endpoints
- No TLS, no authentication — agents connect freely
- **Impact:** Man-in-the-middle, full state file access from any host on the network

---

## 2. Authentication — How Do Agents Authenticate to Each Other?

### 2.1 Current State

**Answer: They don't.**

- Agents are identified by filesystem ownership and `assignee` fields in frontmatter
- There is no token, certificate, or key-based authentication
- The `agent_id` in message files is a self-declared string with no verification
- The daemon API (STATE-038) presumably requires some form of access control, but STATE-049's protocol doesn't address authentication

### 2.2 Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| **No agent identity provider** | 🔴 Critical | Any process can claim any `agent_id` |
| **No message signing** | 🔴 Critical | group-pulse.md entries are unverifiable |
| **No mTLS between hosts** | 🔴 Critical (STATE-046) | Multi-host communication is plaintext without it |
| **No token-based auth** | 🟡 High | HTTP endpoints in STATE-046/49 need bearer tokens at minimum |

### 2.3 Recommendation

- **Minimum:** Each agent gets a unique API token (JWT or opaque) registered in STATE-005 (Agent Registry)
- **Messages:** Sign all messages with agent's private key; verify on read
- **STATE-046:** Require TLS + client certificates (mTLS) for host-to-host communication
- **STATE-049:** Authentication must be specified as an AC, not an afterthought

---

## 3. Authorization — Who Can Do What?

### 3.1 Current Access Model

The system uses an implicit **trust-with-visibility** model (STATE-037):

```
Any Agent ──→ Can Read ──→ Any State File
Any Agent ──→ Can Write ──→ Assigned States
Any Agent ──→ Can Propose ──→ New States (STATE-042)
Any Agent ──→ Can Message ──→ group-pulse.md
Any Agent ──→ Can Claim ──→ Potential States (STATE-004)
```

### 3.2 Problems

**Problem 1: No Write Authorization**
- There is no mechanical enforcement of "only the assigned agent can modify STATE-044"
- Any agent with filesystem access can edit any state file
- The `assignee` field is advisory, not a gate

**Problem 2: No Read Authorization**
- All agents can read all state files, including those with sensitive metadata (resource estimates, internal notes)
- At 276 agents, this becomes a data exposure risk
- Future states may contain proprietary algorithms or business logic

**Problem 3: No Transition Authorization**
- STATE-050 defines a 6-phase workflow with gates
- But `completeState()` has had its gate code removed (architect's debt item)
- Any agent can mark any state as "Reached"

### 3.3 Recommended Access Control Model

```
┌──────────────────────────────────────────────┐
│            RBAC PERMISSION MATRIX            │
├────────────┬──────┬────────┬────────┬────────┤
│ Action     │ Self │ Peer   │ Review │ Admin  │
├────────────┼──────┼────────┼────────┼────────┤
│ Read state │  ✓   │  ✓*    │  ✓     │  ✓     │
│ Write self │  ✓   │  ✗     │  ✗     │  ✓     │
│ Claim      │  ✓   │  ✗     │  ✗     │  ✓     │
│ Approve    │  ✗   │  ✗     │  ✓     │  ✓     │
│ Transition │  ○   │  ✗     │  ✗     │  ✓     │
│ Delete     │  ✗   │  ✗     │  ✗     │  ✓     │
│ Read keys  │  ✗   │  ✗     │  ✗     │  ✓     │
├────────────┴──────┴────────┴────────┴────────┤
│ ✓ = allowed  ✗ = denied  ○ = phase-gated     │
│ * = only if state is assigned to peer         │
└──────────────────────────────────────────────┘
```

Implement as middleware in the daemon API (STATE-038) before STATE-044 and STATE-046 are built.

---

## 4. Data Protection — Is Sensitive Data Protected?

### 4.1 API Keys and Secrets

**Current state: Unprotected.**

Known locations where secrets could be exposed:

| Location | Risk | Detail |
|----------|------|--------|
| Environment variables | 🟡 Medium | `.env` files may be committed; agents have process-level access |
| State file content | 🔴 High | An agent could accidentally write an API key into a state file body |
| Message files | 🔴 High | API keys shared in group-pulse.md (e.g., "here's the test key") |
| Git history | 🔴 High | Even if deleted, keys persist in git history |
| MCP server config | 🟡 Medium | Daemon configuration may store provider API keys |

### 4.2 Structural Data Exposure

| Data | Exposed To | Risk |
|------|-----------|------|
| Agent capability profiles | All agents (STATE-006 scoring) | Reveals agent strengths/weaknesses for targeting |
| Resource estimates | All agents | Reveals internal resource constraints |
| Audit notes | All agents | May contain sensitive implementation details |
| Dependency graphs | All agents | Reveals system architecture for attack planning |

### 4.3 Required Controls

1. **Secrets scanning** — Add `gitleaks` or `trufflehog` to pre-commit hooks. Block commits containing API key patterns.
2. **Frontmatter sanitization** — Strip sensitive fields from any content visible to agents that aren't the assignee.
3. **Encryption at rest** — For STATE-046 (multi-host), state files on non-trusted hosts must be encrypted.
4. **Key rotation** — Daemon should support key rotation without downtime. Document procedure.
5. **No secrets in messages** — Add a validation rule that rejects messages containing patterns like `sk-`, `api_key=`, `token=`.

---

## 5. Rate Limiting — Current Risks Without STATE-044

STATE-044 is marked as **Medium priority** in the roadmap. From a security perspective, this should be **Critical**.

### 5.1 Current Risks (No Rate Limiting)

| Attack | Method | Impact |
|--------|--------|--------|
| **State starvation** | One agent claims all Potential states | 275 agents idle, system throughput collapses |
| **Message flooding** | One agent spams group-pulse.md with thousands of messages | Other agents can't find real messages; file grows unbounded |
| **Filesystem DoS** | Rapid state file creation/modification | Disk I/O contention; other agents' writes fail or corrupt |
| **MCP server overload** | High-frequency API requests | Server becomes unresponsive; all agents blocked |
| **Git commit spam** | Rapid commits from one agent | Repository bloating; review queues overwhelmed |

### 5.2 STATE-044 Security Gaps

Even when implemented, STATE-044 has security concerns:

- **Bypass via "priority boost" (AC#3):** An attacker could mark states as "critical" to bypass rate limits
- **Queue manipulation:** The queue system (AC#2) needs fair ordering; a fast agent could game FIFO
- **Global policy override (AC#5):** Who configures the global policy? Is the configuration itself rate-limited?

### 5.3 Security Enhancements for STATE-044

Add these ACs to STATE-044:

- **AC#6:** Rate limit status must be enforced server-side (daemon), not client-side
- **AC#7:** Priority boost requires human reviewer approval or multi-agent consensus (≥3 agents)
- **AC#8:** Rate limit bypass attempts are logged and trigger automatic agent suspension after 5 violations
- **AC#9:** Rate limit configuration changes require admin role and are logged to an audit trail

---

## 6. Multi-Host Risks — Security Implications of STATE-046

STATE-046 introduces the most significant new attack surface. Currently, all agents operate on a shared filesystem, which is a natural security boundary. Multi-host federation eliminates that boundary.

### 6.1 New Attack Vectors

```
BEFORE (Single Host):
  Agent A ──→ [Shared Filesystem] ──→ Agent B
  (Both on same machine, same OS security boundary)

AFTER (Multi-Host, STATE-046):
  Agent A (Host 1) ──→ [Network] ──→ Agent B (Host 2)
  (Network is now the attack surface)
```

| New Risk | Severity | Detail |
|----------|----------|--------|
| **Man-in-the-Middle** | 🔴 Critical | No TLS requirement in STATE-046 ACs |
| **Host Impersonation** | 🔴 Critical | No certificate validation or host identity |
| **Network Eavesdropping** | 🔴 Critical | State files, messages, and potentially API keys traverse the network |
| **Uncontrolled Host Join** | 🔴 Critical | No AC for authenticating new hosts joining the federation |
| **Split-Brain** | 🟡 High | Network partition could lead to conflicting state edits with no resolution |
| **Lateral Movement** | 🟡 High | Compromised host could attack other federation members |
| **Confidentiality of State** | 🟡 High | State files may contain proprietary information; no classification system |

### 6.2 Required Security for STATE-046

STATE-046's ACs are **security-incomplete**. Add:

- **AC#5:** All inter-host communication uses mutual TLS with certificates issued by a federation CA
- **AC#6:** Host identity is verified against a registry (not self-declared)
- **AC#7:** State changes are signed by the originating host and verified by recipients
- **AC#8:** Network partition detection triggers read-only mode within 30 seconds
- **AC#9:** Federation membership requires human administrator approval
- **AC#10:** All inter-host messages are logged to an immutable audit trail
- **AC#11:** Hosts that exceed error thresholds are automatically quarantined

### 6.3 Pre-Implementation Requirements

Before STATE-046 can be built:
1. **PKI infrastructure** — Certificate authority for inter-host TLS
2. **Host registry** — Daemon-mediated registry of authorized hosts
3. **Message signing** — Ed25519 or similar for non-repudiation
4. **Encryption at rest** — For state files on hosts that don't "own" the state

---

## 7. Recommendations — Prioritized Security Actions

### 🔴 P0 — Implement Before Any New States

| # | Action | Effort | Blocks |
|---|--------|--------|--------|
| 1 | **Implement STATE-044 with security ACs** (see §5.3) | 2-3 days | DoS prevention for all 276 agents |
| 2 | **Add secrets scanning to pre-commit** | 2 hours | Prevents accidental key exfiltration |
| 3 | **Enforce assignee-based write authorization** in daemon | 1-2 days | Prevents state file poisoning |
| 4 | **Fix STATE-031 push notification audit** | 1 day | Foundation for STATE-049 security |

### 🟡 P1 — Before STATE-049 and STATE-046

| # | Action | Effort | Blocks |
|---|--------|--------|--------|
| 5 | **Design agent authentication protocol** (token-based, in STATE-049) | 3-5 days | Message integrity, identity verification |
| 6 | **Add message signing** (Ed25519 per-agent keys) | 2-3 days | Prevents message spoofing |
| 7 | **Implement State ID registry** (.next-id with lock) | 1 day | Prevents ID collision attacks |
| 8 | **Add audit logging** for state transitions | 2 days | Forensic capability for incident response |

### 🟢 P2 — Before STATE-046 Goes Live

| # | Action | Effort | Blocks |
|---|--------|--------|--------|
| 9 | **PKI infrastructure** (federation CA, host certs) | 1 week | Required for mTLS in STATE-046 |
| 10 | **Host authentication** for federation join | 3-5 days | Prevents rogue host join |
| 11 | **Network encryption** (TLS for all HTTP/WebSocket) | 2-3 days | Prevents eavesdropping |
| 12 | **State file encryption at rest** for non-owning hosts | 1 week | Protects data on foreign hosts |

### 🔵 P3 — Ongoing

| # | Action | Effort | Cadence |
|---|--------|--------|---------|
| 13 | **Security audit of state file content** | 1 day | Monthly |
| 14 | **Rotate federation certificates** | 2 hours | Quarterly |
| 15 | **Review rate limit policies** | 2 hours | Monthly |
| 16 | **Penetration test of daemon API** | 1 week | Quarterly (after STATE-046) |

---

## 8. Specific Concerns on the Roadmap Architecture

### 8.1 The Trust Gap

The roadmap is moving from **filesystem-enforced trust** (OS permissions) to **protocol-enforced trust** (HTTP/WebSocket API). This transition is the most dangerous period:

- In the filesystem model, an attacker needs OS-level access
- In the protocol model, an attacker needs only network access
- The daemon becomes a **single point of failure** — compromise it, and you control the roadmap

**Recommendation:** The daemon (STATE-038) should be treated as a security-critical component with:
- Minimal privilege (run as non-root, separate user)
- Input validation on all API endpoints
- Rate limiting from day one (not deferred to STATE-044)
- Comprehensive audit logging

### 8.2 STATE-049 Protocol Security

STATE-049's ACs mention "messages persisted" and "mentions trigger notifications" but say nothing about:

- How messages are authenticated
- How notification targets are verified
- Whether message content is validated or sanitized
- Whether there's a rate limit on messages per agent
- Whether message history is tamper-evident

**Recommendation:** Add security ACs to STATE-049 before implementation:
- **AC#5:** Messages include sender signature verified on read
- **AC#6:** Message content is sanitized (no executable content, no HTML injection)
- **AC#7:** Per-agent message rate limit (separate from state claim rate limit)
- **AC#8:** Message history is append-only with cryptographic hash chain

### 8.3 The 276-Agent Problem

With 276 agents, the following become near-certainties rather than theoretical risks:

| Risk | Probability at 276 agents | Mitigation |
|------|--------------------------|------------|
| State ID collision | ~100% within a week | Mechanism-enforced ID allocation |
| Accidental secret in commit | ~50% per day | Pre-commit secrets scanning |
| Message flood from one agent | ~30% per day | Per-agent message rate limit |
| Filesystem write collision | ~20% per day | Daemon-mediated file writes |
| Corrupted state file (crash mid-write) | ~10% per day | Atomic writes + checksum validation |

These aren't hypothetical. They're statistical inevitabilities. The security infrastructure needs to assume all of them will happen.

---

## 9. Summary

The roadmap has good architectural instincts (daemon centralization, lease-based claiming, audit trails) but the security layer hasn't kept pace with the scale. The three most urgent gaps:

1. **No authentication** — Agents can impersonate each other trivially
2. **No rate limiting** — A single bad actor can DoS the entire system
3. **No encryption** — STATE-046 will expose all state data to the network

The good news: none of these are novel problems. Token auth, rate limiting middleware, and mTLS are well-understood patterns. The cost of fixing them now (days) is orders of magnitude less than fixing them after a breach at 276-agent scale (weeks/months).

**Bottom line:** Implement STATE-044 with security ACs *now*, add authentication to STATE-049 *before* implementation, and treat STATE-046 as a security-critical state that requires PKI, host auth, and encryption as prerequisites — not afterthoughts.

---

*Review complete. Escalate P0 items to architect and PM immediately.*
