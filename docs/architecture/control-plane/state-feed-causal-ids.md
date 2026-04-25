# P443 — State Feed Causal IDs

> **Type:** feature  **Parent:** P429  **MCP-tracked:** Yes  **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P443

This is a design note paired with MCP proposal P443. The MCP/Postgres record is canonical (CONVENTIONS.md §0); this file is a synced projection of the design context.

## Problem

The state feed does not expose enough causal identifiers to explain why an agent is running or how to stop it. Operators have to infer project, dispatch, claim, route, model, and budget context from partial names.

## Proposal

Standardize feed events around causal IDs and stop scopes.

## Acceptance Criteria

1. Feed entries include project id, proposal id, transition id, dispatch id, claim id, run id, agency id, worker id, host, route, model, and budget scope when applicable.
2. Feed entries classify whether an event is proposal, transition, dispatch, claim, run, service, budget, or operator action.
3. Feed entries include a recommended stop scope for running work.
4. TUI, web, and mobile consume the same event shape.
5. Sensitive values show auth source class only, never raw tokens or API keys.

## Dependencies

- P415 Control Panel Observability
