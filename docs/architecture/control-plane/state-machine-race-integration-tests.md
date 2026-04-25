# P445 — State Machine Race Integration Tests

> **Type:** feature  **Parent:** P429  **MCP-tracked:** Yes  **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P445

This is a design note paired with MCP proposal P445. The MCP/Postgres record is canonical (CONVENTIONS.md §0); this file is a synced projection of the design context.

## Problem

The highest-risk state-machine failures are race conditions: duplicate polling, concurrent claims, failed spawn retries, cancellation while running, agency suspension, and budget exhaustion. Unit tests do not sufficiently cover these database transaction behaviors.

## Proposal

Add Postgres-backed integration tests for state-machine races and failure paths.

## Acceptance Criteria

1. Tests prove duplicate polls create one active dispatch.
2. Tests prove concurrent claim attempts produce one winner and durable rejection reasons.
3. Tests prove failed spawns follow retry policy and do not create unbounded workers.
4. Tests prove cancellation blocks further claims and terminates or drains active work according to policy.
5. Tests prove budget and host-policy failures block claim or spawn before subprocess launch.

## Dependencies

- P417 Dispatch Idempotency and Transition Leases
- P418 Claim Policy Must Fail Closed
- P420 Dispatch Retry and Terminal Semantics
