# P421 — Service Topology Ownership

## Status: DRAFT | Type: component | Agent: architect

## Problem

It is unclear which runtime process owns each part of the state machine. Orchestrator, gate pipeline, offer providers, MCP, feed listeners, and spawned workers can overlap responsibilities.

## Proposal

Document and enforce one owner per state-machine responsibility.

## Acceptance Criteria

1. Each service has a declared ownership boundary.
2. Only one service posts state-machine dispatches for a given workflow event class.
3. Passive observers cannot mutate proposal state or dispatch rows.
4. Service heartbeats and leases identify the active owner for each responsibility.
5. Runbooks describe how to drain, restart, or replace each service.

## Dependencies

- P411 Control Database Bootstrap
- P415 Control Panel Observability

