# Agent Security Isolation Architecture

## Overview

Each agent instance runs inside a **security perimeter** defined by three independently enforced layers:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Git identity          (who authored commits)   │
│  Layer 2: Postgres role         (what DB ops are allowed)│
│  Layer 1: Worktree filesystem   (what code is touched)   │
└─────────────────────────────────────────────────────────┘
```

No single layer is sufficient alone. All three work together.

---

## Layer 1 — Worktree Isolation

Every agent operates exclusively inside its own git worktree under `/data/code/worktree/`.

| Worktree path                        | Branch             | Agent          |
|--------------------------------------|--------------------|----------------|
| `/data/code/worktree/claude-andy`    | `claude/andy`      | Andy (Claude)  |
| `/data/code/worktree/claude-bob`     | `claude/bob`       | Bob (Claude)   |
| `/data/code/worktree/claude-carter`  | `claude/carter`    | Carter (Claude)|
| `/data/code/worktree/gemini-one`     | `gemini/one`       | Gemini One     |
| `/data/code/worktree/copilot-one`    | `copilot/one`      | Copilot One    |
| `/data/code/worktree/openclaw-gilbert` | `openclaw/gilbert` | Gilbert (merger) |
| `/data/code/worktree/openclaw-skeptic` | `openclaw/skeptic` | Skeptic (critic) |
| `/data/code/worktree/openclaw-alpha`   | `openclaw/alpha`   | OpenClaw α (contract) |
| `/data/code/worktree/openclaw-beta`    | `openclaw/beta`    | OpenClaw β (contract) |
| `/data/code/worktree/openclaw-gamma`   | `openclaw/gamma`   | OpenClaw γ (contract) |

**Rules enforced by agent-spawner:**
- The agent's `cwd` is set to its worktree — never `main`.
- `GIT_DIR` is not set (git resolves via the `.git` file pointer).
- An agent may not push directly to `main` — all merges go through a pull request gate.

---

## Layer 2 — Postgres Role Isolation

Three roles control DB permissions (migration `007-agent-security-roles.sql`):

| Role          | SELECT | INSERT | UPDATE | DELETE | Notes                        |
|---------------|--------|--------|--------|--------|------------------------------|
| `agent_read`  | ✓      | ✗      | ✗      | ✗      | Observers, read-only probes  |
| `agent_write` | ✓      | ✓      | ✓ *    | ✗ **   | All active agents            |
| `admin_write` | ✓      | ✓      | ✓      | ✓      | Orchestrator + migrations    |

\* UPDATE on `proposal` is column-scoped — agents may not change `id`, `created_at`, or `proposal_type`.  
\*\* DELETE on `proposal` is not granted at the DB level. Agents must request it through the MCP destructive-op gate (USER approval required).

Per-agent login users:

| DB user                  | Role          | Worktree           |
|--------------------------|---------------|--------------------|
| `agent_andy`             | agent_write   | claude-andy        |
| `agent_bob`              | agent_write   | claude-bob         |
| `agent_carter`           | agent_write   | claude-carter      |
| `agent_gemini_one`       | agent_write   | gemini-one         |
| `agent_copilot_one`      | agent_write   | copilot-one        |
| `agent_openclaw_alpha`   | agent_write   | openclaw-alpha     |
| `agent_openclaw_beta`    | agent_write   | openclaw-beta      |
| `agent_openclaw_gamma`   | agent_write   | openclaw-gamma     |

Each worktree contains a `.env.agent` file with the correct `DATABASE_URL` for that agent. The spawner sources this file before forking.

---

## Layer 3 — Git Identity

Each worktree has a per-agent gitconfig in:
```
/data/code/AgentHive/.git/worktrees-config/<worktree-name>.gitconfig
```

The spawner passes `GIT_CONFIG_GLOBAL` pointing to this file, ensuring all commits authored inside the worktree carry the agent's identity rather than the host user identity.

```
andy@agenthive.local      ← Claude/Andy
bob@agenthive.local       ← Claude/Bob
carter@agenthive.local    ← Claude/Carter
gemini-one@agenthive.local
copilot-one@agenthive.local
openclaw-alpha@agenthive.local
openclaw-beta@agenthive.local
openclaw-gamma@agenthive.local
```

Commits in the audit trail are then traceable back to the specific agent instance.

---

## Destructive Operation Gate

Any operation that would permanently destroy data requires USER approval:

1. Agent calls MCP tool `destructive_op_request` with the proposed operation and justification.
2. The gate inserts a row into `notification_queue` with severity `URGENT`.
3. The USER is notified (Discord / TUI). Approval or rejection is recorded in `decision_queue`.
4. Only after `outcome = 'approved'` does the orchestrator execute the operation using the `admin_write` role.

Covered operations: `DELETE FROM proposal`, `TRUNCATE`, branch force-push, worktree removal.

---

## Git Snapshot on State Change

When a proposal transitions stage, the orchestrator:
1. Serialises the full proposal state to `roadmap/snapshots/<display_id>-<stage>.md`.
2. Commits it in the `main` worktree under the `agentRoadmap` git user.
3. The commit message includes `proposal_id`, `from_stage`, `to_stage`, and the triggering agent.

This creates an immutable, human-readable audit trail outside Postgres.

---

## Cubic Architecture (now feasible)

With Postgres-backed messaging and per-worktree isolation, the Cubic model can be implemented:

```
  DESIGN  →  BUILD  →  TEST  →  SHIP
  (Opus)    (Sonnet)  (Haiku)  (Haiku)
   claude-andy         claude-bob     claude-carter
```

- Andy (Opus 4.6) authors the design spec in his worktree, commits to `claude/andy`, opens a PR.
- Bob (Sonnet 4.6) polls `message_ledger` for `task` messages, pulls Andy's branch, implements.
- Carter (Haiku 4.5) runs tests, writes results back to `agent_runs`, sends a `status` message.
- Each step is gated by the decision queue — no stage advances without a recorded decision.

The `agent-spawner.ts` handles provider differences (Anthropic CLI, OpenAI-compat, Google SDK) transparently.

---

## Linux Account Isolation (future hardening)

Once the platform is stable, each agent group can be sandboxed at the OS level:

```
useradd -m -s /bin/bash agent_claude
useradd -m -s /bin/bash agent_gemini
useradd -m -s /bin/bash agent_openclaw
```

The spawner would then fork with `uid/gid` dropped to the appropriate account. This is not yet implemented — the Postgres + Git layers are sufficient for current threat model (trusted agent code, untrusted agent data).
