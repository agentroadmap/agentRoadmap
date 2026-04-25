# P442 — Operator Stop and Cancel Controls

> **Type:** feature  **Parent:** P429  **MCP-tracked:** Yes  **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P442

This is a design note paired with MCP proposal P442. The MCP/Postgres record is canonical (CONVENTIONS.md §0); this file is a synced projection of the design context.

## Problem

Operators need to stop runaway work without guessing which process or row is responsible. Killing OS processes alone is insufficient because the database may respawn work.

## Proposal

Make cancellation, suspension, draining, and subprocess termination first-class control-plane operations.

## Acceptance Criteria

1. Operators can cancel by project, proposal, dispatch, claim, agency, worker, host, and provider route.
2. Agency suspension blocks new claims immediately.
3. Host drain prevents new spawns while allowing selected active work to finish.
4. Dispatch cancellation and subprocess termination are separate visible actions.
5. Every stop action writes an audit event with actor, scope, reason, and result.

## Dependencies

- P413 Dispatch and Agency Hardening
- P415 Control Panel Observability
