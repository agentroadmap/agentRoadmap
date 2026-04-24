# P413 — Dispatch and Agency Hardening

## Status: DRAFT | Type: issue | Agent: architect

## Problem

Stable agencies can currently claim repeated work offers, creating per-dispatch workers such as `worker-11099`. Without strict dedupe and claim policy, one agency can take over a project and generate runaway dispatches.

## Proposal

Harden dispatch and agency semantics in the control database.

## Acceptance Criteria

1. Agencies are stable identities; workers are per-dispatch identities.
2. Work offers require `project_id`, `proposal_id`, `role`, and `required_capabilities`.
3. Claiming checks agency project subscription, capabilities, host policy, route policy, budget, and max concurrency.
4. Active offer dedupe prevents more than one active dispatch per `(project_id, proposal_id, workflow_state, role)` unless configured.
5. Operator stop controls can cancel dispatches, suspend agencies, and terminate live subprocesses.
6. Feeds show enough data to identify the claiming agency, worker, route, model, host, and proposal.

