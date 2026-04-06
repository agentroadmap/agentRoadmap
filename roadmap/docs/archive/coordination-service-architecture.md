# Coordination Service Architecture

## Context

Recent multi-worktree experiments exposed a real coordination boundary in `agentRoadmap.md`:

- branch-local CLIs can drift from the shared roadmap schema
- `pickup` and `claim` are only safe if mutations are serialized
- shared filesystem access is not the same thing as atomic coordination

This matters even with only two AI agents. The problem is no longer theoretical; the current file-first model creates too much ambiguity around who owns roadmap state, which process is authoritative, and how mixed-revision worktrees should behave.

The system should therefore evolve from **shared files with optimistic coordination** to **a single authority service with transactional persistence**.

---

## Decision Summary

For multi-agent mode, the recommended architecture is:

1. Introduce a repo-scoped daemon, tentatively named `roadmapd`.
2. Make the daemon the single authority for roadmap reads and writes.
3. Use SQLite as the canonical persistence layer for roadmap state and coordination on a single host.
4. Treat Git worktrees as code sandboxes only, not as independent roadmap authorities.
5. Keep Markdown artifacts as deterministic projections and exports, not the live source of truth, once the daemon path is complete.
6. Keep the daemon API and storage layer portable so the backend can move to PostgreSQL later if multi-host coordination becomes a real requirement.

Short version:

> **Single-host first: daemon + SQLite.**
> **Multi-host later: same daemon contract, different transport and database backend.**

---

## Goals

- Serialize roadmap mutations so `pickup`, `claim`, `heartbeat`, and state edits are authoritative.
- Remove schema-coupling between branch-local worktrees and shared roadmap state.
- Preserve local-first operability and low setup cost for one machine running several agents.
- Keep roadmap artifacts inspectable and exportable to Markdown and Git.
- Create a clean path to multi-host execution without redesigning the CLI and MCP surface again.

## Non-Goals

- Building an internet-scale distributed control plane now.
- Requiring PostgreSQL or a separately managed database for local use on day one.
- Removing Markdown, Git export, or human-readable artifacts from the project.
- Supporting direct multi-writer file mutation as the primary coordination model once daemon mode is enabled.

---

## Recommended Single-Host Architecture

### 1. `roadmapd` becomes the coordination authority

In multi-agent mode, all roadmap operations route through a local daemon:

- CLI commands
- MCP handlers
- web/dashboard surfaces
- future automation hooks

The daemon owns:

- state queries and filtering
- claim and lease lifecycle
- heartbeat processing
- pickup scoring and mutation
- validation and transition rules
- persistence
- projection/export generation

Branch-local CLIs stop mutating `roadmap/` files directly in multi-agent mode.

### 2. SQLite is the canonical store on a single host

The daemon stores authoritative roadmap state in SQLite using WAL mode and explicit transactions.

Recommended location:

- `$(git rev-parse --git-common-dir)/agent-roadmap/coordination.db`

That path matters because it is:

- shared across worktrees for the same repository
- outside version-controlled roadmap content
- local to the machine running the agents

SQLite should be considered the primary runtime persistence layer for:

- states and state metadata
- dependencies
- acceptance criteria and DoD items
- claims and lease expiry
- agent registry and heartbeat state
- pickup decisions
- event history

### 3. Markdown remains a projection, not the source of truth

The daemon should generate deterministic Markdown projections into the repository for:

- `roadmap/states/`
- `roadmap/messages/` or message exports
- generated summaries such as `MAP.md`

This keeps the system inspectable and Git-friendly without pretending the filesystem is the coordination engine.

Key rule:

> **The database is canonical; Markdown is rebuildable.**

If projections drift or fail mid-write, the daemon can regenerate them from the database.

### 4. Worktrees remain useful, but only for code isolation

Git worktrees still solve a real problem:

- isolated code edits
- easy diffing and merging
- branch-specific experimentation

But they should no longer act as separate roadmap authorities.

In the recommended design:

- worktrees edit code locally
- worktrees ask the daemon for roadmap reads and writes
- the daemon serializes mutations against the shared canonical database

This removes the false assumption that sharing a `roadmap/` directory or symlink is enough to guarantee safe coordination.

### 5. Local transport should be optimized for one machine

Preferred transport choices:

- Unix domain socket on Unix-like systems
- named pipe on Windows
- localhost HTTP only where browser or remote access requires it

The local-first default keeps:

- setup simple
- exposure minimal
- performance predictable

---

## Ownership Boundaries

### Database-owned runtime data

The daemon database should own the data that must be transactionally consistent:

- state identity and metadata
- dependencies and readiness inputs
- acceptance criteria and DoD checklists
- claims, leases, and heartbeats
- agent presence and capability metadata
- pickup history and allocation outcomes
- event log for audit and replay

### File-owned strategic artifacts

Long-lived human-authored documents should remain file-backed:

- `roadmap/DNA.md`
- `roadmap/GLOSSARY.md`
- architectural docs under `roadmap/docs/`
- decisions and ADRs under `roadmap/decisions/`
- README and contributor guidance

These are low-frequency, review-heavy artifacts that benefit from normal Git workflows.

### Generated artifacts

Some files should become generated or daemon-projected views:

- state Markdown under `roadmap/states/`
- `roadmap/MAP.md`
- possibly message logs if chat history remains user-facing

Generated artifacts remain valuable, but they should not define truth in multi-agent mode.

---

## Operating Roles & Process Gatekeeping

The technical architecture works best when paired with a lightweight operating model.

### Builder

The Builder agent:

- implements the assigned state
- runs unit-level checks
- gathers Proof of Arrival
- records implementation notes and final summary
- proposes the state for peer audit

### Peer Tester / Auditor

A peer tester or reviewer agent:

- reviews the contracted assertions for the state
- decides how best to validate those assertions
- verifies that proof is real and relevant
- checks tests, summaries, and required metadata
- confirms the process contract was followed before `Reached`

The intent is not to force a brittle script for every state. Instead, the state contract should become clear enough that a capable tester can infer the right verification strategy and produce credible proof.

For non-trivial states, the peer tester should preferably be different from the Builder. The goal is not ceremony; it is trust.

### Coordinator

The Coordinator agent or workspace:

- manages sequencing and handoffs
- resolves cross-agent conflicts
- arbitrates blocked or overlapping work
- can act as the temporary single writer before full daemon mode is in place

### Machine gates and role gates should coexist

The system should not rely only on social process, and it should not rely only on automation.

Recommended model:

- **machine gates** enforce required assertions, proof, maturity, and transition rules
- **peer tester roles** verify judgment-sensitive quality and process compliance
- **coordinator roles** keep multi-agent work coherent across worktrees, branches, and service boundaries

This combination gives the system both consistency and credibility.

---

## Why SQLite First

SQLite is the best fit for the next stage of this project because the immediate problem is **single-host coordination**, not distributed infrastructure.

### SQLite advantages here

- ACID transactions are enough for claims, leases, transitions, and graph updates.
- WAL mode supports concurrent readers with a single authoritative writer process.
- There is no separate server to install, secure, monitor, or bootstrap.
- A single repo-scoped daemon can own the write path cleanly.
- Debugging remains easy because the data is local and inspectable.
- The repository already uses `node:sqlite`, which lowers implementation cost.

### What SQLite does not solve by itself

SQLite does not remove the need for a daemon.

If multiple branch-local CLIs write to the same SQLite file independently, the system still suffers from:

- client version skew
- duplicated business rules
- inconsistent migrations
- split authority

So the design is not "SQLite everywhere." It is:

> **SQLite behind one service boundary.**

---

## Alternative Storage Choices

### PostgreSQL

PostgreSQL is the best future upgrade path when the system needs:

- true multi-host access
- team-shared infrastructure
- stronger auth and tenancy boundaries
- operational observability and replication
- more concurrent writers than a single local service should handle

Why not start there now:

- it adds operational weight before the project has proven a multi-host need
- it complicates setup for the local-first workflow that is currently the main use case
- it does not remove the need for a daemon anyway

Decision:

- **not the first step**
- **best upgrade path once the daemon contract stabilizes**

### Redis

Redis is useful for ephemeral locks, queues, or caching, but weak as the canonical roadmap store.

Weaknesses for this use case:

- roadmap data is relational, not just key-value
- durability and replay become extra design work
- acceptance criteria, dependencies, and audit history fit relational storage better

Redis may later complement the system, but it should not be the primary source of roadmap truth.

### Non-SQL or document stores

Document databases or CRDT-style systems are not a good default fit here.

The roadmap needs:

- authoritative transitions
- transactional mutation of related records
- strong queryability across states, dependencies, claims, and events

This is a relational problem with graph-like queries, not an eventual-consistency-first collaboration problem.

### LMDB / LevelDB / embedded KV stores

These could work technically, but they push too much structure into application code:

- joins become manual
- migrations become more bespoke
- audit and reporting are harder to express cleanly

SQLite gives better leverage for less custom machinery.

---

## Proposed Data Model

The exact schema can evolve, but the core model should include:

- `states`
- `state_dependencies`
- `state_acceptance_criteria`
- `state_verification_statements`
- `state_definition_of_done`
- `state_assignments`
- `claims`
- `agent_registry`
- `agent_heartbeats`
- `events`
- `documents` and `decisions` metadata where useful

The `events` table is important even if the rest of the system is not fully event-sourced.

Each meaningful mutation should append an event such as:

- state created
- claim acquired
- claim renewed
- state transitioned
- AC checked
- proof added
- projection exported

This gives the daemon:

- auditability
- replayability
- a strong debugging surface
- a clean future event stream for dashboards or remote agents

---

## Migration Plan

### Phase 0: Stabilize the file-first system

Before or alongside daemon work, the current file path should get minimal safety improvements:

- explicit schema/version checks for mixed-revision worktrees
- atomic temp-file-plus-rename writes
- clearer errors when multi-agent mode is attempted without the daemon

This reduces damage during migration but is not the target architecture.

### Phase 1: Introduce `roadmapd` as a local coordinator

Start with a local daemon that owns:

- claim
- pickup
- heartbeat
- lease expiry
- agent registry
- event logging

The daemon can initially import current Markdown state into SQLite and keep projections aligned while the CLI begins routing coordination features through the service.

### Phase 2: Move state mutation to the daemon

Once the service boundary is stable:

- state edits
- state creation
- checklist mutation
- proof updates
- readiness queries

should all become daemon-mediated operations.

At this point, direct file mutation becomes a single-user fallback, not the supported multi-agent path.

### Phase 3: Make the database canon and projection deterministic

The daemon becomes the source of truth. Markdown becomes:

- projected
- exported
- regenerated when needed

This is the point where worktree schema skew stops mattering for coordination.

### Phase 4: Prepare for multi-host only if needed

If real multi-host use cases emerge, keep the API contract and replace or extend:

- transport
- authentication
- storage backend

without rewriting the roadmap model itself.

---

## Future Multi-Host Plan

Multi-host support is not the immediate optimization target. Most current bottlenecks are LLM latency, tool execution time, and coordination quality rather than host CPU.

That said, a future multi-host mode becomes reasonable if the system needs:

- isolated browser or OS-specific runners
- agents with different trust or secret boundaries
- long-lived remote workers
- team-shared always-on automation
- failure isolation across machines

When that becomes real, the recommended evolution is:

1. keep `roadmapd` as the public contract
2. add authenticated network transport
3. move the canonical backend from SQLite to PostgreSQL
4. keep the event model and projection model intact
5. treat remote agents as clients of the same authority, not peers writing directly

The important architectural choice today is therefore not "support multi-host now."

It is:

> **Do not paint the system into a corner that assumes all coordination is file-local forever.**

The daemon boundary solves that.

---

## Summary

The project should stop trying to get reliable multi-agent coordination out of shared files alone.

The concrete next architecture is:

- single-host daemon
- SQLite canonical persistence
- deterministic Markdown projections
- worktrees for code isolation only
- stable API designed for a later PostgreSQL-backed multi-host mode if justified

This keeps the system practical for today's local workflows while finally giving roadmap coordination a real authority model.
