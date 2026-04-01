# Architecture Review: agentRoadmap.md DAG System

**Date:** 2026-03-22  
**Reviewer:** Software Architect  
**Scope:** Dependency graph integrity, foundation completeness, scalability to 276+ agents

---

## Executive Summary

The DAG-centric architecture has proven its value: 32 states implemented, multi-agent coordination working across 5+ agent frameworks, and a clean separation between CLI, MCP, Core, and filesystem layers. However, three systemic issues threaten the system as it scales:

1. **MAP.md is a stale projection** — 10 states exist in the filesystem but are absent from the DAG visualization
2. **The dependency graph has hidden structural issues** — orphaned states, phantom dependencies, and status/provenance drift
3. **Critical foundation states are missing** — no distributed synchronization, no conflict-free concurrent claiming at scale, no DAG health monitoring

---

## 1. Dependency Graph Soundness

### 1.1 States Missing from MAP.md DAG

These states exist in `roadmap/states/` with valid frontmatter but are **completely absent** from the PlantUML DAG and Project Graph in MAP.md:

| State ID | Title | Status | Dependencies (actual) | Impact |
|---|---|---|---|---|
| STATE-022 | Node.js v24 Test Suite Corruption | Reached | None | Obstacle — should be in graph |
| STATE-031 | Channel Subscription & Push Messaging | Reached | None | Core infra — missing from collaboration milestone |
| STATE-032 | DAG Visualization SVG Export | Reached | None | Tooling — ironic absence from its own visualization |
| STATE-033 | DAG Connectivity Enforcement | Reached | STATE-003, STATE-011 | **Irony**: validates DAG but isn't in it |
| STATE-034 | State Activity Provenance Log | Review | None | Active work-in-progress, invisible |
| STATE-035 | Remove Definition of Reached | Reached | None | Cleanup — graph doesn't reflect DoR removal |
| STATE-036 | Token-Efficient Plain Output | Reached | None | DX improvement, not shown as delivered |
| STATE-037 | Relax Guarded Reached Transition | Active | STATE-034 | Architectural pivot — invisible |
| STATE-038 | Route Through Daemon API | Review | STATE-019 | Critical path toward Decision-5 architecture |
| STATE-039 | Board View Toggle Empty Columns | Complete | None | UI feature, invisible |

**Root cause:** MAP.md is manually maintained (or projected) but states are created independently. There is no mechanical link between state creation and DAG registration. STATE-033 was supposed to solve this (orphan detection) but its own scope didn't include MAP.md projection.

### 1.2 Dependency Mismatch: STATE-008

The PlantUML DAG shows:
```
4 --> 8
6 --> 8
```

But `state-8.md` declares:
```yaml
dependencies:
  - STATE-025
```

STATE-008 does **not** list STATE-004 or STATE-006 as dependencies, yet the DAG visualizes those edges. Meanwhile, the textual dependency summary says:
> STATE-008 depends on STATE-004 and STATE-006

This is a **three-way contradiction** between:
- The PlantUML diagram (4→8, 6→8)
- The state file frontmatter (depends on 25)
- The text dependency summary (4, 6)

### 1.3 Phantom Achievement Log Entries

The Achievement Log claims these as reached:
- **STATE-031** — but audit notes explicitly say "Review failed" (AC#2 not implemented, push delivery broken)
- **STATE-010.1** — but audit notes say "Review failed" (blocking issues: `completeState()` doesn't enforce issue checks, test-runner has false-negative bug)

Both states' frontmatter files say `status: Reached` despite failed audits. This means the verification gate (STATE-030 → STATE-037) has a hole: agents can set status to Reached without peer approval surviving.

### 1.4 Orphaned Subgraph: m-4 Proof of Arrival

The m-4 milestone subgraph is entirely disconnected from the reached foundation:

```
25 --> 10 --> 10_1
10 --> 28 ──┐
10 --> 29 ──┤
28,29 --> 30
```

But STATE-037 (Relax Guarded Reached Transition) sits **outside** this subgraph and directly contradicts STATE-030's hard gates. STATE-037 depends on STATE-034, not on STATE-030 or STATE-010. This creates two divergent design philosophies in the same DAG without reconciliation.

---

## 2. Missing Foundation States

For a system targeting 276+ autonomous agents, the current foundation has critical gaps:

### 2.1 No Conflict Resolution Protocol (Missing: STATE-040)

**Current state:** STATE-004 (Lease-Based Claiming) handles single-writer claims, and STATE-007 (Heartbeat) handles stale recovery. But there is no protocol for:

- What happens when two agents claim the same state at exactly the same timestamp?
- What happens when Agent A is "almost done" but Agent B's lease expires and a third agent picks it up?
- How are claim disputes arbitrated mechanically?

**Proposed:** `STATE-040: Concurrent Claim Conflict Resolution`
- **Dependencies:** STATE-004, STATE-007
- **Scope:** Three-way merge for claim races, "last write wins" vs "first proof wins" policy, escalation paths for contested states
- **Why it matters at scale:** With 276 agents, claim collision probability scales as O(n²). Currently the system relies on file locking (STATE-008) which doesn't work across hosts.

### 2.2 No DAG Health Monitoring (Missing: STATE-041)

**Current state:** STATE-033 implements orphan detection and dead-end detection via `roadmap map audit`. But this is a point-in-time CLI check, not a continuous health signal.

**Proposed:** `STATE-041: Continuous DAG Health Telemetry`
- **Dependencies:** STATE-033, STATE-034 (provenance log)
- **Scope:** Background health metrics: cycle detection (DAG should be acyclic, but no mechanical guard), depth distribution, bottleneck concentration, dependency fan-out alerts
- **Why it matters at scale:** A single circular dependency breaks the entire autonomous pickup chain. With 276 states, manual `map audit` is insufficient.

### 2.3 No DAG Partitioning / Milestone Boundaries (Missing: STATE-042)

**Current state:** All 32 states live in a single flat namespace under `roadmap/states/`. The PlantUML DAG is already hard to read. At 276+ states, this becomes unmanageable.

**Proposed:** `STATE-042: DAG Partitioning with Milestone Boundary Guards`
- **Dependencies:** STATE-001, STATE-033
- **Scope:** Logical partitions per milestone, scoped pickup queries (agents only see relevant partitions), cross-partition dependency declarations, partition health summaries
- **Why it matters at scale:** An agent picking up work from m-6 shouldn't need to parse 250+ states from m-0 through m-5.

### 2.4 No Agent Capability Evolution Tracking (Missing: STATE-043)

**Current state:** STATE-005 (Agent Registry) provides a static capability profile. Agents register once and the profile doesn't change.

**Proposed:** `STATE-043: Agent Capability Learning & Profile Evolution`
- **Dependencies:** STATE-005, STATE-006 (scoring)
- **Scope:** Track completion history per capability, auto-update confidence scores, detect capability decay (agent used to handle node-expert tasks but recent ones failed), expose capability provenance
- **Why it matters at scale:** With 276 agents of varying capability, static profiles become stale within hours. The scoring system (STATE-006) feeds on bad data.

### 2.5 No Rate Limiting / Anti-Flooding (Missing: STATE-044)

**Current state:** Any agent can call pickup, claim, heartbeat, and messaging tools as fast as it wants. No throttling.

**Proposed:** `STATE-044: Per-Agent Rate Limiting & Fair Share Allocation`
- **Dependencies:** STATE-005, STATE-007
- **Scope:** Rate limits per agent per operation, fair-share claiming (no single agent hoards all ready states), configurable burst windows, circuit breaker for misbehaving agents
- **Why it matters at scale:** One fast-looping agent can starve 275 others by claiming every ready state before they can query.

### 2.6 No Cross-Host Coordination (Missing: STATE-045)

**Current state:** The coordination-service-architecture.md proposes a local daemon + SQLite model. STATE-038 implements daemon API routing. But the system assumes a single host.

**Proposed:** `STATE-045: Multi-Host Coordination via Daemon Federation`
- **Dependencies:** STATE-038 (daemon API), STATE-040 (conflict resolution)
- **Scope:** Daemon-to-daemon sync protocol, SQLite → PostgreSQL upgrade path, agent registry federation, heartbeat relay across hosts, partitioned leader election
- **Why it matters at scale:** 276 agents on a single machine is impractical. The architecture needs a clear multi-host path, and Decision-5 already deferred it.

---

## 3. Architectural Tensions

### 3.1 Hard Gates vs. Trust with Visibility

| Source | Philosophy |
|---|---|
| **Decision-4** (Enforced Verification Gates) | "Gate Reached on audited maturity and mandatory proof links" |
| **STATE-030** (Guarded Reached Transition) | Hard gates: proof, peer audit, verification statements required |
| **STATE-037** (Relax Guarded Reached) | "Remove hard gates. AC is the only contract. Activity log records who did what. Bad completions caught post-hoc" |
| **DNA.md** | "A state is only reached when the agent provides terminal-level proof" |

**The conflict:** STATE-037 directly contradicts Decision-4 and STATE-030, yet both coexist in the DAG. STATE-037 is marked `Active` (not `Reached`), so the system is in an ambiguous middle state — the old hard gates are partially in place, the new relaxed model is partially implemented.

**Recommendation:** This tension needs a Decision-6 that resolves the philosophical split. The system should commit to one model:
- **Option A:** Trust + Visibility (STATE-037 philosophy) — lightweight, scales better, relies on provenance and post-hoc audit
- **Option B:** Hard Gates (Decision-4/STATE-030 philosophy) — high integrity, but creates bottlenecks at scale

Given the target of 276+ agents, Option A is more viable. Hard gates create serial bottlenecks in a fundamentally parallel system.

### 3.2 File System vs. Daemon Authority

| Source | Model |
|---|---|
| **MAP.md** | Manually maintained PlantUML DAG in a markdown file |
| **Decision-5** | "Markdown artifacts as deterministic projections, not live source of truth" |
| **STATE-038** | "Agents route through daemon API. Symlinks eliminated" |
| **Current reality** | MAP.md is still the DAG source of truth, not the daemon |

**The conflict:** The architecture decision says "daemon is authority, markdown is projection." But MAP.md — the critical DAG visualization — is still a manually curated markdown block, not a projection from a canonical database.

**Recommendation:** STATE-046 (below) would close this gap.

### 3.3 Inconsistent Maturity/Status Interplay

Three states (STATE-031, STATE-010.1, STATE-038) are marked `status: Reached` in their frontmatter despite having failed peer audits. This suggests the code that writes state files doesn't mechanically enforce the audit verdict.

**The root cause:** STATE-037 removed the hard gate, but didn't replace it with a softer enforcement mechanism. The activity log (STATE-034) records changes but doesn't prevent overrides.

**Recommendation:** Even in a "trust with visibility" model, the system needs a mechanical marker: `audit_verdict: failed` in frontmatter that blocks status=Reached unless explicitly overridden with a `override_audit: true` field and a reason.

---

## 4. Proposed New States

Based on the analysis above, here are the priority-ordered new infrastructure states:

### Tier 1: Critical Foundation Gaps (implement before 50 agents)

| New ID | Title | Dependencies | Priority |
|---|---|---|---|
| **STATE-040** | Concurrent Claim Conflict Resolution | STATE-004, STATE-007 | Critical |
| **STATE-041** | Continuous DAG Health Telemetry | STATE-033, STATE-034 | High |
| **STATE-044** | Per-Agent Rate Limiting & Fair Share | STATE-005, STATE-007 | Critical |
| **STATE-046** | MAP.md as Daemon Projection (not manual) | STATE-038, STATE-033 | High |

### Tier 2: Scale Preparation (implement before 100 agents)

| New ID | Title | Dependencies | Priority |
|---|---|---|---|
| **STATE-042** | DAG Partitioning with Milestone Boundaries | STATE-001, STATE-033 | High |
| **STATE-043** | Agent Capability Learning & Profile Evolution | STATE-005, STATE-006 | Medium |
| **Decision-6** | Resolve Trust vs. Gates Philosophy | STATE-037 | High |

### Tier 3: Multi-Host Readiness (implement before 276 agents)

| New ID | Title | Dependencies | Priority |
|---|---|---|---|
| **STATE-045** | Multi-Host Coordination via Daemon Federation | STATE-038, STATE-040 | High |
| **STATE-047** | Distributed Event Log & Replay | STATE-038, STATE-045 | Medium |

---

## 5. MAP.md Remediation Plan

The immediate action items to bring MAP.md into sync with reality:

1. **Add missing states to the PlantUML DAG:** STATES 22, 31, 32, 33, 34, 35, 36, 37, 38, 39, 10.1
2. **Fix STATE-008 dependency in MAP.md:** Update the PlantUML edge to match frontmatter (`25 --> 8`) OR update frontmatter to match the intended design (`STATE-004, STATE-006 --> STATE-008`)
3. **Add STATE-037 to the m-4 subgraph** with a note that it relaxes STATE-030's gates
4. **Add STATE-038 to the daemon pathway** connecting STATE-019 → STATE-038
5. **Correct the Achievement Log:** Move STATE-031 and STATE-010.1 to "Audit Failed" until blocking issues are resolved
6. **Add STATE-033 to the Foundation package** as it validates the entire graph structure
7. **Add STATE-034, 37, 38** to a new or existing "Infrastructure Evolution" package

### Proposed Updated DAG Package Structure

```
[m-0: Foundation]
  000 → 001 → 002 → 25 → 1 → 26
  22 (obstacle, disconnected)
  33 (DAG health, depends on 3 + 11)
  35 (cleanup, disconnected)
  36 (DX, disconnected)

[m-1: Agent Collaboration]
  002 → 003 → 004 → 005
  002 → 20
  31 (push messaging, depends on 003)

[m-2: Autonomous Coordination]
  002 → 006
  002 → 19 → 38

[m-3: Scout & Map]
  11 (scout/propose)

[m-4: Proof of Arrival]
  25 → 10 → 10.1
  10 → 28, 29 → 30
  34 → 37 (relaxation of 30's gates)

[m-5: Web Interface]
  21 → 21.1
  39 (board view toggle)

[m-6: Autonomous Execution]
  002 → 3 → 4 → 7
  002 → 5 → 6
  4 → 8 (pickup)
  25 → 8 (nomenclature alignment)
  6 → 8 (scoring integration)
  4 → 9 (negotiation)
  32 (SVG export, standalone)

[m-inf: Infrastructure Evolution] (NEW)
  34 → 37
  33 → 41 (telemetry, proposed)
  4 → 40 (conflict resolution, proposed)
  5 → 44 (rate limiting, proposed)
  38 → 46 (MAP.md projection, proposed)
```

---

## 6. Scalability Risk Matrix

| Risk | Current Mitigation | Gap | Severity at 276 Agents |
|---|---|---|---|
| Claim collision races | File locking (STATE-008) | Single-host only | **Critical** — no cross-process atomicity |
| DAG query performance | CLI reads all state files | No indexing, no caching | **High** — O(n) per query |
| Agent starvation | None | No rate limiting or fair share | **Critical** — fast agents hoard work |
| Stale agent accumulation | Heartbeat (STATE-007) | No bulk recovery, no dead-agent GC | **Medium** — degrades scoring |
| Graph corruption | Orphan detection (STATE-033) | No cycle detection | **Critical** — breaks pickup chain |
| Memory/context overflow | --compact output (STATE-036) | No DAG partitioning | **High** — agents can't parse full graph |
| Authority ambiguity | Daemon API (STATE-038) | MAP.md still manual | **Medium** — conflicting truth sources |
| Audit trust | Activity log (STATE-034) | No mechanical override tracking | **Medium** — false Reached states |

---

## 7. Recommendations Summary

### Immediate (This Sprint)
1. Fix MAP.md DAG — add 10 missing states, correct STATE-008 dependency
2. Correct Achievement Log — STATE-031 and STATE-010.1 are not truly Reached
3. Write Decision-6 resolving the Trust vs. Gates philosophy

### Short-Term (Next 2 Sprints)
4. Implement STATE-044 (Rate Limiting) — blocks any meaningful multi-agent work
5. Implement STATE-040 (Conflict Resolution) — current file locking is insufficient
6. Implement STATE-041 (DAG Health Telemetry) — cycle detection is non-negotiable

### Medium-Term (Before 100 Agents)
7. Implement STATE-046 (MAP.md as Daemon Projection) — close the truth-source gap
8. Implement STATE-042 (DAG Partitioning) — single namespace won't scale
9. Implement STATE-043 (Capability Learning) — static profiles are already stale

### Long-Term (Before 276 Agents)
10. Implement STATE-045 (Multi-Host Federation) — single machine is a ceiling
11. Implement STATE-047 (Distributed Event Log) — audit trail across hosts

---

## Appendix: State Inventory

| State ID | In MAP DAG? | Status (file) | Status (MAP/Achievement) | Match? |
|---|---|---|---|---|
| 000 | ✅ | Reached | Reached | ✅ |
| 001 | ✅ | Reached | Reached | ✅ |
| 002 | ✅ | Reached | Reached | ✅ |
| 003 | ✅ | Reached | Reached | ✅ |
| 004 | ✅ | Reached | Reached | ✅ |
| 005 | ✅ | Potential | Potential | ✅ |
| 006 | ✅ | Potential | Potential | ✅ |
| 1 | ✅ | Reached | Reached | ✅ |
| 3 | ✅ | Reached | Reached | ✅ |
| 4 | ✅ | Potential | Potential | ✅ |
| 5 | ✅ | Potential | Potential | ✅ |
| 6 | ✅ | Reached | Reached | ✅ |
| 7 | ✅ | Reached | Reached | ✅ |
| 8 | ✅ | Reached | Reached | ✅ |
| 9 | ✅ | Reached | Reached | ✅ |
| 10 | ✅ | Potential | Potential | ✅ |
| 10.1 | ❌ | Reached | Reached | ⚠️ Audit failed |
| 11 | ✅ | Reached | Reached | ✅ |
| 19 | ✅ | Potential | Potential | ✅ |
| 20 | ✅ | Potential | Potential | ✅ |
| 21 | ✅ | Potential | Potential | ✅ |
| 21.1 | ✅ | Potential | Potential | ✅ |
| 22 | ❌ | Reached | — | ❌ Missing from MAP |
| 25 | ✅ | Reached | Reached | ✅ |
| 26 | ✅ | Reached | Reached | ✅ |
| 28 | ✅ | Potential | Potential | ✅ |
| 29 | ✅ | Potential | Potential | ✅ |
| 30 | ✅ | Potential | Potential | ✅ |
| 31 | ❌ | Reached | Reached | ⚠️ Audit failed |
| 32 | ❌ | Reached | — | ❌ Missing from MAP |
| 33 | ❌ | Reached | — | ❌ Missing from MAP |
| 34 | ❌ | Review | — | ❌ Missing from MAP |
| 35 | ❌ | Reached | — | ❌ Missing from MAP |
| 36 | ❌ | Reached | — | ❌ Missing from MAP |
| 37 | ❌ | Active | — | ❌ Missing from MAP |
| 38 | ❌ | Review | — | ❌ Missing from MAP |
| 39 | ❌ | Complete | — | ❌ Missing from MAP |

---

*Review completed. 10 states missing from DAG, 2 status/audit mismatches, 6 missing foundation states recommended for 276+ agent scale.*
