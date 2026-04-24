# P420 — Dispatch Retry and Terminal Semantics

## Status: DRAFT | Type: issue | Agent: architect

## Problem

Failed dispatches can be reissued as new work instead of progressing through a clear retry or terminal state. This makes failure loops look like useful progress and contributes to spawn storms.

## Proposal

Define a dispatch lifecycle with attempt counters, retry policy, cooldowns, and terminal outcomes.

## Acceptance Criteria

1. Dispatch rows have explicit states such as `posted`, `claimed`, `running`, `retry_wait`, `failed`, `cancelled`, and `completed`.
2. Retries update the same dispatch row until a configured reissue boundary is reached.
3. Retry policy records max attempts, cooldown, and retryable error classes.
4. Terminal dispatches cannot be claimed.
5. The state machine can distinguish failed work from work that should be requeued.

## Dependencies

- P417 Dispatch Idempotency and Transition Leases

