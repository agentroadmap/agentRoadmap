# Cubic Architecture — Agent-Native Product Development

## Concept

A **Cubic** is a permanent, isolated workspace where a small team of agents (coder, reviewer, merger) collaborate on product development tasks.

```
┌─────────────────────────────────────────────────┐
│ PERMANENT CUBIC                                 │
│                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ coder   │  │ reviewer│  │ merger  │        │
│  │ (owner) │  │ (owner) │  │ (owner) │        │
│  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │               │
│       ▼            ▼            ▼               │
│  ┌──────────────────────────────────┐          │
│  │         SHARED STATE             │          │
│  │  • Git worktree (isolated code)  │          │
│  │  • Memory (project context)      │          │
│  │  • Focus (current task)          │          │
│  │  • Postgres (central hub)     │          │
│  └──────────────────────────────────┘          │
└─────────────────────────────────────────────────┘
```

## Key Principles

1. **Permanent** — Cubics persist; agents own them long-term
2. **Isolated** — Each cubic has its own git worktree
3. **Connected** — All cubics communicate via Postgres
4. **Role-based** — Coder, Reviewer, Merger have distinct permissions

## Cubic Structure

```
worktrees/<cubic-id>/
├── coder/           # Coder workspace
│   └── focus.md     # Current coding task
├── reviewer/        # Reviewer workspace
│   └── focus.md     # Current review task
├── merger/          # Merger workspace
│   └── focus.md     # Current merge task
├── memory/
│   └── project.md   # Shared project memory
├── code/            # Actual code (shared worktree)
├── cubic.json       # Configuration
└── AGENTS.md        # Bootstrap
```

## Cubic Configuration (cubic.json)

```json
{
  "id": "cubic-demo",
  "name": "Demo Cubic",
  "phase": "design",
  "ownership": {
    "coder": "cubic-demo-coder",
    "reviewer": "cubic-demo-reviewer",
    "merger": "cubic-demo-merger"
  },
  "assignedStates": ["STATE-012", "STATE-013"],
  "config": {
    "llm": {
      "design": "opus",
      "build": "sonnet",
      "test": "sonnet",
      "ship": "haiku"
    },
    "permissions": {
      "coder": ["state_create", "state_edit", "workflow_claim"],
      "reviewer": ["workflow_review", "proposal_discuss"],
      "merger": ["workflow_complete", "workflow_transition"]
    }
  }
}
```

## Phase Gates

| Gate | Phase | Criteria |
|------|-------|----------|
| G1 | Design → Build | ADR written, requirements clear |
| G2 | Build → Test | Code complete, unit tests pass |
| G3 | Test → Ship | Review approved, integration tests pass |
| G4 | Ship → Done | Merged to main, deployed |

## Communication Flow

```
Agent → Roadmap MCP → Postgres → Other Cubics
           ↑
      (stdio connection)
```

Each agent connects to Postgres via Roadmap MCP tools:
- `state_list` / `state_get` — Read assigned work
- `workflow_claim` / `workflow_transition` — Move work forward
- `message_send` / `message_read` — Communicate with other agents
- `proposal_create` / `proposal_discuss` — Review and discuss

## Creating a Cubic

```bash
# Using the cubic template
./scripts/create-cubic.sh <id> <name> <states>

# Example
./scripts/create-cubic.sh "cubic-auth" "Authentication Feature" '"STATE-100", "STATE-101"'
```

## Agent Spawn

```bash
# Spawn agents into cubic workspaces
openclaw agent create --name cubic-demo-coder --workspace worktrees/cubic-demo/coder
openclaw agent create --name cubic-demo-reviewer --workspace worktrees/cubic-demo/reviewer
openclaw agent create --name cubic-demo-merger --workspace worktrees/cubic-demo/merger
```

## LLM Routing

| Phase | Model | Reason |
|-------|-------|--------|
| Design | Opus | Complex reasoning, architecture decisions |
| Build | Sonnet | Code generation, implementation |
| Test | Sonnet | Test writing, debugging |
| Ship | Haiku | Quick validation, merge tasks |

## Lifecycle

1. **Create** — Cubic spun up with worktree
2. **Assign** — Agents connected, states assigned
3. **Work** — Agents cycle through phases
4. **Ship** — Code merged to main
5. **Repeat** — New task assigned, same cubic continues

## Concurrency Model

### Shared Environment Rules

A cubic is a **shared environment** with sequential access:

| Scenario | Allowed | Notes |
|----------|---------|-------|
| Developer → Tester | ✅ | Phase handoff |
| Same role, sequential | ✅ | One after another |
| Same role, parallel | ❌ | Conflict risk |
| Different agents, recycled | ✅ | Cubic reuse |

### Lock Mechanism

```json
{
  "lock": {
    "holder": "cubic-demo-coder",
    "phase": "build",
    "lockedAt": "2026-03-25T17:25:00Z",
    "expiresAt": "2026-03-25T18:25:00Z"
  }
}
```

**Lock Rules:**
1. Only one agent active at a time
2. Lock expires after 1 hour (auto-release)
3. Phase gate = unlock + handoff
4. Git naturally handles file-level conflicts

### Cubic Recycling

- **Same steps, different agents** — New agents join existing cubic
- **Different steps, same agents** — Focus.md updated, worktree preserved
- **Cross-project reuse** — Worktree can be pruned and recreated

### Handoff Protocol

```
1. Coder completes (workflow_transition → "review")
2. Coder releases lock
3. Reviewer acquires lock
4. Reviewer processes (workflow_review)
5. Reviewer transitions to "testing" or "complete"
6. Merger acquires lock, merges to main
```
