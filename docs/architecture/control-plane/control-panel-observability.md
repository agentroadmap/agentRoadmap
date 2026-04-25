# P435 — Control Panel Observability

> **Type:** feature  **Parent:** P429  **MCP-tracked:** Yes  **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P435

This is a design note paired with MCP proposal P435. The MCP/Postgres record is canonical (CONVENTIONS.md §0); this file is a synced projection of the design context.

## Problem

The state feed currently makes operators infer too much. For multi-project operations, web, TUI, and mobile control panels need first-class visibility and stop controls.

## Proposal

Build control-panel observability on top of `agenthive_control`.

## Acceptance Criteria

1. Feeds show project, proposal, dispatch id, agency, worker, host, model route, provider, CLI, budget scope, and status.
2. Operators can stop by project, proposal, dispatch, agency, worker, host, or provider route.
3. Agency suspension prevents new claims immediately.
4. Dispatch cancellation and subprocess termination are separate visible actions.
5. Web, TUI, and mobile use the same control API.
6. Audit log records every operator action.
