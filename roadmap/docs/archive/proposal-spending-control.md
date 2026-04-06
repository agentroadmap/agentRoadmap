# Proposal: Agent Spending Control (Low Priority)

## Source
Analysis: `roadmap/docs/spending_control_20260331.md`
Priority: Low
Status: Proposal

## Problem
No way to track or limit per-agent API spend. Current setup has no budgeting, no per-agent attribution, and no kill-switch.

## Three-Layer Architecture

### Layer 1: Hard Limits (No Code Needed)
- OpenRouter Guardrails per API key
- Per-cubic API keys with daily/weekly/monthly USD caps
- Simplest defense against runaway spending

### Layer 2: Real-Time Tracking (Proxy-Side)
- Parse OpenRouter response headers/body for `usage` and `cost`
- Write to Postgres `token_ledger` table on every call
- Zero polling delay — cost known the millisecond the call completes

### Layer 3: Pull Monitoring (Kill-Switch)
- `/api/v1/credits` — global balance check (kill-switch if below threshold)
- `/api/v1/activity` — per-key attribution every 5 minutes

## Components to Build
- [ ] Postgres `token_ledger` table (agent_id, model, tokens, cost, timestamp)
- [ ] Proxy-side cost parser (extract from OpenRouter response)
- [ ] Per-cubic API key with guardrail budget
- [ ] "Fuel gauge" UI (CLI + web dashboard)
- [ ] Kill-switch logic (stop non-essential agents below $X)

## Dependencies
- OpenRouter account with API key management
- Postgres schema update
- MCP server integration for budget checks

## Notes
- Reference analysis in roadmap/docs/spending_control_20260331.md
- Low priority — defer until core product is stable
