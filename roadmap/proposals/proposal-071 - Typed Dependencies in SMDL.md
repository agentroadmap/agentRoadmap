# PROPOSAL-071: Typed Dependencies in SMDL

**Status**: Proposal
**Author**: Andy
**Priority**: High
**Date**: 2026-04-05
**Category**: FEATURE
**Domain**: ORCHESTRATION

---

## Summary

Extend the proposal dependency model to support **typed dependency edges**. Not all dependencies block the same things. A proposal can be developed and unit-tested while waiting for a runtime dependency, but blocked at the integration gate.

Dependencies get a `type` field that defines *what* they block, enabling proposals to progress in parallel where possible.

---

## Motivation

The current `proposal_dependencies` table stores dependencies as simple edges — "A depends on B" — with no distinction about *why* or *when* the dependency matters. This forces the system to treat all dependencies as hard blockers, preventing legitimate parallel work.

**Real-world scenario:**
- Proposal A: REST API module
- Proposal B: Mobile app that calls Proposal A's API

B doesn't need A's code to be complete to start work. B can:
- Design its API client layer (Proposal → Draft → Review) ✓
- Define interfaces and write unit tests with mocks (Develop) ✓
- Begin building UI logic ✓

But B is blocked from:
- Integration testing (can't test against a non-existent API)
- Deployment (can't run without the actual API server)

If we treat "depends on" as a single binary flag, B sits idle until A is Complete. With typed dependencies, B knows exactly what's available and what to wait for.

---

## Design

### 3.1 Dependency Types

| Type | Meaning | Blocks This Transition | Can Mock? | Example |
|------|---------|----------------------|-----------|---------|
| **interface** | API/schema/interface contract | Review → Develop (if no spec exists) | Partially (generate from spec) | REST API endpoints, protobuf definitions |
| **build** | Source code / implementation | Develop (compilation/runtime errors) | Partially (stubs/fakes) | Shared library, database schema, auth module |
| **unit_test** | Test fixture / harness | Unit test suite in Develop | Yes (mocks, stubs) | Test data factory, mock server, fake payment |
| **integration** | Live integration target | Merge (integration tests fail) | No | Live database, message queue, external API |
| **runtime** | Deployed and running service | Complete (module won't function in production) | No | DNS, CDN, deployed microservice, TLS cert |

### 3.2 SMDL Extension — Per-Transition Dependency Gate

The SMDL transition gate references dependency types:

```yaml
transitions:
  - from: REVIEW
    to: DEVELOP
    gating:
      type: 'dependencies'
      require: ['interface']           # only interface deps must be defined
      on_fail: 'stay'
      
  - from: DEVELOP
    to: MERGE
    gating:
      type: 'dependencies'
      require: ['interface', 'build', 'integration']  # need working integration
      on_fail: 'stay'
      
  - from: MERGE
    to: COMPLETE
    gating:
      type: 'dependencies'
      require: ['interface', 'build', 'integration', 'runtime']  # everything must be live
      on_fail: 'stay'
```

The engine evaluates: "Are all dependencies of types listed in `require` satisfied?" A dependency of type `runtime` doesn't block Develop — it only blocks Complete.

### 3.3 Schema Extension

Extend `proposal_dependencies`:

```sql
ALTER TABLE proposal_dependencies 
  ADD COLUMN dependency_type TEXT DEFAULT 'all' 
  CHECK (dependency_type IN ('interface', 'build', 'unit_test', 'integration', 'runtime', 'all'));
```

Existing dependencies default to `'all'` (backward compatible — blocks everything).

### 3.4 Dependency Specification Flow

When an agent or human adds a dependency:

```yaml
# In proposal markdown
dependencies:
  - id: proposal-042
    type: interface    # needs the API spec defined
    reason: "Need REST endpoints to build client library"
  - id: proposal-038
    type: runtime      # needs the DB actually running
    reason: "Migration must be applied before this module starts"
```

The SMDL engine stores these in `proposal_dependencies` with the appropriate `dependency_type`.

### 3.5 Dependency Satisfaction Logic

A dependency is "satisfied" for a given type based on the dep target's state:

| Dependency Type | Satisfied When |
|---|---|
| **interface** | Target proposal has `maturity_level >= 2` in Review (interface defined) |
| **build** | Target proposal is in Develop or later (code exists) |
| **unit_test** | Target proposal has tests written (can check AC presence) |
| **integration** | Target proposal has passed integration tests (in Merge) |
| **runtime** | Target proposal is Complete (deployed and live) |

### 3.6 Backward Compatibility

- Existing dependencies with no type default to `'all'` — blocks all transitions requiring any dependency type
- Proposals can add typed dependencies alongside untyped ones
- Migration: existing `proposal_dependencies` get `dependency_type = 'all'`

---

## State Diagram — Typed Dependencies in Action

```
Proposal B (mobile app)
  Depends on:
    - A (API): dependency_type = 'interface'  ← blocked on Review→Develop
    - C (DB):  dependency_type = 'runtime'    ← blocked on Merge→Complete

Proposal → Draft → Review [✓ interface from A defined] → Develop
                                                                    [✓ unit tests with mocks]
                                                                    [✗ need C runtime for integration]
                                                                    [wait for C to be Complete]
                                                                    [✓ C completes]
                                                                    → MERGE → COMPLETE
```

Proposal B didn't wait for A or C to be Complete — it progressed in parallel until hitting the gates that specific dependency types enforced.

---

## MCP Tool Changes

**Enhanced `prop_edit`**: Add `dependency_type` field to dependency declarations
**Enhanced `prop_get`**: Show typed dependencies with their satisfaction status
**New `prop_deps_graph`**: Visualize the full dependency graph with typed edges
**Enhanced `prop_queue`**: Show queue with typed blocking info (e.g., "blocked on runtime dependency from P042")

---

## Acceptance Criteria

- [ ] `proposal_dependencies` supports `dependency_type` column with 5 types
- [ ] SMDL gating engine evaluates per-transition dependency type requirements
- [ ] `prop_edit` accepts typed dependency declarations
- [ ] `prop_get` shows typed dependencies with satisfaction status per type
- [ ] `prop_deps_graph` returns full dependency visualization with typed edges
- [ ] Backward compatibility — existing untyped deps default to 'all'
- [ ] Unit tests cover: type evaluation, backward compatibility, multi-type satisfaction
- [ ] Proposals can add/remove typed dependencies independently

---

## Dependencies

None — extends existing infrastructure.

---

## Priority

**High** — Enables parallel proposal development and realistic project workflows. Without typed dependencies, every dependency blocks every stage, forcing sequential execution for everything.
