# GPT Analysis: agentRoadmap.md - Roadmap Model Review

> **Author:** GitHub Copilot (GPT-5.4)
>  
> **Date:** 2026-03-17
>  
> **Scope:** Review of the roadmap model described in `DNA.md`, `GLOSSARY.md`, `MAP.md`, `ROADMAP_CONTRIBUTING.md`, `docs/architecture-design.md`, and the live roadmap state files.

---

## Executive Summary

The roadmap model is strong, distinctive, and much more coherent than a normal task board. Its core idea - treating product evolution as a **DAG of verifiable states** rather than a flat queue of tickets - is the right abstraction for agent-native project management.

My main conclusion is this:

> **The model is conceptually ahead of its formalization.**

The philosophy is excellent. The ontology is promising. The workflow is already partly real (`STATE-003`, `STATE-004`, and `STATE-025` are reached). But the current model still blends together three different concerns:

1. **Planning semantics** - what a state means in the product graph
2. **Execution semantics** - how an agent claims and works a state
3. **Verification semantics** - what makes a state truly "Reached"

That blending is now the main structural weakness. Earlier critiques focused on naming drift; that was valid, but `STATE-025` has largely resolved that issue. The bigger opportunity now is to make the model internally sharper and more enforceable.

---

## What the roadmap model gets very right

### 1. "State" is a better primitive than "task"

The strongest idea in the whole repo is the move from task management to **state management**.

`DNA.md`, `GLOSSARY.md`, and `architecture-design.md` all point to the same valuable shift:

- a **State** is not just work to do
- it is a meaningful configuration of the system
- it unlocks future movement in the graph

That is a much better fit for AI agents than ordinary ticket systems because agents reason well about:

- prerequisites
- reachable futures
- branching paths
- proof that a transition actually happened

This is the right conceptual foundation.

### 2. The DAG model is genuinely agent-native

The model does not treat blockers as failure. It treats them as **discovery inputs** that can generate new states, decisions, or obstacles. That is unusually good.

The contribution guidance is also healthy:

- avoid false dependencies
- widen the graph when work can be parallelized
- create spike states when blocked
- use parent/sub-roadmaps for layered discovery

That is exactly how an agent-friendly roadmap should evolve: not as a rigid sequence, but as a graph that becomes more accurate as reality is discovered.

### 3. The model already has the right governance concepts

The model includes first-class ideas for:

- decisions / ADRs
- rationales
- milestones
- proof of arrival
- final summaries
- messages / coordination
- parent-child state decomposition

This is important because agent systems fail when all semantics are hidden in chat text. Here, the roadmap is trying to move those semantics into structured artifacts. That is the correct direction.

### 4. Local-first and markdown-native is a strategic advantage

The model is intentionally optimized for:

- filesystem visibility
- human auditability
- agent readability
- low operational friction

That keeps the system inspectable. For agent collaboration, this is a real strength, not a limitation.

### 5. The roadmap has already crossed from theory into protocol

This matters: the model is not just aspirational anymore.

The live roadmap shows that several key architectural corrections are already reflected in the graph:

- `STATE-003` reached: ready-work discovery
- `STATE-004` reached: lease-based claiming
- `STATE-025` reached: nomenclature normalization

So the model is no longer in "pure manifesto" mode. It has an emerging execution protocol.

---

## Where the roadmap model is still blurry

### 1. The lifecycle model is overloaded

This is the most important conceptual issue I found.

`architecture-design.md` defines a maturity model like this:

- `Potential` = Skeleton
- `Active` = Contracted
- `Reached` = Audited and certified

But the live roadmap does not actually use status that way.

For example, several `Potential` states already have solid descriptions, dependencies, labels, priorities, and detailed acceptance criteria. That means `Potential` is not really "Skeleton" in practice. It often means "not yet in progress."

Meanwhile, `ROADMAP_CONTRIBUTING.md` uses `Active` as the status you set when you assign a state to yourself and begin work. So `Active` means execution-in-progress, not just "contracted."

That creates a model collision:

- **maturity** of the state contract
- **workflow** status of the work
- **readiness** for pickup

are being represented by overlapping signals.

### Why this matters

Agents need to know the difference between:

- a rough idea
- a fully specified but unclaimed state
- an actively claimed state
- a verified completed state

Right now, that distinction exists only partially.

### Recommendation

Keep the current top-level status vocabulary if you like it, but split the model into separate axes:

- `status`: `Potential | Active | Reached | Abandoned`
- `maturity`: `Skeleton | Contracted | Audited`
- `readiness`: derived, not edited manually

Even if `maturity` starts as optional metadata, this would make the architecture doc true again.

---

### 2. "Capability" currently means two different things

This is the second major model issue.

In the philosophical docs, a **Capability** is something the product gains after a state is reached. Future pathfinding is supposed to depend on those unlocked capabilities.

But in the live state files, `requires` currently contains values like:

- `capability:coding`
- `capability:testing`
- `capability:orchestration`
- `model:fast`

Those are not product capabilities. They are **agent execution capabilities** or agent resource requirements.

So the model is using one word for two different concepts:

1. **Product capability unlocked by a reached state**
2. **Agent capability required to execute a state**

That ambiguity will become painful as soon as capability-based pathfinding and agent scoring are both implemented.

### Recommendation

Separate them explicitly:

- `provides_capabilities`: product/system capabilities unlocked
- `requires_agent_capabilities`: skills/models needed to work the state
- `requires_external_injections`: external approvals, upstream changes, audits, etc.

This would make `STATE-005` and `STATE-006` much cleaner and would preserve the original architecture vision.

---

### 3. Themes and "Now / Next / Later" are under-modeled

The architecture doc introduces:

- Themes vs. tactics
- destination-first planning
- visibility buckets like NOW / NEXT / LATER

Those are good ideas. But today they appear more as design language than as first-class model elements.

I do not see a consistent structured representation for:

- a state's theme
- whether a state is a destination or a tactic
- whether NOW / NEXT / LATER is authoritative metadata or just a derived view

### Recommendation

Decide whether these are:

- **core model concepts**, or
- **presentation views**

If they are core, add fields and rules.

If they are views, document them as derived projections of state metadata rather than as part of the canonical ontology.

My bias: treat milestones and NOW/NEXT/LATER as **views over the DAG**, not as the DAG's source of truth.

---

### 4. Proof of Arrival is central in philosophy but not yet central in the model

This is the biggest integrity gap.

The docs are very clear:

- `DNA.md`: code as truth
- `GLOSSARY.md`: a state is not reached until testing is verified
- `architecture-design.md`: reached means audited and certified
- `STATE-010`: proof should be required before transition

But the live model still treats proof more like an expectation than a contract.

That means the roadmap model currently has:

- strong language about trust
- weak structural enforcement of trust

For a human-run system, that is survivable.

For an agent-run system, it is dangerous, because acceleration without proof is just faster self-certification.

### Recommendation

Make proof part of the canonical state contract, not an optional convention.

At minimum, a reached state should require:

- `final_summary`
- `proof`
- `verification_method`
- optionally `artifacts` or `commands_run`

If the project wants to remain truly agent-native, `Reached` must become a guarded transition, not a social agreement.

---

### 5. The active roadmap still needs hygiene

This is much better than the earlier analyses suggested, because many test states have been archived.

However, the active roadmap still contains some obvious non-production or example states, including:

- `STATE-026` (`Test`)
- `STATE-001` / `STATE-001.1` (parent-child example states)

Even a small amount of fixture noise degrades agent reasoning quality, because agents do not naturally know which states are illustrative versus authoritative.

### Recommendation

Keep the active roadmap reserved for real roadmap truth.

Move examples, experiments, and fixtures into:

- `roadmap/archive/`
- a dedicated fixture roadmap
- or test data outside the main project roadmap

---

## My read on the current maturity of the model

I would describe the current state like this:

- **Conceptual model:** strong
- **Operational model:** emerging
- **Enforcement model:** incomplete

More specifically:

- the ontology is already good enough to differentiate this project from normal PM tools
- the execution loop is now partially real because ready-work and lease semantics exist
- the trust model is still weak because proof, pickup, heartbeat, and structured negotiation are not yet first-class runtime contracts

So I would not describe the project as having a weak roadmap model.

I would describe it as having a **strong semantic model with incomplete formal boundaries**.

---

## What I would preserve at all costs

If you keep evolving this system, I would protect these decisions:

1. **State over task**
2. **DAG over flat queue**
3. **Discovery over rigid planning**
4. **Local-first files over opaque SaaS state**
5. **Proof-based completion over checkbox completion**

Those are the ideas that give this project category-defining potential.

---

## Recommended next moves

### Priority 1: Separate the model into three planes

Define a clearer contract for:

- **Planning plane:** state, dependency, milestone, parent, rationale, theme
- **Execution plane:** assignee, claim, lease, pickup, heartbeat, handoff
- **Verification plane:** proof, audit, final summary, hype, issues

This is the single highest-value modeling improvement.

### Priority 2: Make lifecycle semantics explicit

Do not rely on `Potential/Active/Reached` alone to encode maturity, readiness, and execution state.

Introduce either:

- a `maturity` field, or
- a stricter derived contract around what qualifies as a "contracted" state

### Priority 3: Split product capabilities from agent capabilities

Without this, capability-based pathfinding and agent matching will fight each other conceptually.

### Priority 4: Move `STATE-010` closer to the critical path

From a pure ergonomics perspective, `STATE-008` is the next obvious UX win.

But from a roadmap-model perspective, `STATE-010` is just as important, because it decides whether "Reached" means anything durable in an autonomous system.

My recommendation is:

- **agent UX track:** `STATE-008` -> `STATE-005` -> `STATE-007`
- **model integrity track:** `STATE-010` in parallel as early as possible

### Priority 5: Keep the active roadmap clean

The better the roadmap hygiene, the better the agent behavior.

In agent systems, "a little noise" is not little.

---

## Additional utility capabilities for long-term agent usefulness

If the vision is for `agentRoadmap.md` to remain a focused utility for OpenClaw-style agents and similar systems, then the roadmap model should eventually be paired with a small set of adjacent utility capabilities that improve coordination without turning the product into a full agent platform.

The most important related capabilities are:

- **Autonomous pickup with explanation:** not just "give me work," but "why this state is the best fit right now."
- **Agent registry:** explicit profiles for skills, model class, cost class, availability, and trust level.
- **Lease liveness:** heartbeat, renewal, stale-agent detection, and safe recovery flows.
- **Structured negotiation intents:** blocker, claim, reject, handoff, escalation, and acceptance flows tied to concrete state IDs.
- **Proof submission and audit gates:** first-class evidence capture before `Reached` can be granted.
- **Event subscriptions:** agents should be notified when a state becomes ready, blocked, reassigned, or reopened instead of polling constantly.
- **Artifact linking:** states should connect cleanly to PRs, commits, branches, test runs, logs, docs, and deployment evidence.
- **Impact analysis:** agents should be able to ask "what downstream states, capabilities, or systems are affected if this changes?"
- **Decision capture:** ADRs and rationale should be queryable as part of execution, not just stored as passive documentation.
- **Issue, risk, and incident modeling:** the utility should be able to represent not only feature progress, but regressions, production incidents, and discovered hazards.
- **Policy and permissions:** who may claim, override, reopen, or force-release work should be explicit.
- **External connectors:** GitHub, CI, docs, observability, and alerting integrations should feed evidence and state changes back into the roadmap.

The key boundary is important: these capabilities should strengthen the roadmap as a **coordination utility**. They do not require `agentRoadmap.md` to become an agent OS, runtime host, or full orchestration platform.

---

## Final verdict

`agentRoadmap.md` has a legitimately strong roadmap model.

Its best idea is that progress should be represented as movement through a graph of verified states, not as completion of disconnected tasks. That is the right abstraction for multi-agent software execution.

The project's next challenge is no longer identity. It is **formal clarity**.

If you sharpen the boundaries between:

- what a state **is**
- how a state gets **worked**
- and what makes a state truly **reached**

then this becomes a durable, high-trust coordination utility for autonomous agents.
