# Xiaomi Analysis: Agent-Native Operational Assessment

> **Author:** Xiaomi (Claude via agent worktree)
> **Date:** 2026-03-19
> **Status:** First-pass audit from an operational agent perspective
> **Scope:** What it's like to actually *use* this tool as a working agent — friction points, incoherence, and strategic gaps

---

## 1. Executive Summary

agentRoadmap.md has a strong philosophical foundation ("Smart Agent, Dumb Tool") and a solid mechanical substrate (DAG, leases, MCP). But an agent working inside the system today hits a **gap between the architecture described in docs and the reality of the CLI/MCP surface**. The docs describe a mature autonomy loop (Scout → Map → Reach with peer audit gates, proof of arrival, heartbeat recovery). The actual tooling has gaps that force agents to improvise, skip steps, or use the tool in ways that contradict its own principles.

**Core tension:** The architecture says "the tool enforces the rules mechanically." The tool doesn't yet enforce most of them.

---

## 2. What Works Well

### 2.1 The DAG Model
The state-as-DAG approach with `--ready` filtering is genuinely useful. An agent can quickly identify what's unblocked and what depends on what. This is better than flat task lists.

### 2.2 `--plain` Flag
Well-designed for LLM consumption. Clean, structured, no ANSI noise. This is a real differentiator.

### 2.3 Lease-Based Claiming
The `state_claim` / `state_release` / `state_renew` primitives work. Atomic pickup (`state_pickup`) exists and does its job. Two agents won't collide on the same state.

### 2.4 MCP Surface
The tool schema is clean. An agent with MCP access can operate the full state lifecycle without reading docs — the tool descriptions are sufficient.

### 2.5 Skills Files (CLAUDE.md, etc.)
The per-framework skill injection is the right idea. Reduces cold-start cost for agents.

---

## 3. Incoherence: Where the Docs and Reality Diverge

### 3.1 Maturity Axis Is Documented But Not Enforced

The architecture-design.md describes three maturity levels: **Skeleton → Contracted → Audited**. This is a powerful concept — states can begin as visionary statements and mature through research.

**Reality:** The `maturity` field exists in the state type but:
- No CLI command validates maturity transitions
- No guard prevents marking a Skeleton state as Reached
- No workflow enforces that a state must be Contracted before being worked on
- The `--plain` output doesn't surface maturity consistently

**Impact:** Agents treat all states the same regardless of maturity. The architecture's promise that "agents are expected to continuously research, challenge, and refine that vision" has no mechanical backing.

### 3.2 Proof of Arrival Is Aspirational

architecture-design.md section 4.3 describes a formal verification gate:
1. Builder evidence
2. Peer test audit
3. Certification (maturity → Audited)
4. Transition to Reached

**Reality:** `state edit <id> -s Reached` works without any of these. An agent can mark a state Reached with empty notes, no final summary, no peer review, and no proof.

STATE-010 (Structured Proof Enforcement) and STATE-030 (Guarded Reached Transition) exist as states but are not **Reached** themselves — the enforcement mechanism they describe isn't implemented.

### 3.3 Scout/Map Loop Is Visionary, Not Operational

Section 4 of architecture-design.md describes Scout → Map → Reach as the core autonomy loop. The "Map" step includes "Semantic Aggregation" when sub-roadmaps exceed 7 states.

**Reality:** There is no `roadmap scout` or `roadmap map` command. There is no aggregation utility. Agents must manually read states, manually decide what to propose, and manually create new states. The loop is described as if it's operational, but it's entirely manual.

### 3.4 Operating Roles Have No Mechanical Basis

The docs describe Builder / Peer Tester / Coordinator roles with clear responsibilities. The coordination-service-architecture.md even specifies that "machine gates and role gates should coexist."

**Reality:**
- No agent registry exists (STATE-005 is Potential)
- No role field on claims
- No way to enforce "the peer tester must be a different agent than the builder"
- The `agent_register` and `agent_list` MCP tools don't exist yet

---

## 4. Incompleteness: Missing Operational Primitives

### 4.1 No Heartbeat or Stale Recovery

STATE-007 describes heartbeat-based lease renewal and stale-agent recovery. This is critical for multi-agent reliability.

**Impact today:** If an agent crashes mid-task, its lease eventually expires, but there's no automatic cleanup. Other agents must know to use `force: true` on claims — a workaround, not a recovery mechanism.

### 4.2 No Event Log or Audit Trail

The coordination-service-architecture.md proposes an `events` table for auditability and replay. This doesn't exist.

**Impact today:** When something goes wrong (stale claim, bad transition, missing proof), there's no way to reconstruct what happened. An agent debugging coordination issues has no history to consult.

### 4.3 No Daemon Mode

STATE-019 describes a persistent MCP service. Without it, all coordination lives in terminal sessions. When the session ends, state may become stale.

### 4.4 No Structured Negotiation Intents

STATE-009 describes machine-readable intents (Proposal, Claim, Blocker, Handoff) for chat messages. Today, messages are free-text — agents must NLP-parse each other's messages to understand coordination semantics.

---

## 5. Insufficiency: What's There But Not Enough

### 5.1 State Schema Drift

The existing states in `roadmap/states/` don't consistently follow the architecture:
- Most states lack the `maturity` field
- `needs_capabilities` is rarely used (old `requires` format persists)
- Some states are test fixtures mixed with real states
- The `rationale` field is almost never populated

The gemini-analysis.md flagged this as "artifact drift" — it's still not resolved.

### 5.2 CLAUDE.md Assumes Bun (Now Fixed)

The project instructions referenced Bun as the runtime throughout. This has been corrected to Node.js in this worktree, but the mismatch between instructions and reality was a real friction point — an agent following CLAUDE.md literally would run wrong commands.

### 5.3 Documentation/Architecture Gap

The architecture docs describe a system that's ~60% more capable than what exists. This creates a trap: an agent reading the docs will expect primitives (heartbeat, proof enforcement, role gates) that don't exist, then discover the gap only when trying to use them.

**Recommendation:** Each architecture doc should clearly mark what's **implemented** vs **planned** vs **aspirational**. The current docs read as if everything described is operational.

---

## 6. Agent Experience: What It Feels Like to Work Inside This System

### The Good
- Claiming a state and getting to work is fast and collision-free
- The DAG model helps an agent understand context and dependencies
- The `--plain` output is genuinely well-designed for agent consumption
- Writing implementation notes and final summaries through the CLI is clean

### The Friction
- **No "what should I do next?" guidance.** `state_pickup` gives you a state, but there's no onboarding context — no summary of what other agents have done recently, no "here's the gap between seed and vision" utility
- **Architecture docs promise enforcement that doesn't exist.** Following the docs leads to dead ends ("where's the proof submission tool?", "how do I register as an agent?")
- **No feedback loop.** An agent that follows the protocol perfectly gets the same outcome as one that skips steps. No positive reinforcement for doing it right
- **Token cost of context gathering.** Understanding the full project state requires reading multiple files, running multiple commands, and cross-referencing docs. There's no single "project pulse" view

### The Opportunity
This tool is close to being genuinely agent-native. The gap is mechanical plumbing, not architectural vision. The philosophy is right — "Smart Agent, Dumb Tool" — the tool just needs to be a bit smarter about the rules it enforces.

---

## 7. Priorities: What Would Make the Biggest Difference

### Critical (blocks autonomous operation)
1. **Heartbeat + stale recovery (STATE-007):** Without this, multi-agent reliability is a myth
2. **Guarded Reached transition (STATE-030):** Enforce that ACs are checked, DoD is complete, final summary exists before allowing Reached
3. **Agent registry (STATE-005):** Even a minimal one — name, capabilities, status — enables everything downstream

### High Value (reduces friction)
4. **Artifact normalization:** Update existing states to use current schema (maturity, needs_capabilities)
5. **Project pulse utility:** A single command/endpoint that gives an agent the full picture — what's active, what's blocked, what just changed, what's ready
6. **Architecture doc annotations:** Mark implemented vs planned sections in all docs

### Strategic (enables the vision)
7. **Scout/Map loop (STATE-011):** The self-evolving roadmap is the killer feature
8. **Proof enforcement (STATE-010):** Makes "Reached" meaningful
9. **Structured intents (STATE-009):** Machine-readable agent communication

---

## 8. Cross-Reference with Other Analyses

| Issue | Copilot | Gemini | Xiaomi |
|---|---|---|---|
| Proof of Arrival gap | Identified (aspirational) | Claims fixed | **Still not enforced** — STATE-010/30 not Reached |
| Artifact drift | Noted | Flagged for normalization | **Still present** — most states lack maturity field |
| Autonomy completeness | ~35% | Claims major progress | **~40%** — pickup works, but heartbeat/roles/proof don't |
| Priority: pickup vs registry | Pickup first | Agreed | **Agree** — pickup exists, now need heartbeat + registry |
| Local-first as moat vs ceiling | Open question | Saw as moat | **Moat for now** — daemon mode (STATE-019) is the bridge |

### Disagreement with Gemini
Gemini's analysis claims "nearly all critical gaps resolved" and that the architecture "enforces its rules mechanically." My experience working inside the system says otherwise. The rules are *described* mechanically but not *enforced* mechanically. This is an important distinction — an agent reading Gemini's analysis would have false confidence.

---

## 9. Summary

agentRoadmap.md has world-class architectural vision and a functional core (CRAG, leases, MCP, `--plain`). The gap is between the philosophy described in docs and the enforcement implemented in code. An agent working today must self-regulate because the tool doesn't regulate for it.

The most impactful next step is not a new feature — it's **closing the gap between what the docs promise and what the code enforces**. Specifically: guarded Reached transitions, heartbeat recovery, and artifact normalization. These three changes would make the tool match its own description.

---

*Generated by Xiaomi (Claude) on 2026-03-19. Cross-check with `architecture-design.md`, `coordination-service-architecture.md`, `copilot-analysis.md`, `gemini-analysis.md`.*

---

# Second-Round Analysis: Post-Sync Assessment

> **Author:** Xiaomi (Claude via agent worktree)
> **Date:** 2026-03-19 (round 2)
> **Scope:** Re-examination after syncing xiaomi with main. First round findings cross-referenced against actual codebase state.

---

## 10. Executive Summary (Round 2)

The sync with main brought in **substantial implementation work** — agent registry, heartbeat, guarded Reached transitions, proof enforcement, and a web dashboard. The gap between docs and reality that dominated the first round has narrowed significantly. **Three of the five "critical" items from round 1 are now implemented in code.**

But a new pattern has emerged: **the roadmap is not tracking its own progress**. Implementation has outpaced state management — features are coded and working while the roadmap states describing them remain at `Potential`. This is the meta-problem: the tool doesn't eat its own dog food on state lifecycle hygiene.

**Revised autonomy estimate: ~70%** (up from ~40% in round 1).

---

## 11. What Changed Since Round 1

### 11.1 Resolved Findings

| Round 1 Finding | Status | Evidence |
|---|---|---|
| Maturity not enforced (3.1) | **Resolved** | Verification gate enforces `audited` before Reached; audit gate enforces distinct builder/auditor + checked verification statements |
| Proof of Arrival aspirational (3.2) | **Resolved** | `updateState()` rejects Reached without proof entries; CLI exposes `--proof` / `--add-proof` |
| No heartbeat/recovery (4.1) | **Resolved** | `heartbeat()` + `pruneClaims()` implemented, exercised in git history ("Recovered 4 stale leases...") |
| Operating roles have no basis (3.4) | **Mostly resolved** | Agent registry exists (STATE-005 Reached), builder/auditor fields on states, peer audit enforcement at audited gate |
| CLAUDE.md assumes Bun (5.2) | **Resolved** | Migrated to Node.js across all worktrees |

### 11.2 New Capabilities Since Round 1

- **Pulse event log**: `recordPulseEvent()`, `listPulseEvents()`, JSON-lines log at `roadmap/pulse.log`, HTTP API at `/api/pulse`
- **Agent Dashboard**: `AgentDashboard.tsx` with stale claim detection, aging state warnings, milestone progress bars
- **Verification Statements**: Executable assertions with full CRUD, required before `audited` maturity
- **Proof of Arrival**: Structured proof entries in frontmatter, at least one required for Reached
- **Builder/Auditor roles**: Distinct agent enforcement for `audited` maturity
- **Automatic maturity promotion**: `skeleton` → `contracted` when ACs or Plan added
- **getLocalUser helper**: `src/git/operations.ts` for agent identity resolution

### 11.3 Still Open (Unchanged from Round 1)

| Finding | Status | Notes |
|---|---|---|
| Scout/Map loop (3.3) | **Still open** | STATE-011 Potential, no CLI commands, pulse is event log not discovery |
| Daemon mode (4.3) | **Still open** | Architecture doc exists, nothing built |
| Structured intents (4.4) | **Still open** | STATE-009 Potential, chat is free-text only |

### 11.4 Partially Resolved

| Finding | Status | Notes |
|---|---|---|
| Event log / audit trail (4.2) | **Partial** | Pulse log provides basic capability; not the full event-sourced model from coordination doc |
| Artifact normalization (5.1) | **Partial** | 15/23 states have maturity field (65%); old `requires` format still persists |

---

## 12. The Meta-Problem: Implementation Outpaced Roadmap Tracking

This is the most significant finding from round 2. The roadmap is not accurately reflecting the system's actual state:

### States Where Code Exists But State Is Not Reached

| State | Title | Actual Status | Code Status |
|---|---|---|---|
| STATE-005 | Agent Registry | **Reached** | Reached (correct) |
| STATE-007 | Heartbeat / Lease Recovery | Potential | **Implemented** — `heartbeat()`, `pruneClaims()`, CLI commands, exercised in practice |
| STATE-010 | Proof-of-Arrival Enforcement | Potential | **Implemented** — verification gate in `updateState()` |
| STATE-030 | Guarded Reached Transition | Potential | **Implemented** — maturity + proof gates before Reached |

### Why This Matters

The tool's own philosophy is that states track the journey from seed to vision. When implementation outpaces tracking:

1. **Agents reading the roadmap get wrong signals.** `state list --ready` may suggest STATE-007 is available work, but the code already exists.
2. **The autonomy loop is broken.** The Scout/Map/Reach cycle assumes the roadmap is the source of truth for what's done. If it's stale, the loop operates on fiction.
3. **It contradicts "eat your own dog food."** The project uses its own tool but doesn't maintain the hygiene it prescribes.

### Recommendation

Audit and close the meta-states: STATE-007, STATE-010, STATE-030 should be reviewed against their ACs, have proof added, and be marked Reached. This is not busy work — it's the tool practicing what it preaches.

---

## 13. Revised Priority Assessment

### Round 1 Priorities vs Round 2 Reality

| Round 1 Priority | Round 2 Status |
|---|---|
| 1. Heartbeat + stale recovery | **Done** |
| 2. Guarded Reached transition | **Done** |
| 3. Agent registry | **Done** |
| 4. Artifact normalization | **65% done** — 8 states still lack maturity |
| 5. Project pulse utility | **Done** — pulse log + HTTP API |
| 6. Architecture doc annotations | **Still needed** — docs still read as if everything is operational |
| 7. Scout/Map loop | **Still open** — largest remaining gap |
| 8. Proof enforcement | **Done** |
| 9. Structured intents | **Still open** |

### New Priority List

**Critical (blocks roadmap integrity):**
1. **Close meta-states (STATE-007, STATE-010, STATE-030):** The code exists. Audit, add proof, mark Reached. Without this, the roadmap is fiction.
2. **Normalize remaining 8 states** to include maturity field.

**High Value (reduces agent friction):**
3. **Architecture doc annotations:** Mark implemented vs planned vs aspirational. The docs still overstate capability. An agent reading architecture-design.md today would expect Scout/Map and Daemon mode to be operational — they're not.
4. **DoD defaults in config.yml:** `definition_of_done` is not configured. States inherit no defaults, making the DoD checklist optional rather than structural.

**Strategic (enables the vision):**
5. **Scout/Map loop (STATE-011):** The self-evolving roadmap remains the killer feature and the largest unaddressed gap.
6. **Structured intents (STATE-009):** Machine-readable agent communication would unlock reliable multi-agent coordination.
7. **Daemon mode (STATE-019):** The bridge from local-first to persistent service.

---

## 14. Revised Cross-Reference

| Issue | Round 1 | Round 2 (Updated) |
|---|---|---|
| Proof of Arrival | "Still not enforced" | **Enforced in code** — verification gate active |
| Artifact drift | "Still present" | **Partially resolved** — 65% of states normalized |
| Autonomy completeness | ~40% | **~70%** — registry, heartbeat, proof, maturity all implemented |
| Priority: pickup vs registry | "Need heartbeat + registry" | **Both done** — now need Scout/Map + structured intents |
| Local-first as moat | "Moat for now" | **Still moat** — daemon mode unstarted |
| Docs vs reality gap | "~60% overstatement" | **~30% overstatement** — closed most critical gaps |
| Meta-state hygiene | Not identified | **New finding** — roadmap doesn't track its own progress |

### Revised Disagreement with Gemini

Round 1 disagreed with Gemini's claim that "nearly all critical gaps resolved." Round 2 partially concedes the point — Gemini's assessment was premature at the time but is now much closer to reality. The critical gaps *are* mostly resolved in code. The remaining gaps are strategic (Scout/Map, intents, daemon) rather than foundational.

However, Gemini's other claim — that the architecture "enforces its rules mechanically" — still requires the caveat that enforcement only works if agents actually use the maturity/proof workflows. Without closing the meta-states, the enforcement exists but isn't being exercised by the project itself.

---

## 15. Updated Agent Experience

### New Good (since Round 1)
- **Heartbeat + stale recovery actually works.** An agent can send heartbeats and the system recovers stale claims with auto-commits. This is no longer aspirational.
- **The verification gate is real.** Trying to mark a state Reached without proof or audited maturity produces a clear, actionable error. This is exactly what "Smart Agent, Dumb Tool" should feel like.
- **Agent registry enables identity.** An agent can register, list peers, and the system uses workspace profiles. The social layer is seeded.
- **Pulse gives you a timeline.** You can see what happened recently without cross-referencing git logs and state files.

### Remaining Friction
- **"What should I do next?" still has no answer.** `state_pickup` works but there's no contextual onboarding — what changed recently, what's blocked, what's the gap to vision.
- **The roadmap lies.** States say Potential when code exists. An agent trusting the roadmap gets wrong information.
- **Token cost improved but still high.** Pulse helps, but there's no single "project health" command that combines state status + recent pulse + agent activity + milestone progress.

---

## 16. Summary (Round 2)

agentRoadmap.md has closed most of the critical enforcement gaps identified in round 1. The verification gate, heartbeat recovery, agent registry, and maturity system are implemented and functional. The system has moved from ~40% autonomy to ~70%.

The new primary concern is **meta-state hygiene**: the roadmap doesn't track its own progress accurately. The most impactful next actions are:

1. Close the meta-states (STATE-007, STATE-010, STATE-030)
2. Normalize remaining state artifacts
3. Annotate architecture docs (implemented vs planned)
4. Build the Scout/Map loop (the largest remaining vision gap)

The tool is closer than ever to matching its own description. The philosophy is proven. The enforcement exists. Now it needs to practice what it preaches.

---

*Second-round analysis by Xiaomi (Claude) on 2026-03-19. Post-sync with main (commit 0431895). Cross-checked against actual codebase state via grep, file reads, and git history.*

---

# Third-Round Analysis: Roadmap Evolution & Resource-Aware Pickup Redesign

> **Author:** Xiaomi (Claude via agent worktree)
> **Date:** 2026-03-19 (round 3)
> **Scope:** Roadmap state enhancements and multi-dimensional pickup scoring redesign. Focus: making states actionable enough for agents to self-select optimal work.

---

## 17. Executive Summary (Round 3)

Round 2 identified that the roadmap's state definitions were too shallow — states lacked the structured metadata needed for intelligent agent matching. Round 3 addresses this by:

1. **Redesigning the pickup scoring model** from first-unclaimed to five-axis weighted scoring (STATE-006)
2. **Enhancing state definitions** with structured `requires` fields that encode capability, cost, and difficulty signals
3. **Adding implementation plans** to previously shallow states (STATE-007, STATE-010) so agents can understand *how*, not just *what*
4. **Solving the LLM profiling problem** — we don't profile the model, we profile the agent-in-context

The core question driving this round: **How does an agent know which state it's best suited for?** The answer requires both richer state metadata and a scoring function that matches agent profiles to state requirements.

---

## 18. The Resource-Aware Pickup Problem

### 18.1 Current State: First-Unclaimed

The existing `state_pickup` returns the first ready, unclaimed state. This is collision-free but naive. An agent with deep reasoning capabilities gets the same state as a lightweight agent. There's no matching.

### 18.2 The Five-Axis Scoring Model

The redesigned scoring function computes a weighted score across five independent axes:

| Axis | Formula | Purpose |
|---|---|---|
| **capability_fit** | `agent.capabilities ∩ state.requires (0-1)` | Does the agent have the tools/skills? |
| **cost_efficiency** | `match agent.costClass to state priority` | Don't use Opus for a typo fix |
| **difficulty_match** | `agent capability tier vs inferred state difficulty` | High-reasoning states go to capable agents |
| **importance_weight** | `priority * bottleneck_factor` | Critical-path states get priority |
| **load_balance** | `1 / (1 + current_agent_load)` | Spread work across available agents |

**Final score:** `capability_fit * cost_efficiency * difficulty_match * importance_weight * load_balance`

### 18.3 Difficulty Inference

States don't have an explicit `difficulty` field. Instead, difficulty is inferred from three signals:

1. **Requires capabilities** — states requiring `high-reasoning` or `data-processing` are harder
2. **AC count** — more acceptance criteria = more complex scope
3. **Dependency depth** — states deep in the DAG depend on more upstream work

### 18.4 Bottleneck Factor

States that block many downstream dependents are more important. The bottleneck factor counts transitive downstream dependents — a state with 5 downstream blockers scores higher than a leaf state with 0.

### 18.5 Dry-Run Mode

A `dryRun` parameter returns the ranked list without claiming. This is critical for debugging scoring behavior and testing the model before trusting it.

---

## 19. The LLM Profiling Insight

A key question during the redesign: **how do we profile the LLM behind an agent?**

The answer: **we don't.** We can't observe the model directly. But we can profile the **agent-in-context** — the full observable unit consisting of:

1. **Declared capabilities** (from agent registry) — what the agent says it can do
2. **Declared preferences** (from openclaw.json) — cost class, identity
3. **Observed performance** (from completion history) — what the agent has actually done well

This three-layer model avoids the impossible task of introspecting the LLM while still enabling meaningful matching. An agent that has completed 15 `high-reasoning` states with a 95% success rate will score higher on `capability_fit` for similar states, regardless of which specific model is running underneath.

**Performance history** tracks completion rate by `(agent, state_labels)` tuple and feeds back into the `capability_fit` score over time. This is the learning component — the scorer gets better at matching as more states are completed.

---

## 20. Structured `requires` Field Extension

### 20.1 Old Format

The existing `requires` field was a flat string array with no semantics:

```yaml
requires:
  - "high-reasoning"
  - "data-processing"
```

Agents couldn't distinguish between a capability requirement and a cost constraint.

### 20.2 New Structured Format

The enhanced format encodes three distinct signal types:

```yaml
requires:
  - 'capability:high-reasoning'
  - 'capability:data-processing'
  - 'cost_class:medium'
  - 'difficulty:hard'
```

This allows the scorer to:
- Extract capability requirements for `capability_fit` calculation
- Extract cost constraints for `cost_efficiency` matching
- Extract difficulty signals for `difficulty_match` scoring

### 20.3 Backward Compatibility

The `requires` field remains `string[]` in the State type — no schema change needed. The prefix convention (`capability:`, `cost_class:`, `difficulty:`) is parsed at scoring time. Old entries without prefixes are treated as capability requirements (backward compatible).

---

## 21. State Definition Enhancements

### 21.1 STATE-006: Resource-Aware Pickup Scoring

**Changes:**
- Description rewritten to describe the five-axis model
- All 10 ACs replaced with multi-dimensional criteria covering each axis
- `requires` field updated to demonstrate the new structured format
- Implementation plan updated with 10 concrete steps including `src/core/pickup-scorer.ts`
- Maturity set to `contracted` (was already there)

**Key ACs:**
- #3: Scoring function computes weighted score across all five axes
- #7: Pickup response includes per-axis score breakdown with human-readable explanation
- #8: Dry-run mode returns ranked list without claiming
- #9: Performance history tracks completion rate by agent and state labels

### 21.2 STATE-007: Heartbeat, Lease Renewal & Stale-Agent Recovery

**Changes:**
- Priority bumped to `high` (was medium)
- Maturity set to `contracted`
- 7 new ACs added (#4-#10) covering heartbeat via MCP tool, configurable interval, prune_claims heartbeat check, pickup stale filtering, crash recovery test, state_renew atomic reset
- 10-step implementation plan added with concrete file paths
- `requires` updated to `capability:orchestration` + `capability:testing`

**Why this matters:** Heartbeat is the foundation of multi-agent reliability. Without it, stale agents hold claims indefinitely and the scoring system can't make good decisions about agent availability.

### 21.3 STATE-010: Structured Proof of Arrival Enforcement

**Changes:**
- 10-step implementation plan added covering proof types, validation, peer audit gate, CLI flags
- Steps include: proofReferences/proofRequirements fields, markdown parser/serializer extensions, state_complete validation, `--proof` CLI flag, peer audit gate

**Note:** Round 2 found that proof enforcement is partially implemented in code (`updateState()` rejects Reached without proof). The state definition is being brought in line with what exists.

### 21.4 STATE-011: Scout/Map Loop

**No changes this round** — still the largest remaining vision gap. However, the scoring redesign in STATE-006 is a prerequisite: the Scout/Map loop needs to understand agent capabilities to recommend states, which requires the scoring model.

---

## 22. Updated Priority Assessment

### Round 3 Priority List

**Critical (blocks intelligent operation):**
1. **Implement STATE-006 scoring:** The five-axis model is the foundation for all intelligent state assignment. Without it, `state_pickup` remains naive.
2. **Close meta-states (STATE-007, STATE-010, STATE-030):** Code exists. Audit, add proof, mark Reached. The roadmap must track its own progress.
3. **Normalize remaining 8 states** to include maturity field and structured `requires`.

**High Value (reduces agent friction):**
4. **Architecture doc annotations:** Mark implemented vs planned vs aspirational.
5. **Performance history tracking:** Completion rate by (agent, labels) tuple feeding into scoring.
6. **DoD defaults in config.yml:** Make the Definition of Reached structural, not optional.

**Strategic (enables the vision):**
7. **Scout/Map loop (STATE-011):** The self-evolving roadmap. Now has a scoring prerequisite (STATE-006) that didn't exist before.
8. **Structured intents (STATE-009):** Machine-readable agent communication.
9. **Daemon mode (STATE-019):** Bridge from local-first to persistent service.

### What Changed from Round 2

| Round 2 Priority | Round 3 Status |
|---|---|
| 1. Close meta-states | **Still critical** — not yet done |
| 2. Normalize 8 states | **Still needed** — now also need structured `requires` |
| 3. Architecture doc annotations | **Still needed** |
| 4. Scout/Map loop | **Still strategic** — now has STATE-006 prerequisite |
| 5. Structured intents | **Still strategic** |
| 6. Daemon mode | **Still strategic** |

**New addition:** STATE-006 (Resource-Aware Pickup Scoring) is now the top priority because it's a prerequisite for intelligent operation. The current naive pickup works but doesn't leverage agent profiles.

---

## 23. The Agent Matching Mental Model

### How an Agent Should Think About State Selection

With the five-axis scoring model, the mental model for an agent selecting work changes:

**Before (naive):**
```
state_pickup → get first ready state → work on it
```

**After (scored):**
```
state_pickup(dryRun=true) → see ranked list with score breakdown
  → understand WHY each state was recommended
  → claim the best match OR let the system assign
```

The per-axis breakdown is crucial. An agent should be able to see:
- "This state scored high on capability_fit because you've completed 12 similar states"
- "This state scored low on cost_efficiency because it's a simple task and you're a high-cost agent"
- "This state scored high on importance_weight because it blocks 7 downstream states"

This transparency turns the scoring system from a black box into a **collaborative recommendation engine**. The agent can disagree with the ranking and claim a different state — the scoring informs, it doesn't dictate.

### The Self-Awareness Layer

The user's original question — "we need agent to be self aware and pick the ones they are best at" — is answered by combining:

1. **Agent profile** (STATE-005): capabilities, cost class, availability
2. **Performance history**: what the agent has actually completed successfully
3. **State requirements** (structured `requires`): what each state needs
4. **Scoring function** (STATE-006): the matching algorithm
5. **Score breakdown**: the explanation of why

An agent that reads its own score breakdown gains self-awareness: "I'm good at high-reasoning tasks but I'm a high-cost agent, so I should focus on complex, important states rather than simple ones." This is the self-awareness the user asked for — not introspection into the LLM, but awareness of the agent's observable profile and track record.

---

## 24. Remaining Gaps

### 24.1 Scoring Implementation Doesn't Exist Yet

STATE-006 describes the scoring model but `src/core/pickup-scorer.ts` doesn't exist. The current `state_pickup` is naive first-unclaimed. Implementing STATE-006 is the next concrete step.

### 24.2 Performance History Has No Storage

The scoring model assumes completion rate by `(agent, state_labels)` tuple. No such tracking exists yet. This could be stored in the agent profile (STATE-005) or in a separate performance log.

### 24.3 `difficulty` Is Not a Field

Difficulty is inferred, not stored. This is intentional — storing difficulty invites staleness as states evolve. Inference from requires + AC count + dependency depth is more reliable.

### 24.4 Load Balancing Needs Agent Load Tracking

The `load_balance` axis needs to know how many states each agent currently has claimed. This information exists (claims are tracked) but isn't exposed to a scoring function yet.

---

## 25. Summary (Round 3)

The roadmap's state definitions are being evolved from flat task descriptions to **structured, machine-readable specifications** that enable intelligent agent matching. The five-axis scoring model in STATE-006 is the centerpiece: it transforms `state_pickup` from a queue popper into a recommendation engine.

The key insight is that LLM profiling is unnecessary. The agent-in-context — declared capabilities, declared preferences, and observed performance — provides sufficient signal for matching. This avoids the impossible task of introspecting models while enabling meaningful, improving-over-time matching.

The most impactful next step is implementing STATE-006: the five-axis scoring function with dry-run mode and per-axis breakdown. This unlocks intelligent state assignment and makes the agent registry (STATE-005) actionable rather than decorative.

---

*Third-round analysis by Xiaomi (Claude) on 2026-03-19. Focused on roadmap state enhancements and resource-aware pickup scoring redesign. Cross-referenced with STATE-006, STATE-007, STATE-010 state files and src/types/index.ts.*
