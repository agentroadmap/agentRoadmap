# P444 — Host, Provider, and Route Separation

> **Type:** issue  **Parent:** P429  **MCP-tracked:** Yes  **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P444

This is a design note paired with MCP proposal P444. The MCP/Postgres record is canonical (CONVENTIONS.md §0); this file is a synced projection of the design context.

## Problem

Host identity, worktree hints, provider identity, model route, and agency identity are blurred. This makes a host such as `bot` or a worktree hint such as `hermes-andy` look like the provider or agency that owns the work.

## Proposal

Make host, agency, provider account, model route, CLI, and worktree policy separate control-plane concepts.

## Acceptance Criteria

1. Host policy is route-specific and never treated as a single-provider host.
2. Worktree selection comes from project/repo policy, not hardcoded agency names.
3. Provider account, route provider, agent provider, CLI, model, and auth source class are recorded separately.
4. Spawn decisions resolve route and credentials before launching a worker.
5. Feed and run records display the separated fields.

## Dependencies

- P414 Provider Route and Budget Governance
