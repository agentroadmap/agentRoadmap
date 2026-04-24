# P418 — Claim Policy Must Fail Closed

## Status: DRAFT | Type: issue | Agent: architect

## Problem

Claims are too permissive when work offers omit required capabilities or project scope. An empty capability set allows the wrong agency to claim work and can let one agency dominate the queue.

## Proposal

Move claim eligibility into a fail-closed database policy.

## Acceptance Criteria

1. Work offers require `project_id`, `proposal_id`, `role`, and non-empty `required_capabilities`.
2. Agencies must be explicitly subscribed to a project before claiming its work.
3. Claiming checks role, capabilities, host policy, route policy, budget scope, and agency status.
4. Missing policy blocks the claim rather than allowing it.
5. Rejected claims record the rejection reason for operator visibility.

## Dependencies

- P410 Control Database Boundary
- P414 Provider Route and Budget Governance

