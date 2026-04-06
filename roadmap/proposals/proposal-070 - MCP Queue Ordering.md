# PROPOSAL-070: Dependency-Gated State Transitions via Maturity

**Status**: Proposal
**Author**: Andy
**Priority**: High
**Date**: 2026-04-05
**Category**: FEATURE
**Domain**: ORCHESTRATION

---

## Summary

Maturity and dependencies are two separate concepts that together determine workflow progression:

**Maturity** = has the work in this state passed the decision gate? (Mature = yes)

**Dependencies** = can it move forward right now? (unblocked = yes)

When a proposal passes the decision gate → mark it **Mature**. If dependencies are incomplete → mark as **dependency-waiting** but still Mature. When all dependencies complete → advance to next state automatically.

The queue is not a separate list — it emerges from mature proposals ordered by priority, with the dependency graph determining which can advance.

---

## Motivation

The current `pickupProposal` ignores maturity and dependencies entirely. It sorts all "ready" proposals by priority only. But the design in `Roadmap_process.md` is clear:

> **Maturity Level 2: Ready for state transition; automatically queued by priority.**

A proposal is Mature when it passes the decision gate in its current state. Whether it can *transition* depends on dependencies.

**The gap:**
1. Maturity isn't used in the queue at all (two disconnected systems exist: `skeleton/contracted/audited` strings vs unused `maturity_level` int)
2. `pickupProposal` doesn't filter by maturity
3. State transitions don't check dependencies
4. Completing a proposal doesn't trigger dependency resolution for waiting dependents

---

## Design

### 3.1 Unified Maturity Model

Replace dual maturity systems with a single integer model:

| Level | Meaning |
|-------|---------|
| 0: New | Initial submission, not yet researched |
| 1: Active | Under ongoing work in current state |
| 2: Mature | Decision gate passed; work in current state is done |
| 3: Obsolete | Deprecated, replaced, lost relevance |

**Key principle:** Maturity is about *state-specific work completion*, NOT about whether the proposal can move forward. A proposal can be Mature and still waiting on dependencies to advance.

### 3.2 Dependency Status — Independent of Maturity

Dependencies are stored in `proposal_dependencies` (DAG). A proposal is:
- **dependency-ready** = all deps are Complete
- **dependency-waiting** = at least one dep is not Complete

These are binary states computed from the dependency graph, not a separate maturity level.

**A proposal can be Mature + dependency-waiting.** It passes the decision gate but can't advance until its dependencies complete.

### 3.2.1 Dependencies Don't Block Review — They Block State Transition

Dependencies do NOT prevent a proposal from being reviewed, discussed, or prepared. A proposal with incomplete dependencies:
- Can be reviewed and commented on
- Can have its content refined and enhanced
- Can accumulate acceptance criteria
- Can be marked Mature (decision gate passed)

Dependencies only prevent the **state transition**. Once marked Mature with incomplete dependencies, the proposal waits for those dependencies to complete, then transitions automatically. This means review cycles are never wasted on blocked proposals — the work done while waiting is valuable and preserved.

If a dependency is added during an existing review, the review continues. The new dependency just becomes part of the transition gate check when maturity is reached.

### 3.3 Dependency Gating via SMDL — No Hardcoded Rules

Dependency gating is **defined in SMDL (State Machine Definition Language)**, the existing workflow specification language from `state_machine_dsl.md`. The existing `gating` field on transition rules is extended to support dependency checks.

**Current SMDL already supports:**
```yaml
transitions:
  - from: REVIEW
    to: DEVELOP
    gating:
      type: 'none'              # ← we extend this to support deps
```

**Extended SMDL with dependency gating:**
```yaml
gating:
  type: 'dependencies'          # new type: 'dependencies'
  require: 'all_complete'       # 'all_complete', 'at_least_one', 'none'
  on_fail: 'stay'               # proposal stays in current state
```

**Example RFC-5 workflow with dependency gates:**
```yaml
transitions:
  - from: PROPOSAL
    to: DRAFT
    gating:
      type: 'none'              # no dep check needed
    
  - from: DRAFT  
    to: REVIEW
    gating:
      type: 'none'              # review can proceed regardless of deps
    
  - from: REVIEW
    to: DEVELOP
    gating:
      type: 'dependencies'      # ← gate: all deps must be complete
      require: 'all_complete'
      on_fail: 'stay'           # stay in REVIEW, still Mature
    
  - from: DEVELOP
    to: MERGE
    gating:
      type: 'dependencies'
      require: 'all_complete'
      on_fail: 'stay'
      
  - from: MERGE
    to: COMPLETE
    gating:
      type: 'dependencies'
      require: 'all_complete'
      on_fail: 'stay'
```

**The transition engine** evaluates the SMDL `gating` field:
- `type: 'none'` → no check, transition allowed if maturity gate passed
- `type: 'dependencies'` → query `proposal_dependencies`, enforce `require` rule
- *(extensible: future types like `'quorum'`, `'timeout'` already in existing SMDL spec)*

**Benefits of SMDL-driven gating:**
1. No hardcoded transition-specific logic — data, not code
2. Different projects can use different gating strategies
3. Gates are visible and auditable in the SMDL file
4. New gate types added to the engine without touching transition code

### 3.4 State Transition Flow

```
Proposal in state S with maturity = Active (1)
  │
  │ ... work being done (build, test, review, etc.)
  │
  ▼
Decision gate passed → set maturity = Mature (2)
  │
  ▼
Is the NEXT state a Build gate (Develop, Merge)?
  │
  ├── No (Review transition) → advance immediately
  │                            set status = S+1
  │                            reset maturity = Active (1) for new state
  │
  └── Yes (Build gate transition) → Check dependencies:
       │
       ├── All deps complete → advance to next state
       │                       set status = S+1
       │                       reset maturity = Active (1) for new state
       │
       └── Some deps incomplete → mark dependency-waiting
                                   PROPOSAL STAYS IN STATE S
                                   maturity = Mature (2) — work is done here
                                   wait for dependency to complete
```

### 3.4 Dependency Completion Trigger

When a proposal transitions to Complete:

```
FOR EACH dependent proposal D in proposal_dependencies:
    IF all of D's dependencies are now Complete:
        IF D.maturity == Mature (2):
            → D is now fully ready, advance to next state automatically
        ELSE:
            → D continues work in its current state, will join queue when Mature
```

This is event-driven, not polling. Completing one proposal can trigger a cascade of advancements.

### 3.5 Queue Derivation

The "queue" of proposals ready to advance:

```sql
SELECT display_id, title, status, priority, maturity_level
FROM proposal
WHERE maturity_level = 2                    -- decision gate passed
  AND NOT blocked_by_dependencies            -- all deps complete
  AND status IN ('Draft', 'Review', 'Develop', 'Merge')
ORDER BY priority ASC;                       -- High → Medium → Low
```

And the "waiting" list:

```sql
SELECT display_id, title, status, 
       (SELECT string_agg(dp.dependent_id, ', ') 
        FROM proposal_dependencies dp 
        WHERE dp.proposal_id = proposal.id 
        AND dp.status != 'Complete') as waiting_on
FROM proposal
WHERE maturity_level = 2
  AND blocked_by_dependencies
ORDER BY priority ASC;
```

### 3.6 MCP Tool Changes

**Enhanced `prop_transition`** (RFC Pg handler):
- When passing a decision gate, check `proposal_dependencies`
- If blocked: proposal stays in current state, marked Mature + dependency-waiting
- If free: advance to next state, reset maturity to Active

**Enhanced `prop_complete`**:
- After marking Complete, trigger dependency resolution cascade
- For each proposal waiting on this one, check if it's now unblocked
- If unblocked + already Mature → auto-advance to next state

**New `prop_queue`** tool:
- Returns all mature + unblocked proposals (the active queue)
- Also returns waiting proposals with their blocking dependencies
- Priority-ordered within each group

---

## Schema Changes

**Minimal** — existing columns cover everything:
- `maturity_level` (INT): 0=New, 1=Active, 2=Mature, 3=Obsolete
- `blocked_by_dependencies` (BOOLEAN): computed from proposal_dependencies
- `proposal_dependencies` (table): stores the DAG
- `status` (TEXT): current state (Draft, Review, Develop, Merge, Complete)

**What changes:**
- Logic in `transitionProposal` to check maturity before advancing
- Logic in `prop_complete` to trigger dependency cascade
- Priority field used for queue ordering (already exists)

---

## State Diagram

```
[Active work]
     │
     │ pass decision gate
     ▼
[Mature] ──[all deps complete]──▶ Next State (reset to Active)
     │
     │ [some deps incomplete]
     ▼
[Mature + dependency-waiting]
     │
     │ [dependency completes → check all deps]
     ▼
     └── All complete? ──▶ Next State (reset to Active)
     └── Still blocked? ───▶ Stay here (re-check on next dep completion)
```

### Full Pipeline Example

```
Proposal A: Draft → [mature, no deps] → Review → [mature, no deps] → Develop → [mature, no deps] → Merge → [mature, no deps] → Complete

Proposal B: Draft → [mature, unblocked] → Review → [mature, blocked by C] → REVIEW (waiting)
Proposal C: Draft → [mature, unblocked] → Review → [mature, unblocked] → Develop → [mature, unblocked] → Merge → [mature, unblocked] → Complete
  → triggers B: now unblocked, mature, auto-advances to Develop
```

---

## Acceptance Criteria

- [ ] State transition checks maturity level — must be ≥ 2 (Mature) to advance
- [ ] State transition checks dependencies — if blocked, proposal stays in current state
- [ ] Mature + blocked proposals remain marked Mature (not demoted)
- [ ] Completing a proposal triggers dependency resolution cascade
- [ ] Unblocked + Mature proposals auto-advance to next state
- [ ] `prop_queue` tool returns active queue (mature + unblocked) + waiting list with blockers
- [ ] Priority ordering works within each group (High → Medium → Low)
- [ ] Unit tests cover: maturity gating, dependency blocking, completion cascade, auto-advance
- [ ] Legacy `skeleton/contracted/audited` maturity model deprecated and migrated

---

## Dependencies

None — uses existing schema fields and tables.

---

## Priority

**High** — This is the core autonomous workflow mechanic. Without it, proposals either advance prematurely (ignoring dependencies) or sit idle while agents pick non-mature ones.
