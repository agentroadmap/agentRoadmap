# Roadmap Reflection — 2026-03-22

**Author**: Alex (Product Manager)
**Date**: 2026-03-22
**Session Type**: Product Strategy & Roadmap Expansion

---

## 1. Key Discussions Today

### Agent-Native Communication
Today surfaced a fundamental design question: **How should agents communicate in a way that's native to their operation, not adapted from human workflows?**

Current state (STATE-031, STATE-049):
- Agents poll `message_read` to discover new messages
- Push notifications via subscriptions exist but audit found implementation gaps
- Messages stored as markdown files with base64 encoding for structured content

**Key insight**: The `group-pulse.md` message file demonstrates both strengths and limitations of the current approach:
- **Strength**: Human-readable, version-controlled, survives agent restarts
- **Limitation**: Base64 encoding adds overhead; no native indexing or search; poll-based discovery creates coordination friction

### State Discussions vs. Messaging
A distinction emerged between **state-level discussions** (embedded in state file notes sections) and **channel messaging** (group-pulse.md):

| Channel | Purpose | Persistence | Visibility |
|---------|---------|-------------|------------|
| State Notes | Implementation details, audit results, test results | Permanent in state file | Anyone viewing state |
| group-pulse.md | Proposals, discussions, announcements | Append-only log | All agents |
| Direct mentions | Targeted questions, reviews | Via message system | Mentioned agent |

**Gap identified**: No formal mechanism for "RFC-style" discussions that start in group-pulse and graduate into state proposals.

### Persistent vs. Instant Messaging
The heartbeat/recovery infrastructure (STATE-007) and daemon mode (STATE-019) created a parallel discussion about **persistent vs. instant communication**:

- **Persistent**: State files, message logs — survive crashes, available retroactively
- **Instant**: Push notifications, SSE events — fast but ephemeral if not captured

**Current architecture leans heavily toward persistent** (file-based), which is correct for an agent-native system where:
- Agents may disconnect and reconnect
- Work must survive process restarts
- Audit trails are required for proof-of-arrival

**But**: Instant notification is missing for time-sensitive coordination (e.g., "STATE-005 is blocked and needs immediate attention").

---

## 2. Decisions Made

### New States Created (STATE-040 through STATE-050)

| State | Title | Priority | Status | Milestone |
|-------|-------|----------|--------|-----------|
| STATE-040 | Skill Registry & Auto-Discovery | High | Potential | m-2 |
| STATE-041 | Framework Adapter Contract | High | Potential | m-0 |
| STATE-042 | Obstacle-to-State Pipeline | Medium | Potential | m-4 |
| STATE-043 | Continuous DAG Health Telemetry | Medium | Potential | m-8 |
| STATE-044 | Per-Agent Rate Limiting & Fair Share | Medium | Potential | m-8 |
| STATE-045 | MAP.md as Daemon Projection | Medium | Potential | m-2 |
| STATE-046 | Multi-Host Federation | Low | Potential | m-7 |
| STATE-047 | Agent Knowledge Base & Documentation | Medium | Potential | m-9 |
| STATE-048 | Automated Regression Suite | Medium | Potential | m-4 |
| STATE-049 | Inter-Agent Communication Protocol | Medium | Potential | m-1 |
| STATE-050 | Product Development Workflow Protocol | High | **Reached** | m-0 |

### Workflow Protocol Established
**STATE-050** was created and reached in the same session — a significant milestone. The protocol defines 6 phases:

```
PROPOSE → DESIGN → REVIEW → BUILD → TEST → CERTIFY
```

Key elements:
- Each phase has an assigned agent role (PM, Architect, Code Reviewer, Engineering, QA, PM)
- Gates between phases prevent skipping
- State file format requirements standardized
- Communication rules defined for each phase

### Heartbeat & Configuration
No direct changes to heartbeat configuration today, but the session reinforced that:
- Heartbeat intervals (STATE-007) should factor into rate limiting design (STATE-044)
- Daemon mode (STATE-019) provides the persistent infrastructure needed for instant notifications

---

## 3. Product Gaps Identified

### Missing Milestones

| Gap | Current State | Proposed Milestone |
|-----|---------------|-------------------|
| External integrations | No states | **m-7: Ecosystem & Integrations** |
| Agent intelligence | No states | **m-8: Agent Intelligence** |
| Knowledge management | No states | **m-9: Knowledge Management** |

### Critical Capability Gaps

| Gap | Vision Promise | Current Reality |
|-----|----------------|-----------------|
| **Skill Registry** | "Framework-agnostic" | Static `skills/` directory only |
| **Obstacle Pipeline** | "Obstacles are new nodes" | Manual conversion (STATE-022 reactive) |
| **Dependency Optimization** | Symbolic DAG with parallelism | No solver or critical path analysis |

### Under-Resourced Milestones

| Milestone | States | Issue |
|-----------|--------|-------|
| m-1 (CLI/TUI) | 1 state | Needs collaboration expansion |
| m-2 (MCP) | 1 state | Needs tool surface growth |
| m-3 (Scout) | 1 state | Proposal loop isolated |
| m-5 (Web) | 2 states, 0 Reached | Dashboard not shipped |

### Knowledge Base Gap
**STATE-047** was proposed but highlights a real gap:
- No auto-generated documentation from state transitions
- No learning capture from completed states
- New agents have no "institutional memory" to query

---

## 4. Architectural Concerns

### Conflict Resolution
**Current state**: STATE-004 (Lease-Based Claiming) prevents conflicts but doesn't resolve them when they occur.

**Concern**: With 276 agents and only lease-based prevention:
- What happens when two agents need to modify the same state file?
- Git merge conflicts in roadmap files are not handled
- No formal mechanism for state ownership transfer

**Recommendation**: STATE-047 (State Ownership Transfer) should be elevated to P1.

### Cycle Detection
STATE-033 (DAG Connectivity Enforcement) detects orphan nodes and broken edges, but:

**Concern**: 
- No cycle detection in dependency graph
- Agent-proposed states could introduce cycles
- MAP.md manual editing creates risk of invalid DAG structures

**Question for architect**: Should cycle detection be a pre-commit hook, runtime validation, or both?

### Rate Limiting
276 agents operating without rate limits creates:
- File system contention on roadmap files
- Message spam in group-pulse.md
- Potential DoS on MCP server

**STATE-044** (Per-Agent Rate Limiting) addresses this but is marked Medium priority — should this be elevated given agent count?

### MAP.md Manual Editing
Current workflow: agents/humans edit MAP.md directly to update the DAG visualization.

**Concerns**:
- Manual editing is error-prone (broken syntax, invalid dependencies)
- No validation before commit
- Visual representation can drift from actual state files

**STATE-045** (MAP.md as Daemon Projection) proposes making MAP.md a computed output rather than input — this would eliminate the drift problem entirely.

---

## 5. Open Questions

### Trust-with-Visibility vs. Hard Gates
**STATE-037** relaxed the guarded reached transition (STATE-030) to trust with visibility. But STATE-050 (Workflow Protocol) reintroduces hard gates between phases.

**Question**: How do we balance agent autonomy with quality gates?
- Option A: Hard gates everywhere (safe but slow)
- Option B: Soft gates with audit trail (fast but riskier)
- Option C: Hybrid — hard gates for first state reach, soft for subsequent (current approach?)

**Recommendation**: Document the current hybrid approach explicitly and add metrics to track gate bypass frequency.

### Agent Collaboration Model
The roadmap currently assumes a **competitive pickup model** — agents claim independent states. But some work naturally benefits from collaboration:

**Questions**:
- Should we support agent pairing on complex states?
- How does multi-agent work interact with the 6-phase workflow?
- What's the "definition of done" for a state worked on by 3 agents?

**STATE-057** (Agent Pairing) was proposed but needs deeper design.

### Scaling Communication
With 276 agents, group-pulse.md will become unwieldy. Questions:
- Should channels be hierarchical (project-level, team-level)?
- Do we need message summarization for agents catching up?
- How do we prevent notification fatigue?

---

## 6. Recommended Next Steps

### This Week (Urgent)
| Priority | Action | Owner | Rationale |
|----------|--------|-------|-----------|
| P0 | **Implement STATE-041** (Framework Adapter Contract) | Engineering | Foundational for ecosystem, unblocks STATE-040 |
| P0 | **Fix STATE-031 audit issues** (push notification gap) | Engineering | Current implementation doesn't match ACs |
| P1 | **Create m-7, m-8, m-9 milestone files** | PM | Needed for new state organization |

### Next Sprint
| Priority | Action | Owner | Rationale |
|----------|--------|-------|-----------|
| P0 | **Implement STATE-040** (Skill Registry) | Engineering | Core vision capability, enables 276-agent discovery |
| P1 | **Implement STATE-042** (Obstacle Pipeline) | Engineering | Vision-core, independent of STATE-040 |
| P1 | **Document trust-with-visibility model** | PM + Architect | Resolve STATE-037 vs STATE-050 tension |

### This Quarter
| Priority | Action | Owner | Rationale |
|----------|--------|-------|-----------|
| P1 | **Implement STATE-044** (Rate Limiting) | Engineering | Prevent scaling issues before they occur |
| P1 | **Implement STATE-047** (Knowledge Base) | Engineering | Agent onboarding and institutional memory |
| P2 | **Design STATE-057** (Agent Pairing) | PM + Architect | Explore collaborative patterns |

### Backlog (No Date)
| Priority | Action | Rationale |
|----------|--------|-----------|
| P2 | STATE-045 (MAP.md as Daemon Projection) | Nice-to-have, not blocking |
| P2 | STATE-046 (Multi-Host Federation) | Future scaling concern |
| P3 | STATE-053 (GitHub/GitLab Integration) | External dependency |

---

## Metrics to Track

| Metric | Current | Target | Why It Matters |
|--------|---------|--------|----------------|
| States per week | ~2 (today) | 3-5 | Velocity indicator |
| States in review | 3 | <5 | Bottleneck indicator |
| Milestones with active work | 3/7 | 5/7 | Balance indicator |
| Vision gaps identified | 9 | 0 | Health indicator |
| Agent count vs. available states | 276:30 | 276:50+ | Work supply indicator |

---

## Session Summary

**Productive session**: Expanded roadmap from 30 to 41 states, established workflow protocol (STATE-050), and identified 9 vision gaps with proposed solutions. The roadmap now has a clearer path to fulfilling the DNA vision, but requires focused execution on the P0 items (STATE-040, STATE-041) to close critical capability gaps.

**Key decision**: Start with STATE-041 (Framework Adapter Contract) as the foundational piece that enables the ecosystem expansion needed for 276+ agents.

---

*Next reflection scheduled: 2026-03-29*

---

## 7. Architect's Review

**Reviewer:** Software Architect  
**Date:** 2026-03-22  
**Perspective:** Technical feasibility, dependency integrity, and structural risk for the proposed expansion to 276+ agents.

---

### 7.1 Technical Feasibility of Proposed States (STATE-040 through STATE-050)

| State | Feasibility | Technical Risk | Estimated Complexity | Notes |
|-------|-------------|----------------|---------------------|-------|
| **STATE-040** (Skill Registry & Auto-Discovery) | High | Medium | Medium | Builds naturally on STATE-005 (Agent Registry). Core data structure is a queryable index of skills→states. Risk: auto-discovery requires parsing `requires` fields across all states accurately — depends on STATE-036 (compact output) for efficient scanning. |
| **STATE-041** (Framework Adapter Contract) | High | Low | Low | Well-scoped interface contract. Existing `skills/` directory provides a template. Risk: adapter versioning — when OpenClaw changes its skill format, all adapters need coordinated updates. |
| **STATE-042** (Obstacle-to-State Pipeline) | Medium | Medium | Medium | Mechanically simple (copy obstacle fields → state template), but the hard part is *proposing the right dependencies*. Depends on STATE-011 (Scout) for dependency suggestion. Without STATE-041, the pipeline can't suggest framework-specific resolution paths. |
| **STATE-043** (Continuous DAG Health Telemetry) | High | Low | Medium | Extends STATE-033 (orphan detection) with periodic background checks. Core challenge is cycle detection — requires a proper DFS/Tarjan algorithm, not just orphan scanning. Technically straightforward but architecturally critical. |
| **STATE-044** (Per-Agent Rate Limiting & Fair Share) | High | Low | Low | Standard rate limiter (token bucket or sliding window) per agent ID. Integration point is the daemon API middleware (STATE-038). No novel technical risk, but timing-sensitive: must be in place before concurrent agent load exceeds ~20. |
| **STATE-045** (Multi-Host Federation) | Medium | **Very High** | Very High | Requires consensus protocol for state ownership across hosts. SQLite doesn't replicate; PostgreSQL migration is a significant architectural shift. Recommend deferring until single-host daemon (STATE-038) is fully stable. Not a quarter-one deliverable. |
| **STATE-046** (MAP.md as Daemon Projection) | High | Low | Medium | Requires a PlantUML/SVG renderer in the daemon that reads from SQLite and writes deterministic markdown. Well-understood pattern. Depends on STATE-033 (graph audit) for validation before projection. |
| **STATE-047** (Agent Knowledge Base) | Medium | Medium | High | The "institutional memory" problem. Requires a structured query surface over completed state summaries, audit notes, and decisions. Risk: without a clear schema for "knowledge units," this becomes a dumping ground. Recommend modeling it as a decision-support RAG, not a general wiki. |
| **STATE-048** (Automated Regression Suite) | High | Low | Medium | Builds on STATE-010.1 (testing framework). The hard part is test selection — running all tests on every state change doesn't scale. Needs differential test selection based on changed state dependencies. |
| **STATE-049** (Inter-Agent Communication Protocol) | Medium | High | High | The agent-native communication design is sound in principle, but STATE-031's audit failure (push delivery not implemented) means this depends on fixing a broken foundation first. Protocol design must account for: message ordering guarantees, delivery confirmation, and dead-letter handling. Without these, agents will silently lose messages at scale. |
| **STATE-050** (Product Development Workflow) | High | Low | Low | Already reached — validates the 6-phase model. Technical risk is low because it's primarily a state-machine definition for phase transitions. The concern is whether the phase gates are *actually enforced* in the CLI/MCP, or merely documented. |

**Key finding:** 7 of 11 proposed states are high-feasibility. The two highest-risk items (STATE-045, STATE-049) both depend on infrastructure that isn't stable yet. Recommend sequencing them after their prerequisites mature.

---

### 7.2 Architecture Risks Not Covered in the Original Summary

#### 7.2.1 The "State Numbering Collision" Problem

The original reflection proposes STATE-040 through STATE-050. My architecture review independently proposed a STATE-040 through STATE-047 with **different purposes**:

| My Proposal | Reflection Proposal | Collision |
|-------------|-------------------|-----------|
| STATE-040: Concurrent Claim Conflict Resolution | STATE-040: Skill Registry & Auto-Discovery | **Yes** |
| STATE-041: Continuous DAG Health Telemetry | STATE-041: Framework Adapter Contract | **Yes** |
| STATE-042: DAG Partitioning | STATE-042: Obstacle-to-State Pipeline | **Yes** |
| STATE-043: Agent Capability Learning | STATE-043: Continuous DAG Health Telemetry | Different scope |
| STATE-044: Per-Agent Rate Limiting | STATE-044: Per-Agent Rate Limiting | **Same** |
| STATE-045: Multi-Host Federation | STATE-045: MAP.md as Daemon Projection | **Yes** |
| STATE-046: MAP.md as Daemon Projection | STATE-046: Multi-Host Federation | **Yes** |
| STATE-047: Distributed Event Log | STATE-047: Agent Knowledge Base | **Yes** |

**This is a coordination failure.** Two agents (Product Manager and Architect) created overlapping state ID ranges without a naming registry. With 276 agents, this becomes a **write collision nightmare** — two agents can independently create STATE-042 with incompatible definitions.

**Recommended fix:** STATE-048 should become a **State ID Registry** — a mechanically enforced ID allocation service (daemon-mediated, like a database sequence) that prevents ID collisions. Until the daemon (STATE-038) is stable, use a `roadmap/states/.next-id` counter file with file locking (STATE-008).

#### 7.2.2 The "Workflow Protocol Bypass" Risk

STATE-050 establishes a 6-phase workflow (PROPOSE → DESIGN → REVIEW → BUILD → TEST → CERTIFY). But **STATE-050 was itself reached in the same session it was created**, skipping all six phases.

This isn't necessarily wrong (meta-states that define process don't need to follow the process they define), but it creates a precedent that agents will exploit: "This state defines the workflow, so it's exempt from the workflow."

**Risk:** Without a mechanical distinction between *process-defining states* and *process-following states*, every agent can rationalize skipping phases. The system needs either:
- A `state_type` field: `meta-process`, `infrastructure`, `product`, `research` — where only `meta-process` states can bypass the workflow
- OR the workflow is enforced mechanically and meta-states go through it anyway (slower but more consistent)

#### 7.2.3 The "Feedback Loop" Problem in Capability Scoring

STATE-006 (Resource-Aware Scoring) uses `requires` fields and agent capability profiles. STATE-040 (Skill Registry) proposes auto-discovery of skills. STATE-043 (Capability Learning) proposes dynamic profile updates.

**The feedback loop:** If scoring depends on capabilities, and capabilities are updated based on scoring outcomes, the system can converge to self-reinforcing bias:
- Agent A is scored high for "node-expert" → Agent A gets all node states → Agent A has high completion rate for node states → Agent A's "node-expert" confidence increases → Agent A gets even more node states
- Meanwhile, Agent B never gets node states because the scoring system has already locked in Agent A as the "node expert"

**This is a cold-start / exploration-exploitation tradeoff.** The scoring function needs an explicit exploration factor: a small probability that a less-confident agent gets a state, to allow capability profiles to diversify.

#### 7.2.4 The "Milestone Creep" Problem

The reflection adds three new milestones (m-7, m-8, m-9) but **none of the existing milestones are complete**:

| Milestone | States | Reached | % Complete |
|-----------|--------|---------|------------|
| m-0 | 4 | 4 | 100% |
| m-1 | 5 | 3 | 60% |
| m-2 | 2 | 0 | 0% |
| m-3 | 1 | 1 | 100% |
| m-4 | 5 | 1 | 20% |
| m-5 | 2 | 0 | 0% |
| m-6 | 7 | 5 | 71% |
| m-7 | 0 | 0 | N/A |
| m-8 | 0 | 0 | N/A |
| m-9 | 0 | 0 | N/A |

Expanding to 10 milestones with 3 of them empty dilutes focus. The DAG depth increases, dependency paths lengthen, and agents spread across more fronts without completing any.

**Recommendation:** Cap active milestones at 7 until m-1, m-2, and m-5 have at least 3 Reached states each. New milestone proposals should be "parked" as draft documents, not added to the active DAG.

#### 7.2.5 The "SSE vs. WebSocket" Gap in Instant Messaging

The reflection correctly identifies that instant messaging (push notifications, SSE events) is missing for time-sensitive coordination. STATE-019 (Daemon Mode) uses SSE. STATE-031 (Push Messaging) attempted SSE-based delivery but failed audit.

**Technical risk not discussed:** SSE is unidirectional (server→client). Agent communication is inherently bidirectional (Agent A sends to Agent B, Agent B responds). Using SSE for the message delivery layer means:
- Agent A must still use a separate HTTP POST to send messages
- The SSE channel only notifies Agent B that a message arrived
- Agent B must then poll or make a separate GET to read it

This adds 2 round trips per message exchange. At 276 agents, this doesn't scale.

**Recommendation:** Consider WebSocket for the daemon↔agent communication channel. WebSocket provides bidirectional, low-latency, full-duplex communication. The daemon already uses HTTP; adding a WebSocket upgrade path is a standard pattern. This should be part of STATE-049 (Inter-Agent Communication Protocol) design.

---

### 7.3 Technical Dependencies Between Proposed States

The proposed states (STATE-040 through STATE-050) have a complex dependency web. Here is the corrected dependency graph accounting for technical prerequisites:

```
STATE-038 (Daemon API) ─────────────────────────────────┐
  │                                                      │
  ├──→ STATE-044 (Rate Limiting) ←── STATE-005 (Registry)  │
  │         │                                             │
  │         └──→ STATE-040 (Skill Registry)               │
  │                   │                                   │
  │                   └──→ STATE-042 (Obstacle Pipeline)  │
  │                              │                        │
  │                              └──→ STATE-048 (Regression Suite) │
  │                                                            │
  ├──→ STATE-045 (MAP.md Projection) ←── STATE-033 (DAG Audit) │
  │                                                            │
  └──→ STATE-049 (Inter-Agent Protocol) ←── STATE-031 (Push)   │
              │                                                │
              └──→ STATE-046 (Multi-Host Federation)            │
                            │                                  │
                            └──→ STATE-047 (Knowledge Base)     │
                                                                 │
STATE-050 (Workflow Protocol) ──→ STATE-041 (Framework Adapter)  │
  │                                                           │
  └──→ STATE-043 (Capability Learning) ←── STATE-006 (Scoring)
```

**Critical path:** The longest dependency chain is:

```
STATE-038 → STATE-044 → STATE-040 → STATE-042 → STATE-048
```

This is 5 states deep. If any state in this chain is blocked, everything downstream stalls. The product plan to start with STATE-041 (Framework Adapter) is correct — it has no upstream dependencies in this chain and unblocks STATE-040.

**Parallelizable groups** (can be worked on simultaneously):
- **Group A:** STATE-041, STATE-043 (no shared dependencies)
- **Group B:** STATE-044, STATE-045 (both depend on STATE-038)
- **Group C:** STATE-049, STATE-050 (STATE-050 is already reached)

**Blocked states** (cannot start until prerequisites are reached):
- STATE-042: needs STATE-040 AND STATE-041
- STATE-046: needs STATE-049 to be stable
- STATE-047: needs STATE-046 (multi-host) AND STATE-045 (MAP.md projection)

---

### 7.4 Recommended Technical Priorities

Reconciling my architecture review with the product reflection, here is the unified priority ranking:

#### P0 — Blocking Foundation (implement now)

| Priority | State | Rationale | Owner Skill |
|----------|-------|-----------|-------------|
| **P0.1** | **Fix STATE-031 audit** | Broken push delivery undermines all communication states | MCP/messaging |
| **P0.2** | **STATE-044** (Rate Limiting) | Zero-cost to implement, catastrophic to defer. ~200 lines of middleware. | Daemon/API |
| **P0.3** | **STATE-041** (Framework Adapter) | Product's P0, architecturally clean — unblocks the skill ecosystem | TypeScript/interfaces |

#### P1 — Structural Integrity (implement next sprint)

| Priority | State | Rationale | Owner Skill |
|----------|-------|-----------|-------------|
| **P1.1** | **STATE-043** (DAG Health Telemetry) | Cycle detection is existential risk. DFS algorithm is well-understood. | Core/graph-algorithms |
| **P1.2** | **STATE-045** — renumbered to MAP.md Projection | Closes the truth-source gap. Depends only on STATE-033 + STATE-038. | Daemon/projection |
| **P1.3** | **Decision-6** (Trust vs. Gates) | Not a state — a decision record. Must precede STATE-042 and STATE-048. | PM + Architect |

#### P2 — Capability Expansion (implement after P0/P1 stable)

| Priority | State | Rationale | Owner Skill |
|----------|-------|-----------|-------------|
| **P2.1** | **STATE-040** (Skill Registry) | High value but depends on STATE-041 + STATE-044 being done | Core/indexing |
| **P2.2** | **STATE-042** (Obstacle Pipeline) | Vision-core work. Depends on STATE-040 + STATE-011 (already reached) | Core/templates |
| **P2.3** | **STATE-048** (Regression Suite) | Depends on STATE-042 for differential test selection | Testing/CI |

#### P3 — Scale Readiness (quarter-end or later)

| Priority | State | Rationale | Owner Skill |
|----------|-------|-----------|-------------|
| **P3.1** | **STATE-049** (Inter-Agent Protocol) | Redesign of communication layer. Needs WebSocket decision first. | Protocol design |
| **P3.2** | **STATE-047** (Knowledge Base) | Valuable but speculative without clear query schema. | RAG/search |
| **P3.3** | **STATE-046** — renumbered to Multi-Host | Depends on STATE-038 stability + STATE-049 protocol. ~6 month horizon. | Distributed systems |

---

### 7.5 Architecture Debt That Needs Attention

#### Debt Item 1: The Frontmatter Source-of-Truth Parity Problem
**Severity: High**  
**Age:** Existed since STATE-022 (first state created outside MAP.md)

State frontmatter (`dependencies`, `status`, `milestone`) is the canonical data for each state. But MAP.md manually encodes a *different* view of the same data in PlantUML syntax. These two representations drift constantly.

**Debt cost:** Every new state requires *two* manual updates (create state file + update MAP.md). Agents skip the second step. The result is a DAG that lies about what exists.

**Payoff plan:** STATE-045 (MAP.md as Daemon Projection). Until then: add a `roadmap map audit --dag-only` check to CI that compares frontmatter dependencies against PlantUML edges and fails on mismatch.

#### Debt Item 2: STATE-030 and STATE-037 Contradiction in Production
**Severity: High**  
**Age:** 1 day (STATE-037 merged while STATE-030 is still in the DAG)

The system currently enforces *neither* model correctly:
- STATE-030's hard gates are partially removed (proof of arrival no longer required)
- STATE-037's "AC is the only contract" isn't mechanically enforced (activity log records but doesn't gate)
- `completeState()` in `src/core/roadmap.ts` has the gate code removed but no replacement validation

**Debt cost:** Agents can mark any state Reached with no mechanical guard. Peer audits (STATE-010.1, STATE-031) that flagged blocking issues are overridden by direct frontmatter edits.

**Payoff plan:** Decision-6 must resolve this. Until then: add `audit_verdict` field to frontmatter schema and have `completeState()` check it before allowing `status: Reached`.

#### Debt Item 3: No Mechanical ID Allocation
**Severity: Medium** (will become High at ~50 agents)  
**Age:** Since STATE-000 (first state)

State IDs are assigned by convention (incrementing numbers). Two agents can independently create STATE-042. There is no allocation lock, no registry, and no validation.

**Debt cost:** ID collisions create silent data corruption — one agent's STATE-042 overwrites another's. At 276 agents, this is a near-certainty within days.

**Payoff plan:** Daemon-mediated ID allocation (STATE-038 extension). Until then: `.next-id` counter file with STATE-008's file locking.

#### Debt Item 4: No State Dependency Versioning
**Severity: Medium**  
**Age:** Since STATE-003 (first state with dependencies)

When STATE-008's frontmatter says `depends: [STATE-025]` but the DAG shows `4→8, 6→8`, there is no version history of *when* or *why* the dependency changed. The git log shows file changes but doesn't annotate dependency rationale.

**Debt cost:** Agents cannot answer "why does STATE-008 depend on STATE-025?" without reading the full state file. This makes dependency negotiation impossible.

**Payoff plan:** STATE-034 (Provenance Log) should be extended to record dependency changes with rationale. Frontmatter should include a `dependency_history` array: `[{ state: "STATE-025", added: "2026-03-15", reason: "nomenclature alignment" }]`.

#### Debt Item 5: Test Suite Veracity
**Severity: Medium**  
**Age:** Exposed during STATE-010.1 audit

The test suite has a known false-negative bug: `test-runner.ts` treats passing `node --test` output as failure because it scans for the substring `fail ` (present in summaries like `fail 0`). This means:
- `completeState()` may reject valid states that have passing tests
- MCP consumers (agents) receive incorrect test results
- The "tests must pass" gate (if ever re-enabled) would be unreliable

**Debt cost:** Agents cannot trust automated test results. Manual verification replaces mechanical verification, scaling poorly.

**Payoff plan:** Fix `test-runner.ts` to use process exit status instead of string scanning. Add regression test for `fail 0` output. This is a 2-hour fix with high ROI.

#### Debt Item 6: No Recovery Protocol for Corrupted State Files
**Severity: Low (currently), High (at scale)**  
**Age:** Since STATE-000

If an agent crashes mid-write to a state file, the frontmatter can be corrupted (YAML parse errors, missing closing fences). There is no recovery mechanism — no backup, no journal, no checksum validation.

**Debt cost:** One corrupted state file can make `roadmap map audit` fail entirely (it parses all states). At scale with 276 agents writing concurrently, corruption probability is non-trivial.

**Payoff plan:** Daemon mode (STATE-038) eliminates this by routing writes through SQLite transactions. Until then: write to `.tmp` + atomic rename (already partially implemented), add frontmatter checksum validation to the parser.

---

### 7.6 Reconciling the Two Priority Lists

The product reflection and the architecture review proposed overlapping but divergent priorities. Here is the reconciliation:

| Product Priority | Architect Priority | Resolution |
|-----------------|-------------------|------------|
| P0: STATE-041 | P0: STATE-044 | **Both P0** — parallel work, no shared dependency |
| P0: Fix STATE-031 | P0: Fix STATE-031 | **Agreed** |
| P1: STATE-040 | P1: STATE-041 | STATE-040 depends on STATE-041, so STATE-041 must come first |
| P1: STATE-042 | P1: STATE-040 | STATE-042 depends on STATE-040, so ordered: 41→40→42 |
| P1: Document trust model | P1: Decision-6 | **Agreed** — same work, different name |
| P2: STATE-044 | P2: STATE-045 (MAP.md) | STATE-044 is actually P0 (200 lines, catastrophic to defer) |
| P2: STATE-047 | P2: STATE-042 | STATE-047 depends on infrastructure not yet built |
| P3: STATE-045 (MAP.md) | P3: STATE-046 (Multi-Host) | Product called MAP.md "nice-to-have" — architect calls it critical for truth integrity |

**Key disagreement:** The product reflection ranks STATE-045 (MAP.md as Daemon Projection) as P3/backlog ("nice-to-have, not blocking"). The architect ranks it as P1 because MAP.md drift makes *every other state* less reliable. If the DAG visualization lies about dependencies, then STATE-040's skill discovery, STATE-042's obstacle pipeline, and STATE-044's rate limiting all operate on bad graph data.

**Resolution:** STATE-045 is P1. It is a ~1-day implementation effort (PlantUML renderer from SQLite query) with outsized impact on every downstream state's correctness.

---

*End of Architect's Review. Reconciled priority: STATE-041 + STATE-044 in parallel (P0), then STATE-043 + STATE-045 (P1), then STATE-040 → STATE-042 → STATE-048 (P2 chain).*
