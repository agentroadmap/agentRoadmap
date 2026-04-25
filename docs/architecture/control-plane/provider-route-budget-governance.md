# P434 — Provider Route and Budget Governance

> **Type:** feature  **Parent:** P429  **MCP-tracked:** Yes  **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P434

This is a design note paired with MCP proposal P434. The MCP/Postgres record is canonical (CONVENTIONS.md §0); this file is a synced projection of the design context.

## Problem

AI provider access is not just a model name. It combines provider account, plan type, route, host policy, CLI, credentials, toolsets, context limits, and budget caps.

## Proposal

Normalize provider accounts, model routes, budget policy, and context policy in `agenthive_control`.

## Acceptance Criteria

1. Provider accounts distinguish token-plan, API-key-plan, subscription, and local access.
2. Model routes reference provider accounts and define CLI, API spec, route provider, model, priority, costs, toolsets, and delegation policy.
3. Budget caps are hierarchical: global, project, repo, agency, provider account, model route, proposal, dispatch, run.
4. Budget is checked before claim and before spawn.
5. Context policy records max prompt/history tokens, retrieval, summarization, attachment, and truncation behavior.
6. Runs record route, model, auth source class, budget scope, context policy, tokens, and cost.
