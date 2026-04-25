# P432 — Project Domain Database Isolation

> **Type:** feature  **Parent:** P429  **MCP-tracked:** Yes  **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P432

This is a design note paired with MCP proposal P432. The MCP/Postgres record is canonical (CONVENTIONS.md §0); this file is a synced projection of the design context.

## Problem

Project domain/runtime data must be isolated by project, while AgentHive control-plane state remains centralized.

## Proposal

Move project domain/runtime tables into one database per project, registered in `agenthive_control`.

Project databases own:

- app/business domain tables
- imported datasets
- test fixtures
- generated artifacts
- project-local search or embedding stores
- execution sandboxes
- optional project-domain telemetry

They do not own proposals, workflow state, acceptance criteria, dependencies, discussions, reviews, model routes, agencies, budgets, credentials, host policy, run ledgers, or dispatch queues.

## Acceptance Criteria

1. Project registry records database name, host, user ref, git repo, git root, and worktree root.
2. PoolManager resolves project databases from control DB registry.
3. MCP project-domain tools accept project context and route to the correct project DB.
4. AgentHive itself is registered as a normal project, while its proposals/workflows remain in the control DB.
5. Cross-project dependencies remain unsupported unless a later proposal designs them.
