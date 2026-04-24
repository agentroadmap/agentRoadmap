# P419 — State Machine Concurrency Ceilings

## Status: DRAFT | Type: issue | Agent: architect

## Problem

The runtime lacks hard concurrency ceilings across agency, host, project, proposal, and workflow role. Without database-enforced limits, a healthy-looking agency can repeatedly claim work until the system is overloaded.

## Proposal

Add control-plane concurrency policy and enforce it at claim time.

## Acceptance Criteria

1. Concurrency limits exist for global, project, host, agency, proposal, workflow state, and role scopes.
2. Claiming checks active claims and active workers inside the same transaction.
3. Exceeded limits reject the claim with a durable reason.
4. Operators can view current concurrency usage by scope.
5. Limits have safe defaults before any agency can claim work.

## Dependencies

- P411 Control Database Bootstrap
- P413 Dispatch and Agency Hardening

