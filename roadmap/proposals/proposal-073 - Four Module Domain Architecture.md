# PROPOSAL-073: Four-Module Domain Architecture

**Status**: Proposal
**Author**: GQ77
**Date**: 2026-04-05
**Category**: ARCHITECTURE
**Domain**: STRATEGY
**Priority**: Critical

---

## Summary

Define AgentHive's architecture around **4 top-level modules**, each with clear ownership, boundaries, and responsibility. This is the foundational domain model that all code, proposals, tables, and tools align to.

## The Four Modules

### 1. 📋 Proposal — The *What*

**Responsibility**: Universal entity model, lifecycle, state machine, workflow orchestration

**What it owns**:
- Proposal creation, editing, deletion, search
- RFC state machine (Proposal → Draft → Review → Develop → Merge → Complete)
- Maturity model and dependency gating (P070)
- Typed dependencies (P071) — soft vs hard deps
- Acceptance criteria and reviews
- Proposal budgeting (`budget_limit_usd` per proposal)
- SMDL workflow definitions

**Database tables**: `proposal`, `proposal_version`, `proposal_valid_transitions`, `proposal_state_transitions`, `proposal_acceptance_criteria`, `proposal_dependencies`, `proposal_discussions`, `proposal_reviews`

**MCP tools**: `prop_*`, `prop_create`, `prop_edit`, `prop_get`, `prop_list`, `prop_pickup`, `prop_claim`, `prop_release`, `prop_transition`, `prop_search`, `prop_queue`, `prop_deps_graph`

**Gap analysis**:
- ✅ State machine implemented (file-based + Postgres)
- ✅ Dependency tracking exists (`proposal_dependencies`)
- ⚠️ Maturity gating not wired to transitions (P070)
- ⚠️ Dependency types not implemented (P071)
- ❌ Proposal-level budgeting not enforced
- ❌ `prop_queue` tool doesn't exist yet

---

### 2. 👥 Workforce — The *Who*

**Responsibility**: Agent lifecycle, team formation, assignment, capability management

**What it owns**:
- Agent registration, identity, capabilities, roles
- Dynamic team building for proposals
- Agent assignment and claim management
- Agent status and heartbeat tracking
- Skill matrix and role definitions
- Clearance levels and ACLs

**Database tables**: `agent_registry`, `agent_memory`, `team`, `team_member`

**MCP tools**: `agent_list`, `agent_register`, `agent_deregister`, `agent_status`, `team_create`, `team_accept`, `team_decline`, `team_dissolve`, `team_roster`, `team_register_agent`

**Gap analysis**:
- ✅ Agent registration works
- ✅ Team tools exist
- ⚠️ Team building is not proposal-driven
- ❌ No capability/skill matrix implemented
- ❌ No ACL enforcement
- ❌ Agent-heartbeat-driven status tracking incomplete

---

### 3. ⚡ Efficiency — The *How Fast and Cheap*

**Responsibility**: Memory management, context optimization, caching, model selection, cost tracking

**What it owns**:

**Memory Management** (P072):
- 4-layer model: identity, constitution, project, task
- Memory lifecycle: store → refresh → cleanup
- TTL-based task memory expiry
- Cross-agent memory sharing policies

**Context Optimization**:
- Context window budget management
- What to inject, when, how much
- Lazy-load vs pre-load strategies
- Context handoff between agents

**Cache Strategy**:
- pgvector vector cache management
- Embedding generation and indexing
- HNSW index optimization
- Cache invalidation on state changes

**Model Management & Tracking**:
- Model registry (name, cost/token, speed, capabilities)
- Model selection per task type
- Token usage tracking
- Cost-per-proposal attribution
- Budget enforcement and circuit breakers

**Database tables**: `agent_memory` (4-layer), `model_metadata`, `spending_caps`, `spending_log`

**MCP tools**: `mem_set`, `mem_get`, `mem_delete`, `mem_search`, `mem_list`, `mem_summary`, `mem_refresh`, `mem_cleanup`, `mem_promote`, `model_list`, `model_recommend`, `spending_report`, `spending_cap_set`, `spending_alert`

**Gap analysis**:
- ✅ `agent_memory` table exists (empty — 0 rows)
- ✅ `model_metadata`, `spending_caps`, `spending_log` tables exist
- ✅ Basic memory MCP tools implemented (set/get/delete/search)
- ❌ No TTL/cleanup logic
- ❌ No context optimization framework
- ❌ No embedding generation pipeline
- ❌ No model selection logic
- ❌ Spending caps not enforced
- ❌ No real-time spend visibility

---

### 4. 🔧 Utility — The *How to Access*

**Responsibility**: All interfaces for agents and humans — MCP tools, messaging, dashboards, CLI

**What it owns**:

**MCP Infrastructure**:
- MCP server (port 6421)
- Tool registration and routing
- SSE/WebSocket transport
- Tool validation schemas

**Messaging**:
- Agent-to-agent messaging (group + DM)
- Agent-to-human notifications
- Channel management (subscribe/unsubscribe)
- Real-time events and pub/sub

**Human Visibility**:
- TUI cockpit (terminal dashboard)
- Web dashboard (real-time monitoring)
- Mobile control centre (remote approvals, alerts)

**Developer Utilities**:
- Naming convention tools
- Export/import tools
- Merge status tracking
- Health checks and diagnostics

**MCP tools**: `chan_list`, `chan_subscribe`, `msg_read`, `msg_send`, `naming_validate`, `naming_examples`, `export_*`, `health_*`, `workflow_list`

**Gap analysis**:
- ✅ MCP server running, 67 tools registered
- ✅ Messaging layer operational (group + DM + channels)
- ✅ Naming tools working
- ⚠️ TUI exists but not production-ready
- ❌ Web dashboard not started
- ❌ Mobile control centre not started
- ❌ No export tool
- ❌ No health check tooling

---

## Multi-Level Financial Tracking

Budgeting and spending tracked at multiple levels:

| Level | What | Tables/Tools |
|---|---|---|
| **Agent** | Per-agent daily cap, freeze on overage | `spending_caps`, `spending_log` |
| **Proposal** | Budget allocated vs actual per proposal | `proposal.budget_limit_usd`, `spending_log.proposal_id` |
| **Model** | Spend per model, cost optimization | `model_metadata`, aggregate from logs |
| **Team** | Aggregate spend for proposal team | Sum of member spending |
| **System** | Total daily/monthly burn, trends | Aggregate dashboard |

**Circuit breaker**: When an agent exceeds `daily_limit_usd → is_frozen = true`, it stops picking up work until un-frozen.

---

## Module Dependency Graph

```
Proposal (core)
    ↓ depends on
Workforce (who executes proposals)
    ↓ feeds into
Efficiency (how to execute fast/cheap)
    ↓ accessed through
Utility (interfaces for agents + humans)
```

- **Proposal** is the central orchestrator — everything connects to it
- **Workforce** provides the agents that execute proposals
- **Efficiency** optimizes how agents work (memory, context, models, cost)
- **Utility** is the access layer — no logic, just interfaces

---

## Acceptance Criteria

- [ ] All existing code reorganized under 4-module structure (no functional changes, just alignment)
- [ ] `domain.md` updated with definitive module boundaries
- [ ] Each module has a clear owner and roadmap
- [ ] Gap analysis validated against live codebase and database
- [ ] Priority ranking established for closing gaps
- [ ] MCP tools renamed/organized by module (consistency check)
- [ ] Multi-level financial tracking implemented (Proposal + Efficiency modules)
- [ ] TUI dashboard shows 4-module status overview

---

## Priority

**Critical** — This is the foundational architecture. All future proposals, code, and tools should align to these 4 modules. Without clear boundaries, the system drifts into "folder fatigue" and agents don't know where to look for what.
