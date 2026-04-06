---
id: PROPOSAL-004
title: Agent Profile Upgrade — GitHub Sync & Personality Injection
status: New
assignee: []
created_date: '2026-04-02 02:03'
updated_date: '2026-04-02 02:11'
labels:
  - database
  - mcp
  - workforce
proposal_type: CAPABILITY
category: FEATURE
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
# Agent Profile Upgrade — Implementation Plan

## Goal

Implement the agency-sync pattern for agentRoadmap:
- Store agent personality profiles (SOUL.md, IDENTITY.md, AGENTS.md) in Postgres
- Sync from GitHub using SHA-based diffing
- Inject agent personality via MCP tools
- Manage agents centrally instead of local file copies

## Reference Architecture (from Claude)

```
GitHub (agency-agents repo)
    ↓  fetch .md profiles via API
Parser (github.ts)
    ↓  AgentProfile[]
Splitter (openclaw.ts)
    ↓  { soul, identity, agents }
Postgres (postgres-module.rs)
    ↓  agent_profile table
MCP Server (mcp-server.ts)
    ↓  inject_agent, list_agents, get_agent_soul
OpenClaw session
```

### Reference Postgres Schema

```rust
pub struct AgentProfile {
    #[primarykey]
    pub agent_id:    String,     // e.g. "frontend-developer"
    pub category:    String,     // e.g. "engineering"
    pub file_path:   String,     // GitHub source path
    pub sha:         String,     // For diff detection
    pub soul_md:     String,     // SOUL.md content
    pub identity_md: String,     // IDENTITY.md content
    pub agents_md:   String,     // AGENTS.md content
    pub updated_at:  String,     // Last sync timestamp
}
```

### Reference MCP Tools

| Tool | Args | Returns |
|------|------|---------|
| `list_agents` | `category?` | List of agents with IDs |
| `get_agent_soul` | `agentId` | SOUL.md content |
| `get_agent_identity` | `agentId` | IDENTITY.md content |
| `get_agent_rules` | `agentId` | AGENTS.md content |
| `inject_agent` | `agentId` | All three layers + injection prompt |

## Current agentRoadmap Schema

### WorkforceRegistry
```rust
pub struct WorkforceRegistry {
    #[primary_key]
    pub identity: String,       // Crypto hash (Postgres identity)
    pub agent_id: String,       // Readable ID (e.g. "CODE-01")
    pub role: String,
    pub is_active: bool,
}
```

### WorkforcePulse
```rust
pub struct WorkforcePulse {
    #[primary_key]
    pub identity: String,
    pub active_proposal_id: Option<u64>,
    pub last_seen_at: u64,
    pub status_message: String,
    pub is_zombie: bool,
}
```

### AgentMemory
```rust
pub struct AgentMemory {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub agent_identity: String,
    pub scope_proposal_id: u64,
    pub key: String,
    pub val: String,
    pub updated_at: u64,
}
```

## What's Missing

Our current schema has **no fields for agent personality content**. To implement the reference design, we need:

| Missing Capability | Current State | Required |
|--------------------|---------------|----------|
| Personality storage | Not in DB, local files only | `soul_md`, `identity_md`, `agents_md` columns |
| GitHub SHA sync | No sync mechanism | `sha`, `source_path` columns + sync workflow action |
| Category filtering | Only `role` field | `category` field |
| MCP injection | No inject tool | `agent_inject` MCP tool |
| Personality lookup | By crypto identity | By `agent_id` string |

## Database Redesign Options

### Option A: Extend WorkforceRegistry

Add columns to existing table:
- `soul_md: String`
- `identity_md: String`
- `agents_md: String`
- `category: String`
- `source_sha: String`
- `source_path: String`

**Pros:** Simple, no new table
**Cons:** Mixes runtime state (heartbeat, zombie) with content (personality). Large text fields in every row. Schema is getting bloated.

### Option B: New AgentProfile table (recommended)

Create a separate table for personality content:

```rust
#[table(accessor = agent_profile, public)]
pub struct AgentProfile {
    #[primary_key]
    pub agent_id: String,       // Matches WorkforceRegistry.agent_id
    pub category: String,
    pub source_path: String,    // GitHub path
    pub source_sha: String,     // For diff detection
    pub soul_md: String,
    pub identity_md: String,
    pub agents_md: String,
    pub synced_at: u64,
}
```

**Pros:** Clean separation. Runtime state in `WorkforceRegistry`, content in `AgentProfile`. Can update personality without touching heartbeat.
**Cons:** Two tables to join. New table means new workflow actions.

### Option C: Hybrid — AgentProfile + link existing

Keep `WorkforceRegistry` and `WorkforcePulse` as-is. Add `AgentProfile` for content. Link by `agent_id`.

```
WorkforceRegistry (runtime: is alive? what working on?)
    ↓ agent_id
AgentProfile (content: who am I? what's my personality?)
```

## Implementation Steps

1. **Postgres module** — Add `AgentProfile` table + `upsert_agent_profile` workflow action
2. **Sync CLI** — Port `sync.ts` to fetch from GitHub agency-agents repo
3. **MCP tools** — Add `agent_inject`, `agent_profile_get`, `agent_list_by_category`
4. **OpenClaw integration** — `inject_agent` tool loads profile and returns prompt block

## Decision Needed

- Which option (A/B/C)? what is this choice?
- Do we need this now or defer? later
- Which agents should come from GitHub vs local-only? sdb should have init with defaut
<!-- SECTION:DESCRIPTION:END -->
