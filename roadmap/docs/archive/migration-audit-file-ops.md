# Migration Audit: File-Based Operations → Postgres Equivalents
**STATE-095 AC#1** | Created: 2026-03-25 14:50 UTC | Author: Carter

## Executive Summary

**35 core modules** use file-based I/O. Of these:
- **Tier 1 (Already migrated):** 3 modules → Postgres
- **Tier 2 (Priority migration):** 12 modules → DB candidates
- **Tier 3 (Keep file-based):** 15 modules → file system appropriate
- **Tier 4 (Evaluate later):** 5 modules → depends on usage patterns

---

## Tier 1: Already Migrated to Postgres ✅

| Module | File Ops | Postgres Table | Status |
|--------|----------|-----------|--------|
| `state-storage.ts` | read/write state files | `states` | ✅ Live |
| `registry.ts` | agent registration | `agents` | ✅ Live |
| `cli-adapter.ts` | CLI → Postgres bridge | `states`, `agents` | ✅ Live |

---

## Tier 2: Priority Migration to Postgres 🎯

These modules manage shared state that benefits from real-time sync, conflict resolution, and atomicity.

### T2-A: Core State Management (High Priority)

| Module | File Ops | Proposed Postgres Table | Data Shape |
|--------|----------|-------------------|------------|
| `roadmap.ts` | Read/write state .md files, parse frontmatter | `states` (extend) | StateID, frontmatter JSON, content body |
| `state-integrity.ts` | SHA-256 checksums, atomic writes, backups | `state_checksums` | StateID, checksum, backup_path, verified_at |
| `checksum.ts` | Checksum verification/recovery | `state_checksums` | (same as above, merge) |
| `map-projection.ts` | Read states → build projection map | `state_projections` | StateID, parent, status, labels, deps |

### T2-B: Agent Coordination (High Priority)

| Module | File Ops | Proposed Postgres Table | Data Shape |
|--------|----------|-------------------|------------|
| `lease-backlog.ts` | Lease state files, heartbeat logs | `leases` | LeaseID, agent, state, expires_at, heartbeat |
| `proposal-workflow.ts` | Proposal state files | `proposals` | ProposalID, state, status, reviews[] |
| `proposal-lease.ts` | Proposal ↔ lease binding | `proposal_leases` | ProposalID, LeaseID, agent |
| `agent-proposals.ts` | Agent proposal history | `agent_proposals` | AgentID, proposals[], timestamps |

### T2-C: Security & Audit (Medium Priority)

| Module | File Ops | Proposed Postgres Table | Data Shape |
|--------|----------|-------------------|------------|
| `audit-log.ts` | Append-only JSON audit files | `audit_events` | EventID, agent, action, target, timestamp, metadata |
| `audit-trail.ts` | Read/verify audit chains | `audit_events` | (merge with audit-log) |
| `authorization.ts` | RBAC policy files | `rbac_policies` | Role, permissions[], phase_gates[] |
| `access-control.ts` | ACL file storage | `acl_entries` | Resource, principal, action, granted |

### T2-D: Team & Identity (Medium Priority)

| Module | File Ops | Proposed Postgres Table | Data Shape |
|--------|----------|-------------------|------------|
| `team-membership.ts` | Team roster files, SOUL.md generation | `team_members` | AgentID, team, role, workspace, joined_at |
| `team-builder.ts` | Requirement matching files | `team_requirements` | TeamID, skills[], role_priority[] |
| `agent-identity.ts` | Key pairs, identity files | `agent_identities` | AgentID, public_key, registered_at |
| `id-registry.ts` | ID allocation files | `id_registry` | ResourceID, type, allocated_to, allocated_at |

---

## Tier 3: Keep File-Based 📁

These modules work with local filesystem concerns or generate files — inappropriate for DB storage.

| Module | Reason | File Ops |
|--------|--------|----------|
| `doc-generator.ts` | Generates .md output files | Write generated docs |
| `init.ts` | Creates project scaffolding | Write template files |
| `secrets-manager.ts` | Local encrypted vault (security) | AES-256-GCM vault files |
| `secrets-scanner.ts` | Scans files for secrets | Read-only file scanning |
| `content-store.ts` | File content-addressable storage | CAS file storage |
| `federation-pki.ts` | TLS certificates | PEM/cert file storage |
| `federation-api.ts` | HTTP API handlers | Request/response (network) |
| `federation.ts` | Federation config files | Read federation config |
| `framework-adapter.ts` | Framework-specific adapters | Template generation |
| `prefix-migration.ts` | File renames/migrations | Filesystem operations |
| `regression-suite.ts` | Test execution | Run tests, read results |
| `rate-limiter.ts` | In-memory rate tracking | No persistence needed |
| `terminology.ts` | String replacements | Pure computation |
| `pulse.ts` | Advisory generation | Computed from Postgres data |
| `message-protocol.ts` | Message serialization | Protocol logic only |

---

## Tier 4: Evaluate Later 🔍

| Module | Current Ops | Decision Needed |
|--------|------------|-----------------|
| `knowledge-base.ts` | Read/write knowledge docs | Could move to Postgres `knowledge` table |
| `scout.ts` | Read state files for scouting | Read-only, may stay file-based |
| `obstacle-pipeline.ts` | JSON obstacle store | Small data, could stay file-based |
| `issue-tracker.ts` | Issue JSON files | Could move to Postgres `issues` table |
| `auth.ts` | Token file storage | Could merge into `agent_identities` |

---

## Data Flow: Current vs Target

```
CURRENT (File-based):
┌──────────┐     ┌───────────┐     ┌─────────────┐
│  Agent   │────▶│  .md files │────▶│  Git Commit │
└──────────┘     └───────────┘     └─────────────┘

TARGET (Postgres):
┌──────────┐     ┌────────────┐     ┌──────────────┐
│  Agent   │────▶│ Postgres│────▶│  Subscribers │
└──────────┘     └────────────┘     └──────────────┘
                      │
                      ▼ (write-through)
                 ┌───────────┐
                 │ .md files │  ← fallback / backup
                 └───────────┘
```

---

## Dual-Write Strategy Preview (AC#2)

During transition, critical writes go to BOTH:

```typescript
async function saveState(state: State) {
  // 1. Write to Postgres (primary)
  await postgres.insert('states', state);
  
  // 2. Write to file (fallback)
  await writeFile(statePath(state.id), serialize(state));
  
  // 3. Verify consistency
  const dbState = await postgres.query('states', state.id);
  assert(checksum(dbState) === checksum(state));
}
```

**Exit criteria for dual-write removal:**
- All Tier 2 modules verified on Postgres for 7 days
- Zero data loss incidents
- Rollback tested successfully

---

## Next Steps

- [ ] AC#2: Design dual-write strategy (this doc section is a preview)
- [ ] AC#3: Field-by-field mapping (.md frontmatter → Postgres columns)
- [ ] AC#4: Rollback strategy
- [ ] AC#6: Workflow migration (agent claiming, transitions, merges)
- [ ] AC#7: Phased rollout plan with success metrics
