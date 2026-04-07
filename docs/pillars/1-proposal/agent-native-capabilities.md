# Agent-Native Capabilities

This document consolidates the still-relevant product capability goals from earlier gap analyses and agent-native planning docs.

## Current capability model

The product is organized around four pillars:

1. **Proposal / Product Development** — proposal lifecycle, dependencies, workflow templates, acceptance criteria, decisions, and queue management
2. **Workforce** — agent identity, roles, team structure, ACL, allocation, and budgets
3. **Efficiency** — model routing, memory, context handling, cache behavior, and cost-aware execution
4. **Utility** — MCP tools, messaging, CLI/TUI/Web surfaces, and human control points

## Still-valid product requirements

### Proposal capabilities

- structured proposal lifecycle with explicit transitions
- DAG-aware dependency and blocker handling
- configurable workflow templates rather than a single fixed RFC flow
- proposal decisions, evidence, and acceptance criteria as first-class data

### Workforce capabilities

- capability-aware routing instead of hardcoded agent assignments
- lease/claim discipline for shared work
- explicit budget and access controls
- human approval reserved for strategic pivots, high-risk moves, and final acceptance

### Efficiency capabilities

- context reuse and cache-aware execution
- model selection based on cost, capability, and urgency
- memory separated by scope rather than one undifferentiated scratch store
- loop detection and operational throttling before runaway cost

### Utility capabilities

- MCP as the main agent interface layer
- just-in-time or role-aware tool exposure where practical
- durable records for messages/events, with live delivery as a separate concern
- clear CLI, TUI, and web surfaces for humans

## Open gaps that still matter

- **Autonomy loop quality:** agents still need stronger guardrails against repeated low-signal retries
- **Semantic reconciliation:** agents need better help distinguishing current directives from stale historical context
- **Tool surface management:** MCP breadth can overwhelm agents unless exposure is scoped or routed
- **Cross-surface validation:** end-to-end verification of CLI → MCP → Postgres → UI still needs to be stronger
- **Archive reduction:** historical documents need summary extraction so current intent is easier to find

## Human role

The human role remains strategic rather than mechanical:

- set intent and priority
- approve risky transitions and spending changes
- review summarized evidence, not raw noise
- correct direction when the automation layer starts optimizing the wrong thing

## Practical priority order

1. keep the Postgres workflow path authoritative
2. strengthen verification and loop control
3. reduce tool/document ambiguity for agents
4. improve end-to-end testing and operational confidence
5. retire archive material as canonical guidance once summaries exist
