# Copilot Analysis: Architecture & Roadmap Review

> **Author:** GitHub Copilot (GPT-5.4)  
> **Date:** 2026-03-18  
> **Scope:** Review of the architecture, roadmap, decisions, and representative roadmap artifacts.  
> **Update policy:** This file is intended to be updated over time; each revision should be committed locally for traceability.

---

## Executive Summary

`agentRoadmap.md` has a strong architectural core. The project's best idea is still the right one: model product evolution as a **DAG of verifiable states** rather than a flat backlog of tasks.

The roadmap is moving in a promising direction, especially around:

- local-first coordination
- git worktree isolation
- state-based execution
- agent-readable CLI and MCP surfaces

My main conclusion is:

> **The architecture is better than the current artifact hygiene.**

The vision is coherent, but the repository currently shows noticeable drift between strategy docs, the map, decisions, and some live state files. The biggest gap is not the idea itself; it is the lack of consistent enforcement and synchronization.

---

## Artifacts Reviewed

- `README.md`
- `src/guidelines/agent-guidelines.md`
- `roadmap/DNA.md`
- `roadmap/MAP.md`
- `roadmap/GLOSSARY.md`
- `roadmap/ROADMAP_CONTRIBUTING.md`
- `roadmap/docs/architecture-design.md`
- `roadmap/docs/gap-analysis.md`
- `roadmap/docs/gemini-analysis.md`
- `roadmap/decisions/decision-1 - Verification-Decision.md`
- Representative states including:
  - `STATE-003`
  - `STATE-004`
  - `STATE-005`
  - `STATE-010`
  - `STATE-011`
  - `STATE-019`
  - `STATE-020`
  - `STATE-021`
  - `STATE-022`
  - `STATE-025`
  - `state-002`

---

## What Looks Strong

### 1. The core model is differentiated and defensible

`DNA.md`, `GLOSSARY.md`, and `architecture-design.md` all point at the same valuable shift:

- a **State** is not just work to do
- it represents a meaningful system configuration
- it gates reachable futures in the graph

That is a much better abstraction for autonomous agents than a traditional ticket board.

### 2. The local-first collaboration story is credible

The combination of:

- file-based roadmap artifacts
- shared message channels
- git worktree isolation
- MCP exposure

is a genuine strength. It keeps the system inspectable and debuggable while still being agent-friendly.

### 3. The roadmap already has a sensible autonomy spine

The current sequence around:

- `STATE-003` Ready Work Discovery
- `STATE-004` Lease-Based Claiming
- `STATE-005` Agent Registry
- `STATE-006` Resource-Aware Scoring
- `STATE-008` Autonomous Pickup
- `STATE-010` Proof Enforcement

is broadly the right shape. The key missing work is mostly execution and enforcement, not wholesale redesign.

### 4. The philosophical docs are stronger than average

The glossary is useful. The contribution guide is directionally correct. The project clearly understands that:

- blockers should become new graph nodes
- false dependencies are harmful
- discovery and implementation are different forms of progress

That is unusually good.

---

## Main Concerns

### 1. Artifact drift is real

The repo currently contains mixed generations of roadmap artifacts.

Examples:

- `state-002 - milestone definition and alignment.md` uses an older schema and tone than newer state files.
- `roadmap/MAP.md` does not look fully synchronized with the current live state set.
- The high-level docs describe a more mature model than some artifacts actually implement.

This does not mean the architecture is wrong. It means the **operational representation of the architecture is drifting**.

### 2. Proof of Arrival is still more philosophy than contract

This is the biggest integrity gap.

`DNA.md`, `GLOSSARY.md`, and `architecture-design.md` all treat proof and verification as central. But the live roadmap still needs `STATE-010` to make that real.

Current issue:

- there is no clearly enforced structured proof requirement across reached states
- "Reached" can still be stronger in language than in evidence

`STATE-022` is the clearest example of why this matters: its final summary claims broad recovery success, but the acceptance criteria and summary wording suggest the evidence standard is not yet tightly controlled.

### 3. Decision quality is currently too weak

`roadmap/decisions/decision-1 - Verification-Decision.md` is not yet a meaningful ADR. It is too thin to support future reasoning.

If decisions are meant to be first-class architecture artifacts, the project needs real ADR quality:

- context
- alternatives
- trade-offs
- consequences

Right now the decision layer is underpowered relative to the rest of the architecture.

### 4. The model still blurs workflow, maturity, and capability semantics

The docs are aiming toward multiple useful axes:

- workflow status
- maturity
- readiness
- proof
- capabilities

But they are not yet consistently separated in live artifacts.

In particular, there is still conceptual pressure between:

- what a state **requires from an agent**
- what a state **unlocks for the product**

That distinction should stay explicit as the roadmap evolves.

### 5. Reached-state quality is uneven

Some reached states are strong signals of progress, especially `STATE-003`, `STATE-004`, and `STATE-025`.

But the overall quality bar for "Reached" still feels inconsistent. Until proof, summaries, and validation are mechanically enforced, some reached states will remain harder to trust than they should be.

---

## What I Think About the Revised Architecture

Overall: **good revision, not yet fully normalized**.

Gemini appears to have improved the architecture by:

- leaning harder into "State" terminology
- making the autonomy path more explicit
- elevating proof and verification as a core concern
- clarifying the multi-agent coordination story

Those are all good changes.

Where I still think the architecture needs tightening:

1. **Make the verification model canonical, not aspirational.**
2. **Synchronize the map and state inventory mechanically.**
3. **Raise ADR quality to match the architectural ambition.**
4. **Keep roadmap semantics separate from execution metadata.**

So my opinion is not "the revision is wrong." It is:

> **The revised architecture is directionally correct, but the artifacts need stronger discipline to fully support it.**

---

## Recommended Priorities

### Priority 1: Enforce proof properly

Implement `STATE-010` with a real structured proof model and transition guard for `Reached`.

### Priority 2: Re-sync roadmap artifacts

Make sure:

- `MAP.md`
- milestone docs
- state files
- decision docs

all reflect the same current architecture and sequencing.

### Priority 3: Create real ADRs

At minimum, add strong decisions for:

- why DAG over flat task lists
- why local-first filesystem artifacts
- why git worktrees for agent isolation
- what "Reached" must mean mechanically

### Priority 4: Validate roadmap consistency automatically

Add a lightweight consistency check that can catch:

- stale map references
- mixed state schemas
- reached states missing required summary/proof fields
- missing milestone alignment

### Priority 5: Keep the autonomy spine focused

The practical critical path still looks like:

`STATE-005` -> `STATE-006` -> `STATE-008` -> `STATE-010` -> `STATE-007` / `STATE-019`

with `STATE-011` following once the execution and verification loop is solid enough to trust.

---

## Roadmap Update: 2026-03-18

During this architecture conversation, I added a new child state under `STATE-021`:

- `STATE-021.1` — **Multi-Agent Progress Monitoring & Achievement Dashboard**

This captures the observability/dashboard requirements for:

- live agent activity
- time-window activity timelines
- achievement and proof views
- bottleneck/risk visibility
- milestone/theme progress summaries

This is a good addition because it turns a vague "dashboard" idea into a concrete roadmap artifact with explicit acceptance criteria.

One caveat from the current repo state: dependency validation in the active CLI migration appears inconsistent, so the relationship is currently captured through the parent-child roadmap structure and descriptive context rather than validated dependency links.

---

## Bottom Line

I think the architecture is **good enough to keep building on**.

I do **not** think it is yet clean enough to treat the roadmap artifacts themselves as fully authoritative without caution.

If I had to summarize the situation in one sentence:

> **The project has a strong architectural thesis, but it now needs enforcement, synchronization, and better decision records more than it needs another philosophical layer.**

---

# ADDENDUM: Multi-Agent Worktree Concurrency Analysis (Follow-up Review)
**Author:** Analysis Agent (Exploration Mode)  
**Date:** 2026-03-18 (supplementary analysis)  
**Scope:** Deep dive on STATE-001 and STATE-026; safety analysis for concurrent Copilot + Gemini execution

---

## Executive Summary of Findings

After detailed code review of the multi-agent worktree orchestration system, three **intertwined safety concerns** have been identified:

1. **TOCTOU Race in Claim Semantics** (CRITICAL) – Fix complexity: LOW (30 min)
2. **Schema Drift When Worktree Falls Behind Main** (CRITICAL) – Fix complexity: MEDIUM (1 hr)
3. **Symlink Strategy Contradiction** (MEDIUM) – Recommendation: Keep current approach

**Recommended Model:** Option B (Hybrid Approach) – Messages-only symlink + isolated state copies per worktree.

---

## Pain Point 1: TOCTOU Race Condition in claimState()

### Location
`src/core/roadmap.ts:2107-2140` (claimState method)

### The Problem
```typescript
async claimState(stateId, agent, options) {
    const state = await this.fs.loadState(stateId);  // ← RACE WINDOW OPENS
    if (!options?.force && state.claim && state.claim.agent !== agent) {
        if (new Date(state.claim.expires) > now) {
            throw Error("already claimed");
        }
    }
    // ...
    return await this.updateStateFromInput(stateId, { claim });  // ← RACE WINDOW CLOSES
}
```

**Critical Issue:** Between the read and write, another agent in a parallel worktree can claim the same state.

### Real-World Failure Scenario
```
Time T0: Agent-Copilot reads state-1 (no claim)
Time T1: Agent-Gemini reads state-1 (no claim)
Time T2: Agent-Copilot writes claim → state-1.claim = Copilot
Time T3: Agent-Gemini writes claim → state-1.claim = Gemini ← OVERWRITES
Result: Both agents think they own state-1 → data corruption
```

### Why This Happens
- No file-level locking mechanism
- Multiple worktrees share filesystem but have no atomic read-modify-write
- Default claim duration is 60 minutes (long enough to mask timing bugs)

### Fix Complexity
**TRIVIAL** – Add advisory file locking (~30 minutes)

```typescript
// Wrap all claim operations in exclusive lock
return await withFileLock(stateFilePath, async () => {
    const latestState = await this.fs.loadState(stateId);  // Re-read with lock held
    if (latestState.claim && !isExpired(latestState.claim)) {
        throw Error("already claimed by " + latestState.claim.agent);
    }
    // Write claim safely
    return await this.updateStateFromInput(stateId, { claim });
});
```

### Impact on Concurrency
- **With fix:** Race window eliminated; only 1 agent successfully claims state
- **Without fix:** Both agents proceed; unclear which owns state; risk of duplicate work

---

## Pain Point 2: Schema Drift During Shared Roadmap Hub Access

### Location
Related to **STATE-026** ("Worktree CLI Schema Compatibility for Shared Roadmap Hub")  
Root cause: **STATE-025** ("Nomenclature Normalization") refactored `roadmap/nodes/` → `roadmap/states/`

### The Problem
When a feature worktree falls behind main while pointing at a shared roadmap hub:
- Feature branch CLI (v1.9) expects `roadmap/nodes/` structure
- Main branch (v2.0) has migrated to `roadmap/states/` structure
- If worktree symlinks to shared hub: schema mismatch
- `fs.listStates()` pattern doesn't match → returns empty array
- **Silent failure:** Agent reports "no work available" when states exist

### Code Evidence (silent failure)
From `src/file-system/operations.ts` (listStates):
```typescript
const statePrefix = config?.prefixes?.state || "state";
const pattern = new RegExp(`^${escapeRegex(statePrefix)}-.*\\.md$`, "i");
// If pattern doesn't match (wrong directory), silently returns []
```

### Concrete Scenario
```
[main branch] (current)
  roadmap/states/state-1.md
  CLI v2.0 (uses states/)

[feature-agent-1 branch] (diverged 3 days ago)
  Same directory structure physically
  CLI v1.9 (expects states/)

[Shared symlink points to main]

[Worktree at feature-agent-1]
  CLI v1.9 reads from symlink
  Pattern looks for files in expected location
  Files exist but pattern doesn't match due to schema differences
  Result: "No states found" ← SILENT FAILURE
```

### Why This Is Critical
1. **Silent Failure** – No error message; agent thinks roadmap is empty
2. **Coordination Breakdown** – Orchestrator can't tell if agent is done or schema-incompatible
3. **Deadlock Risk** – Multiple agents all report "no ready states" while work sits unclaimed

### Fix Complexity
**MEDIUM** – Add schema compatibility layer (~1 hour)

```typescript
// Detect schema version in roadmap
async function detectSchemaVersion(roadmapDir): Promise<{ major, statesDir }> {
    const statesExists = await fileExists("roadmap/states");
    const nodesExists = await fileExists("roadmap/nodes");
    if (statesExists) return { major: 2, statesDir: "states" };
    if (nodesExists) return { major: 1, statesDir: "nodes" };
    return null;
}

// Fail clearly if mismatch
async function validateSchemaCompatibility(roadmapDir) {
    const cliSchema = { major: 2, statesDir: "states" };  // Current build
    const roadmapSchema = await detectSchemaVersion(roadmapDir);
    
    if (roadmapSchema?.major < cliSchema.major) {
        throw Error(
            "Roadmap schema v1 incompatible with CLI v2. " +
            "Run 'git rebase origin/main' or 'roadmap migrate'."
        );
    }
    return true;
}
```

### Impact on Concurrency
- **With fix:** Clear error message + recovery hint; agent knows what to do
- **Without fix:** Silent deadlock; no visibility into failure

---

## Pain Point 3: Symlink Strategy Contradiction

### Location
`src/commands/orchestrate.ts:117-129`

### The Contradiction
- **STATE-001 Vision:** Full shared `roadmap/` symlink (delete worktree's isolated copy)
- **Current Implementation:** Only `roadmap/messages/` symlinked
- **Gap:** Neither benefit (shared awareness) nor protection (local isolation)

### Why This Matters
```
Approach A: Full Hub Symlink (STATE-001)
  ✅ Single source of truth
  ✅ Real-time claim visibility
  ❌ TOCTOU race affects entire roadmap (not just messages)
  ❌ Schema drift breaks all agents simultaneously
  ❌ Not safe until STATE-026 is resolved

Approach B: Messages-Only + Isolated States (CURRENT)
  ✅ Each worktree has compatible CLI + state copy
  ✅ Schema drift isolated to single agent
  ✅ TOCTOU race window smaller (only messages)
  ✅ Safe to deploy immediately
  ❌ Slightly larger disk footprint
  ❌ No real-time visibility into peer claims (minor)

Approach C: Separate Roadmap Repo
  ✅ Complete isolation
  ✅ No schema drift risk
  ❌ Architectural overhead
  ❌ High coordination complexity

Approach D: No Worktrees (Centralized Coordination)
  ✅ No TOCTOU race (single serialization point)
  ❌ Major architectural change
  ❌ Deviates from "Ghost Identity" strategy
```

### Recommendation
**KEEP CURRENT APPROACH (Approach B)**

This is actually the **correct design** given current constraints. STATE-001 full hub is premature until:
1. TOCTOU race is fixed with advisory locking
2. Schema compatibility layer (STATE-026) is complete
3. Background sync protocol is implemented

---

## Operational Model Comparison

| Aspect | A: Full Hub | B: Hybrid ⭐ | C: Separate Repos | D: Centralized |
|--------|------------|----------|-------------------|----------------|
| TOCTOU Risk | 🔴 Critical | 🟢 Mitigated | 🟢 Mitigated | 🟢 Eliminated |
| Schema Drift | 🔴 Critical | 🟢 Eliminated | 🟡 Mitigated | 🟢 Eliminated |
| Deployment Effort | 🟢 Low | 🟢 Low | 🔴 High | 🔴 High |
| Aligns with STATE-001 | 🟢 Yes | 🟡 Partial | ❌ No | ❌ No |
| Requires STATE-026 | 🔴 Yes (blocker) | 🟢 No | 🟢 No | 🟢 No |
| Can Deploy Today | ❌ No | ✅ Yes | ❌ No | ❌ No |

---

## Recommended Implementation (This Sprint: 3 Hours)

### Fix 1: Advisory File Locking (30 min)
**Impact:** Eliminates TOCTOU race  
**Files:** 
- Create: `src/utils/file-lock.ts` (advisory lock utility)
- Update: `src/core/roadmap.ts` (claimState, releaseClaim, renewClaim)

```typescript
async claimState(stateId, agent, options) {
    const stateFilePath = await getStatePath(stateId);
    
    return await withFileLock(stateFilePath, async () => {
        // Safe atomic operation with lock held
        const latestState = await fs.loadState(stateId);
        // ... check & update claim
        return await fs.updateState(latestState);
    });
}
```

### Fix 2: Schema Compatibility Check (1 hour)
**Impact:** Prevents silent coordination deadlocks  
**Files:**
- Create: `src/utils/schema-detection.ts` (schema validation)
- Update: `src/file-system/operations.ts` (validate on init)

```typescript
async ensureRoadmapStructure() {
    // Validate schema before any operations
    const validation = await validateSchemaCompatibility(roadmapDir);
    if (!validation.compatible) {
        throw Error(`Schema mismatch: ${validation.error}`);
    }
    // ... proceed safely
}
```

### Fix 3: Filter Claimed States from Pickup (15 min)
**Impact:** Reduces false positives  
**Files:** Update `src/core/roadmap.ts` (pickupState)

```typescript
async pickupState(params) {
    const readyStates = (await this.queryStates(...))
        .filter(s => !s.claim || isExpired(s.claim));  // ← Skip claimed
    // ... proceed with unclaimed states
}
```

### Fix 4: Documentation (30 min)
**Files:** Update `README.md` (add warnings section)

- Warn against deploying STATE-001 full hub yet
- Document current safe approach (Option B)
- Link to STATE-026 as blocker

---

## Testing Requirements

### Test 1: TOCTOU Race Prevention
```bash
# Two agents call pickup simultaneously
cd worktrees/agent-1 && roadmap state pickup &
cd worktrees/agent-2 && roadmap state pickup &
wait
# Expected: Exactly 1 succeeds, 1 gets "already claimed" error
```

### Test 2: Schema Drift Detection
```bash
# Worktree on old branch, main has new schema
git -C worktrees/agent-1 checkout feature-old-branch
cd worktrees/agent-1
roadmap state list
# Expected: Clear error "Schema mismatch: run git rebase origin/main"
# Current: Silent "No states found" (BUG)
```

### Test 3: Claimed State Filtering
```typescript
// Create 3 states, claim state 2, pickup should skip it
const states = [state1, state2, state3];
await core.claimState(states[1].id, "@agent-1");
const pickup = await core.pickupState({ agent: "@agent-2", dryRun: true });
assert(pickup.state.id !== states[1].id);  // Claimed state skipped
```

---

## Implementation Timeline

**Week 1 (This Sprint):**
- Implement advisory file locking (30 min)
- Add schema detection (1 hr)
- Filter claimed states (15 min)
- Write tests (1 hr)
- Update documentation (30 min)
- **Total: 3.5 hours**

**Week 2:**
- Code review
- Deploy to production

**Week 3-4 (If Pursuing STATE-001):**
- Design STATE-026 schema compatibility layer
- Implement background roadmap sync
- Plan incremental migration to full hub

---

## Bottom Line for Copilot + Gemini Concurrent Execution

### Current State
- Messages-only sharing (safe)
- Isolated states per worktree (compatible)
- TOCTOU race exists but low likelihood with 2 agents
- Schema drift risk is **LOW** (only if full hub deployed)

### After Fixes (3 hours)
- Advisory file locking eliminates race condition
- Schema detection prevents silent deadlocks
- **Safe for indefinite concurrent execution**
- Clear error messages for edge cases
- **Zero data corruption risk**

### Key Decision
**Keep current architecture (Option B).** Don't attempt STATE-001 full hub until:
1. ✅ File locking deployed (week 1)
2. ✅ Schema detection implemented (week 1)
3. ⏳ STATE-026 solution designed (week 3+)

This gives you **production-ready concurrent Copilot + Gemini in 1 week** instead of a broken shared hub requiring 6 weeks of emergency rework.

---

## Alignment with Existing Architecture

The current approach aligns well with the project's stated philosophy:

✅ **"Smart Agent, Dumb Tool"** – Tool provides mechanical primitives (locking, schema detection), agents decide what to do  
✅ **Local-first collaboration** – Each worktree is independent filesystem entity; shared only messages  
✅ **Git-native** – Uses worktrees and branch isolation; no custom IPC needed  
✅ **Inspectable & Debuggable** – All coordination visible in filesystem; no hidden state  
✅ **Fail-Safe** – Locked files, clear errors, graceful degradation  

---

## Conclusion

The multi-agent worktree architecture is fundamentally sound. The current implementation (messages-only symlink with isolated state copies) is **actually the right design**, not a limitation.

Two straightforward guardrails (file locking + schema detection) eliminate the safety concerns without requiring architectural changes. This is a 3-hour investment for production-grade concurrent execution.

The vision of STATE-001 (full shared hub) is worth pursuing long-term, but it's dependent on STATE-026 being solved first. Until then, the current approach is both safer and more pragmatic.

