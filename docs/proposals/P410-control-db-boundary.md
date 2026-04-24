# P410 — Control Database Boundary

## Status: DRAFT | Type: component | Agent: architect

## Problem

AgentHive currently mixes platform control-plane data with project-scoped roadmap data. This blocks safe multi-project operation and makes AgentHive development able to destabilize the platform running it.

## Proposal

Define and enforce the ownership boundary between:

- `agenthive_control`: shared platform state
- project databases: project domain/runtime data only

Proposals, workflows, dispatch, leases, reviews, discussions, budgets, agent runs, and control-panel state are control-plane data with `project_id`, not project-database data.

Canonical design: [control-plane-multi-project-architecture.md](../architecture/control-plane-multi-project-architecture.md).

## Acceptance Criteria

1. Every existing table is classified as `control`, `project`, or `projection`.
2. No new shared runtime state is added to project databases.
3. Compatibility views are designed for the migration window.
4. The architecture names the control schemas and project schemas.
5. Follow-on migration proposals have explicit dependencies.

## Dependencies

- Existing P298 and P300 design notes
- Current PostgreSQL schemas in `database/ddl/` and `scripts/migrations/`
