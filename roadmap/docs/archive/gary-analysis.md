# Gary Analysis: Roadmap Connectivity and the "Orphan State" Problem

> **Author:** Gemini (on behalf of Gary)
> **Date:** 2026-03-20
> **Status:** Strategic observation and process recommendation

---

## 1. The Observation: Isolated States in the DAG

A review of the roadmap DAG (as seen in `../../dag.svg` and `roadmap/states/`) reveals a surprising number of **isolated or "orphan" states**. These are states that:
- Have no incoming dependencies (they don't build on previous work).
- Have no outgoing descendants (no future work depends on them).
- Are often created from ad-hoc AI analysis rather than a connected discovery path.

### 1.1 Examples of Isolated Branches
- **STATE-003 (Ready Work Discovery)** and **STATE-004 (Lease Collision Recovery)** form a small cluster but are largely disconnected from the "Vision" states.
- **STATE-021 (Agent Dashboard)** and its substate **STATE-021.1** are operational improvements that appear as floating islands.
- **STATE-011 (Scout/Map Loop)** is a research state with no dependencies, yet it is foundational to the project's long-term autonomy.

---

## 2. The Problem: Discovery vs. Travel

In a regular roadmap, the journey should be a continuous path:
1. **Initial State (Seed)**: Where we are today.
2. **Visionary Final State**: Where we want to be.
3. **The Gap**: The giant space between them.
4. **Intermediate States**: Added gradually to bridge the gap, one stop at a time.

**The "AI Analysis" Trap:**
When agents perform ad-hoc analysis, they often identify valuable features or fixes but create them as isolated nodes. This leads to a roadmap that looks like a "feature cloud" rather than a "project journey."

---

## 3. Proposed Process: Preventing Orphan States

To maintain DAG integrity and project momentum, we should enforce a **Connectivity First** rule for roadmap evolution.

### 3.1 The "Anchor" Rule
Every new state MUST be anchored to the existing graph. 
- **Upward Connectivity**: A new state must either depend on an existing state OR be an alternative path from the Seed.
- **Downward Connectivity**: A new state must eventually contribute to a "Vision" state or a major Milestone.

### 3.2 Discovery Protocol
1. **Scout**: Identify a gap between the current `Reached` front and the `Vision`.
2. **Map**: Create a sequence of states that bridge that specific gap.
3. **Link**: Explicitly set `dependencies` to ensure the new work is unblocked by previous achievements.

### 3.3 Mechanical Prevention
The tool should ideally warn or nudge when:
- A state is created with `dependencies: []` while not being a foundational "Seed" descendant.
- A state has been `Reached` but has no descendants (a "dead end").
- The distance between the current `Reached` states and the `Vision` contains gaps that aren't mapped.

---

## 4. Immediate Actions

1. **Audit the DAG**: Review all `Potential` states and link them to their logical predecessors.
2. **Bridge the Dashboard**: Connect the observability work (STATE-021) to the core coordination logic (STATE-004, STATE-007).
3. **Formalize the Seed**: Ensure `state-0` (or the equivalent initial state) is the clear starting point for all branches.

---

*Documented by Gemini (Agent) following Gary's observation on 2026-03-20.*
