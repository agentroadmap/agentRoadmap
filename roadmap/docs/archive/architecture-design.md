# Architecture Design Doc: agentRoadmap.md Core

## 1. Philosophical Foundation: The Agent Utility Belt
This project is built on the belief that **Product Evolution** is not a static list of tasks, but a dynamic journey of discovery between a beginning (Seed) and an **End (Vision)**.

### 1.1 "Smart Agent, Dumb Tool"
We reject the concept of an "Active Coordinator" (Agent OS). Instead, `agentRoadmap.md` is a **Passive Mechanical Utility**. It provides the strict state machine and data primitives required for agents to:
- Establish shared context without a central master.
- Negotiate work through atomic claims and leases.
- Communicate progress via a structured heartbeat and pulse.
- Verify reality through enforced audit gates.

### 1.2 The Discovery Loop
The roadmap is a path that is gradually discovered and revised. We use a **Directed Acyclic Graph (DAG) of States** to model this evolution.

---

## 2. Anatomy of a "State"

A **State** is a verified configuration of the system that provides specific, testable **Capabilities**.

### 2.1 State Lifecycle: Status and Maturity
States evolve along two separate axes: **workflow status** and **contract maturity**.

**Status** answers: *where is this state in the work loop right now?*

- **Potential:** The state is known, but not currently being executed.
- **Active:** The state is being researched, implemented, or peer-verified.
- **Reached:** The state has been independently verified against its current contract.
- **Abandoned:** The state is intentionally no longer being pursued.

**Maturity** answers: *how clear and testable is the state contract?*

- **Skeleton:** A visionary statement, high-level intent, or discovery target. The state may begin as a broad hypothesis rather than a detailed implementation target.
- **Contracted:** The vision has been researched into concrete capabilities, acceptance criteria, and executable assertions that describe what must be proven.
- **Audited:** Implementation is complete and the Proof of Arrival has been independently verified against the contracted assertions.

### 2.1.1 From Vision to Executable Assertions
A state can and often should begin as a visionary statement. Agents are expected to continuously research, challenge, and refine that vision as the state matures.

The goal is not to write brittle step-by-step test scripts too early. The goal is to transform a broad vision into **executable assertions**: declarative statements about what must be true when the state is reached.

Good assertions tell another capable agent:

- what property or capability must hold
- what kind of evidence is expected
- whether the check belongs to the builder or to peer verification

They should guide verification without over-constraining it. A strong tester should be able to infer the best way to validate an assertion, rather than blindly replay a script.

### 2.2 Capability Taxonomy
Requirements and impact are split into distinct, machine-readable buckets:
- **`needs_capabilities` (Agent):** Requirements for the executor (e.g., `gpu-access`, `node-expert`).
- **`external_injections` (3rd Party):** Resources outside agent control (e.g., `API Secrets`).
- **`unlocks` (Product):** Capabilities enabled for the product once the state is reached.

---

## 3. Thematic Architecture: Destination-First

A **Theme** is a high-level "Destination State" that organizes work around **Outcomes** rather than specific **Outputs**.

### 3.1 Themes vs. Tactics
- **Theme (Destination):** An outcome-focused state (e.g., "Reduce onboarding friction"). Themes are resilient to tactical changes.
- **Tactic (Road):** A sub-state or specific deliverable (e.g., "Implement Magic Link login") that serves a Theme. Tactics are disposable; if one fails, agents pivot to another tactic.

### 3.2 Visibility Buckets (Now, Next, Later)
Stakeholders view the roadmap through abstraction layers rather than raw DAG IDs.

| Bucket | Definition | Mapping Primitives |
| :--- | :--- | :--- |
| **NOW** | High-clarity themes currently being implemented or audited. | **Active** status OR (**Ready** + **High Priority**) |
| **NEXT** | Validated problems within the same layer that are immediate successors to the current "Now". | **Potential** status + **Medium Priority** |
| **LATER** | Visionary goals. Loosely defined; represent the long-term direction. | **Potential** status + **Low Priority** |

---

## 4. The Autonomy Loop: Scout -> Map -> Reach

### 4.1 Scouting (Discovery) [PLANNED]
Agents analyze the current landscape and catch up on changes via the **Roadmap Pulse**.

### 4.2 Mapping (The Contract) [IMPLEMENTED - CLI/MCP]
Agents refine skeleton states into contracted states. This means turning visionary language into a contract that another agent can verify later: capabilities, acceptance criteria, and executable assertions.

If a sub-roadmap becomes crowded (> 7 states), agents perform **Semantic Aggregation** [PLANNED], synthesizing the complexity into a high-quality summary at the parent state level.

### 4.3 Reaching (The Audit & Certification) [IMPLEMENTED - Verification Gate]
A state is reached only after a formal **peer audit**. The framework enforces a **Verification Gate**:
1. **Builder evidence:** The builder provides implementation notes, unit-level validation, and **Proof of Arrival (PoA)**.
2. **Peer test audit:** A different agent with testing or review strength verifies the contracted assertions using the most appropriate tests, inspections, or experiments.
3. **Certification:** Maturity is set to `Audited`.
4. **Transition:** Status moves to `Reached` (rejected if evidence or peer verification is missing).

### 4.4 Operating Roles & Process Gatekeeping [IMPLEMENTED - Agent Registry]
Autonomous execution still benefits from lightweight role separation:

- **Builder:** Implements the state, runs unit-level checks, gathers proof, and prepares the final summary.
- **Peer Tester / Auditor:** A separate agent, preferably with testing specialty, reviews the contracted assertions, chooses how best to verify them, and records the audit verdict.
- **Coordinator:** Manages sequencing, handoffs, conflict resolution, and—before full daemon mode exists—can act as the single authority for roadmap mutations across worktrees.

For meaningful states, the Peer Tester should preferably be a different agent than the Builder. This is not intended to create bureaucracy; it is intended to preserve trust in `Reached`.

The long-term model uses **both** role separation and mechanical enforcement:

- machine gates ensure required fields, assertions, proof, and transition rules are present
- peer tester roles provide judgment, sanity checks, and process discipline
- coordinator roles keep multi-agent execution coherent when work spans multiple branches or worktrees

---

## 5. Mechanical Coordination Utilities

The framework provides the following primitives for agent self-coordination:

### 5.1 Enriched Decisions (ADRs)
Structured capture of context, alternatives, and consequences tied directly to state rationales.

### 5.2 Obstacles as Constraints
Categorization of blockers by rationale (`external`, `decision`, `technical`) to guide agent negotiation.

### 5.3 Autonomous Pickup
A utility to find and claim the best-fit `ready` state atomically, lowering coordination overhead.

### 5.5 Multi-Worktree Coordination Contract
To ensure safe operations across multiple git worktrees:
1. **Schema Authority:** A schema-compatible root CLI, coordinator workspace, or daemon is the authority for roadmap mutations.
2. **Compatibility:** CLIs in older worktrees should either use the shared authority for roadmap operations or fail with a clear compatibility warning and recovery hint.
3. **Drift Protection:** If a CLI detects a directory layout or schema mismatch, it should surface a warning with explicit remediation (`git rebase`, upgrade, or route through the authority).
4. **Worktree Role:** Worktrees are primarily code sandboxes, not independent roadmap writers.
5. **Symlink Strategy:** Shared message channels may remain temporarily useful, but full `roadmap/` symlinking is not the long-term coordination model. Roadmap state mutation should move behind a single authority boundary.

---

## 6. Architectural Roadmap (Baked-In Evolution)

### Phase 1: Foundation (Reached)
- Directory structure: `roadmap/states/`, `roadmap/messages/`.
- DAG dependency resolution.

### Phase 2: Tactical Coordination (Reached)
- **Field Split:** Decoupled status from maturity.
- **Taxonomy:** Agent needs vs. Product impact.
- **Utilities:** Heartbeat, Pickup, and Impact Analysis.

### Phase 3: Autonomous Refinement (Active)
- **Proof of Arrival Enforcement:** [REACHED] Verification gates in CLI/MCP.
- **Resource-Aware Scoring:** [REACHED] Multi-dimensional matching.
- **Aggregation:** [PLANNED] Tools for agents to better synthesize sub-roadmap health.
- **Discovery:** [PLANNED] Mechanical aids for agents to identify the Gap automatically.

### Phase 4: Capability-Based Pathfinding (Planned)
- Moving the DAG from State-ID dependencies to dynamic Capability-Requirement dependencies.


---

## Focused Design Note

The high-level philosophy in this document now has a concrete implementation direction for multi-agent coordination.

See `roadmap/docs/coordination-service-architecture.md` for the recommended service-oriented architecture:

- single-host first
- daemon as single writer
- SQLite as canonical runtime persistence
- Markdown as projection/export
- PostgreSQL only when multi-host becomes a real requirement
