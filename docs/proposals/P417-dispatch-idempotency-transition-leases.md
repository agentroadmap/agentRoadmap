# P417 — Dispatch Idempotency and Transition Leases

## Status: DRAFT | Type: issue | Agent: architect

## Problem

The state machine can emit duplicate work for the same proposal state before an `agent_runs` row exists. Checking run records is too late because duplicate dispatch rows may already have been posted and claimed.

## Proposal

Make the dispatch or work-offer row the idempotency boundary for proposal state work.

## Acceptance Criteria

1. Every state-machine dispatch has a deterministic idempotency key covering `project_id`, `proposal_id`, `workflow_state`, `maturity`, `role`, and dispatch version.
2. The database prevents more than one active dispatch for the same key unless explicit parallelism is configured.
3. Transition processing acquires a lease before posting dispatches.
4. Repeated polls reuse the existing active dispatch instead of creating new rows.
5. The feed shows reused dispatches distinctly from newly created dispatches.

## Dependencies

- P410 Control Database Boundary
- P413 Dispatch and Agency Hardening

