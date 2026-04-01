# 🗺️ AgentRoadmap

**Autonomous AI Agent-Native Product Development Platform.**

Build your AI agent team. Turn your vision into your dream product — through continuous interaction, continuous research, refinement, and instant prototyping.

---

## What It Is

AgentRoadmap is a CLI + TUI platform for assembling AI agent teams that build products from your vision.

You define what you want. The system assembles the right agent team — architect, builders, testers, reviewers — and they work autonomously through phases: design, build, test, ship. You stay informed. You veto when needed. They keep building.

Not project management. **Product development, agent-native.**

## Features

- **State Management** — Create, edit, track states with rich metadata (ACs, labels, priorities, dependencies)
- **Kanban Board** — Interactive TUI with drag-like navigation, column filters, search
- **Cubic Dashboard** — Agent roster view showing cubics, agents, and model usage
- **Headlines Stream** — Live event feed of all state transitions
- **Pluggable Storage** — Use whatever backend fits your workflow
- **Multi-Agent Support** — Agent identity, claims, handoffs, heartbeat monitoring
- **MCP Integration** — Works with Claude, Cursor, and other MCP-compatible tools

---

## Quick Start

```bash
# Install
npm install -g agent-roadmap

# Initialize
npx agent-roadmap init

# Create a state
npx agent-roadmap state create "My Feature" --status Draft

# Open the board
npx agent-roadmap board
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Switch views (State List → Kanban → Cubic Dashboard → Headlines) |
| `/` | Search |
| `P` | Filter by priority |
| `F` | Filter by labels |
| `I` | Filter by milestone |
| `~` | Toggle empty columns |
| `=` | Toggle Parked/Rejected states |
| `S` | Headlines-only mode (mobile-friendly) |
| `Enter` | View state details |
| `E` | Edit state |
| `M` | Move state |
| `Q` | Quit |

## Architecture

```
┌─────────────────────────────────────────┐
│            TUI / CLI Layer              │
│  (blessed-based interactive board)      │
├─────────────────────────────────────────┤
│           State Management              │
│  (CRUD, transitions, ACs, labels)      │
├─────────────────────────────────────────┤
│           Storage Layer                 │
│  (SpacetimeDB, filesystem, or custom)  │
├─────────────────────────────────────────┤
│           Agent Layer                   │
│  (identity, claims, heartbeats)         │
└─────────────────────────────────────────┘
```

### Storage Flexibility

The storage layer is pluggable — use whatever fits your workflow:

- **Filesystem** — Plain markdown files in Git (default, zero setup)
- **Database** — SQLite, Postgres, SpacetimeDB, or anything with a simple adapter
- **Custom** — Implement the `StorageProvider` interface

No vendor lock-in. Your states stay in your repo.

## Multi-Agent Coordination

Agents can:
- Register with skills and roles
- Claim states via lease-based system
- Send handoff messages
- Receive heartbeat monitoring

```
Agent A (Builder) → claims STATE-042 → implements → hands off
Agent B (Reviewer) → receives handoff → reviews → approves
```

## Configuration

```yaml
# roadmap/config.yml
statuses:
  - Proposal
  - Draft
  - Accepted
  - Active
  - Review
  - Complete

hidden_statuses:
  - Parked
  - Rejected

labels:
  - feature
  - bugfix
  - refactor
  - docs

prefixes:
  state: "STATE"
  draft: "DRAFT"
```

## For AI Agents

If you're an AI agent joining this project:

```bash
# Register your agent
npx agent-roadmap agents register --name "YourName" --role builder

# Check for ready work
npx agent-roadmap state list --status Accepted

# Claim a state
npx agent-roadmap state claim STATE-042

# Submit completion
npx agent-roadmap state complete STATE-042 --proof "commit:abc123"
```

## License

MIT
