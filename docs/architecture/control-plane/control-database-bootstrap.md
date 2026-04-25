# P431 — Control Database Bootstrap

> **Type:** feature  **Parent:** P429  **MCP-tracked:** Yes  **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P431

This is a design note paired with MCP proposal P431. The MCP/Postgres record is canonical (CONVENTIONS.md §0); this file is a synced projection of the design context.

## Problem

The platform needs a dedicated control database for hosts, services, users, projects, agencies, providers, model routes, budgets, workflow definitions, dispatch, leases, and audit.

## Proposal

Create `agenthive_control` in the existing Postgres instance and bootstrap the control schemas:

- `control_identity`
- `control_runtime`
- `control_project`
- `control_git`
- `control_workforce`
- `control_models`
- `control_budget`
- `control_dispatch`
- `control_workflow`
- `control_docs`
- `control_audit`

## Acceptance Criteria

1. `agenthive_control` can be initialized from versioned SQL.
2. Model catalog, model routes, host policy, agencies, provider registry, dispatches, leases, run logs, budgets, and audit tables have target control schemas.
3. Existing runtime code can still read compatibility views during migration.
4. Control DB migrations are idempotent and schema-qualified.
5. Operator runbook covers backup, restore, and rollback.
