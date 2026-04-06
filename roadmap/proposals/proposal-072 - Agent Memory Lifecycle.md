# PROPOSAL-072: Agent Memory Lifecycle — Store, Refresh, Cleanup

**Status**: Proposal
**Author**: Andy
**Priority**: High
**Date**: 2026-04-05
**Category**: FEATURE
**Domain**: EFFICIENCY MANAGEMENT

---

## Summary

Implement the full lifecycle for the 4-layer agent memory system (`agent_memory` table):

1. **Store** — What goes where, when, and how
2. **Refresh** — Load relevant context on each new assignment
3. **Cleanup** — Summarize, promote, or expire task memory when assignments end

The `agent_memory` table and 4 MCP tools (`setMemory`, `getMemory`, `deleteMemory`, `searchMemory`) already exist in code but the table is **empty** — 0 rows. No mechanism populates or rotates memory.

---

## Motivation

Currently:
- OpenClaw persists agent workspace via `MEMORY.md` — a flat file, not structured
- When agents are reassigned, there's no save/load mechanism for task context
- No TTL or cleanup for stale task memory
- No semantic search (embedding column exists but nothing populates it)
- No cross-agent memory sharing

As the agent fleet grows, agents will lose critical context between assignments, repeat past mistakes, and waste tokens re-reading files that should be in project memory.

---

## Design

### 3.1 Four-Layer Memory Model

| Layer | Purpose | Lifetime | TTL? | Shared? |
|---|---|---|---|---|
| **identity** | Agent name, role, capabilities, manifesto | Permanent | No | No |
| **constitution** | Core rules, values, constraints, guardrails | Versioned | No | No |
| **project** | Architecture decisions, domain knowledge, lessons learned | Project lifecycle | Maybe | Yes |
| **task** | Ephemeral task context, progress notes, current learnings | Single assignment | Yes | No |

### 3.2 Store — What Goes Where

**On agent registration:**
```
MEMORY SET(agent_id/identity/name) = "Carter"
MEMORY SET(agent_id/identity/role) = "Senior Developer"
MEMORY SET(agent_id/constitution/rules) = [content from SOUL.md]
```

**On project initialization:**
```
MEMORY SET(system/project/architecture) = [summary of ARCHITECTURE.md]
MEMORY SET(project/domains) = [Identity, State, Orchestration, Storage, Messaging]
```

**On assignment pickup:**
```
MEMORY SET(agent_id/task/{proposal_id}) = {
  proposal: {...},
  acceptance_criteria: [...],
  context: [relevant project memories],
  started_at: timestamp
}
```

**On assignment completion:**
```
TASK memory → summarize → if generalizable, promote to PROJECT layer
→ DELETE task memory
```

### 3.3 Refresh — On New Assignment

When an agent picks up a proposal:

```
1. Load IDENTITY (always)
2. Load CONSTITUTION (always, latest version)
3. Semantic search PROJECT memories
     query = proposal title + description
     return top 10 most relevant
4. Load existing TASK memory if assignment is continuing
5. Create new TASK memory entry for this assignment
6. Inject into agent's context (MEMORY.md + system prompt)
```

**Context budget**: Limit injected memory to fit within token budget. Priority order:
1. Identity + constitution (always loaded — ~500 tokens)
2. Task memory (current assignment — ~1000 tokens)
3. Top 5 project memories (semantic match — ~2000 tokens)
4. Remaining project memories (lazy-load via `searchMemory` on demand)

### 3.4 Cleanup — TTL and Expiry

**Task memory lifecycle:**
- Created when agent picks up proposal
- Updated with progress notes during work
- Summarized and promoted on completion
- TTL: configurable per agent/type (default: 72h for abandoned tasks)
- Abandoned tasks (no heartbeat > TTL) → auto-summarize and archive

**Cleanup trigger:**
- Explicit: agent completes proposal → `prop_complete` triggers memory cleanup
- TTL: background cron job scans for expired task memories
- Manual: `deleteMemory` MCP tool (for admin cleanup)

### 3.5 Semantic Search and Embeddings

The `body_embedding` column exists (vector(1536)) but nothing populates it.

**Options:**
1. **Local embedding** — Run a local embedding model (e.g., nomic-embed-text via Ollama)
2. **API embedding** — Use model provider's embedding API
3. **No embeddings** — Just use key/value + metadata filtering (simpler initially)

**Recommendation**: Start with option 3 (no embeddings), add embeddings later when needed. Most memory retrieval can be done via `layer` + `key` queries. Semantic search is nice-to-have but not required for basic operation.

### 3.6 MCP Tool Enhancements

**Current tools (all exist, just need wiring):**
- `setMemory` — already implemented, just needs callers
- `getMemory` — already implemented
- `deleteMemory` — already implemented
- `searchMemory` — implemented but requires embedding input (option 3 removes this blocker)
- `memoryList` — already implemented
- `memorySummary` — already implemented

**New tools:**
- `memory_refresh` — trigger memory refresh for an agent on assignment
- `memory_cleanup` — trigger cleanup of expired task memories
- `memory_promote` — promote task learning to project memory

### 3.7 Integration with Existing Systems

- **P070 (Maturity/Queue)**: When proposal transitions to Complete → trigger memory cleanup + promote learnings
- **P071 (Typed Dependencies)**: Task memory tracks which dependency types it was waiting on
- **Proposal system**: `prop_get` can optionally include relevant project memories in response
- **Agent registration**: `agent_register` triggers identity/constitution memory creation

---

## Key Design Decisions (To Be Discussed)

These are left open for team discussion:

1. **TTL for task memory** — How long? 24h? 72h? Per-proposal? Per-agent?
2. **What triggers memory refresh** — pickup event? heartbeat? cron? Explicit tool call?
3. **Embedding strategy** — Local model vs API vs skip-for-now (key/value only)
4. **Context injection budget** — How much memory fits in the context window? Need per-agent budget?
5. **Cross-agent memory sharing** — Can Carter see Andy's task learnings? Should project memory be opt-in per agent?
6. **Versioning for constitution** — How to handle constitution updates without breaking existing agents?

---

## Acceptance Criteria

TBD after team discussion on key decisions above.

---

## Dependencies

- P070: Memory cleanup triggered by proposal completion
- None otherwise — extends existing `agent_memory` table and handlers

---

## Priority

**High** — Foundation for the efficiency module. Without it, agents lose context between assignments and repeat work.
