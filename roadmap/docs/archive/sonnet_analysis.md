# Copilot Analysis: agentRoadmap.md — Gap Report & Strategic Assessment

> **Author:** GitHub Copilot (Claude Sonnet 4.6)  
> **Date:** 2026-03-16  
> **Purpose:** Cross-reference analysis for comparison with Gemini's assessment.

---

## Executive Summary

`agentRoadmap.md` has a world-class conceptual foundation and a solid collaboration substrate, but the autonomy loop that makes it genuinely "agent-native" is roughly **35% complete**. The gap is not in ambition — the DNA, GLOSSARY, and DAG model are excellent — it's in the mechanical plumbing required for an agent to walk in, find work, claim it, execute it, and self-certify completion *without a human in the loop*.

The two highest-leverage unblocked states right now are **STATE-005** (Agent Registry) and **STATE-008** (Autonomous Pickup), because nothing in the DAG beyond STATE-004 is executable until those exist.

---

## 1. Implementation Gap Analysis

### What Is Fully Implemented

| Feature | Location | Maturity |
|---|---|---|
| State CRUD (create, edit, archive, view) | `src/core/roadmap.ts`, MCP `state_*` tools | ✅ Solid |
| DAG with dependency resolution | `src/core/sqlite-store.ts` + `ContentStore` | ✅ Solid |
| Ready-work discovery (`--ready` filter) | STATE-003 complete | ✅ Solid |
| Lease-based claiming (claim/release/renew) | STATE-004 complete, `StateClaim` type | ✅ Solid |
| File-based chat channels | `src/core/messages/`, MCP `message_*` tools | ✅ Solid |
| Git worktree orchestration setup | `src/commands/orchestrate.ts` | ✅ Solid |
| Framework skills onboarding | `skills/claude-code/`, `skills/copilot/`, `skills/gemini-cli/` | ✅ Good |
| MCP server (stdio) | `src/mcp/server.ts` | ✅ Functional |
| Web/TUI Kanban board | `src/web/`, `src/board.ts` | ✅ Functional |
| Document & milestone management | MCP `document_*`, `milestone_*` tools | ✅ Functional |

### What Is Aspirational (Potential / Not Started)

| Feature | State | Blocking |
|---|---|---|
| Agent Capability Registry (`openclaw.json`) | STATE-005 | STATE-006, STATE-007, STATE-008 |
| Resource-aware pickup scoring | STATE-006 | STATE-008 |
| Heartbeat / stale-agent recovery | STATE-007 | STATE-008, STATE-019 |
| One-step autonomous pickup (`roadmap pickup`) | STATE-008 | The whole autonomy promise |
| Structured negotiation & handoff intents | STATE-009 | Multi-agent coordination |
| Proof of Arrival enforcement (code-level) | STATE-010 | Trust in "Reached" status |
| Exhaustive product-level testing framework | STATE-010.1 | Quality gate |
| Scout/Map proposal loop | STATE-011 | Self-evolving roadmap |
| Daemon-mode persistent MCP service | STATE-019 | Background coordination |
| Gateway Bot (Discord/Slack relay) | STATE-020 | Human-in-the-loop |
| Agent Management Dashboard | STATE-021 | Observability |

**Overall autonomy completeness: ~35%** (STATE-003 and STATE-004 done; the 9 states above are the remaining 65%).

---

## 2. Business & Architectural Weaknesses

### 2.1 Dual Filesystem Nomenclature Confusion

The roadmap content uses `roadmap/states/` for state files (agentRoadmap-native format with `status: Potential/Active/Reached`) while the CLI documentation, AGENTS.md, and CLAUDE.md all reference `roadmap/states/` with `status: Potential/Active/Reached`. This is a genuine source of confusion:

- `roadmap/states/` directory is **empty** in this repository.
- All state files live in `roadmap/states/`.
- The config.yml defines `statuses: ["Potential", "Active", "Reached", "Abandoned"]` but default CLI behavior targets `Potential / Active / Reached`.
- An agent trained on AGENTS.md will use wrong status values when working with this repository.

**Risk:** High — agents will fail to transition states correctly or search for files in the wrong directory.

### 2.2 Proof of Arrival is a Social Contract, Not a Code Contract

The concept is central to DNA.md and ROADMAP_CONTRIBUTING.md, but the codebase enforces **zero validation**. `core.claimState()` and `core.updateState()` accept any status string. An agent can mark `STATUS-5` as "Reached" with an empty final summary and no test output.

The `hype` field exists in the `State` type but is optional and has no validation hook. The `proof` concept doesn't exist in the type system at all.

**Risk:** High — in a multi-agent setup, optimistic agents will self-certify Reached without evidence.

### 2.3 No Agent Identity / Authentication Layer

The `StateClaim` type stores `agent: string` — a free-text field. Any agent can claim to be any other agent. There is no:
- Agent signing / identity verification
- Permission model (who can force-release whose claim?)
- Audit trail (claims don't persist after release)

This is acceptable for a trusted local setup but is a fundamental gap for anything beyond single-operator use.

### 2.4 MCP is stdio-Only — No Persistent Multi-Agent Surface

The MCP server runs only as a stdio process attached to a terminal session. When that session ends, all coordination state is lost (leases may be stale, heartbeats silent). For a platform that promises "persistent multi-agent coordination," this is the biggest architectural gap.

STATE-019 (Daemon-Mode) addresses this but depends on STATE-007 (Heartbeat) and STATE-008 (Pickup), neither of which exists yet.

### 2.5 The `requires` Metadata Has No Consumer

State files carry `requires: ["capability:coding", "capability:testing"]` in their frontmatter. However:
- There is no Agent Registry (STATE-005 pending) that stores agent capabilities.
- There is no matching algorithm (STATE-006 pending) that uses this field.
- The `--ready` filter (STATE-003) does **not** filter by agent capability.

Result: `requires` is documentation-only metadata with no runtime effect.

### 2.6 Chat Messages Have No Structured Intent Protocol

The messaging system (message_send/message_read) works well for human-readable text. But the negotiation vision (STATE-009) requires machine-readable "intents" — Proposal, Claim, Blocker, Handoff. Currently, a message is just `{ from, message, channel }`. Agents must parse natural language to infer coordination semantics. This is fragile and scales poorly.

### 2.7 Test State Pollution

STATE-012 through STATE-018, STATE-023, and STATE-024 are clearly test fixtures (`title: "Test"`, `title: "Multi AC Test"`) living in the production roadmap alongside real states. This makes `roadmap state list --plain` noisy and degrades agent reasoning quality.

---

## 3. Usefulness for AI Agents (Honest Assessment)

### Strengths

- **`--plain` flag is excellent.** The plain-text output format is genuinely well-designed for LLM consumption. No ANSI codes, structured text, consistent layout.
- **MCP surface is clean.** The `state_list`, `state_view`, `state_edit`, `state_claim`, and `message_*` tools are well-documented with JSON schemas — a well-prompted agent can use them immediately.
- **Skills files are the right idea.** Having a `SKILL.md` per framework that explains exactly how to use the tool from that agent's perspective is clever and reduces cold-start friction.
- **DAG model is genuinely agent-friendly.** Dependency tracking, `--ready` filter, and topological thinking map directly onto how an agent reasons about "what can I do next?"
- **Worktree isolation is world-class.** The orchestrate setup (giving each agent a clean git worktree + unique identity) is more sophisticated than most multi-agent frameworks.

### Weaknesses from an Agent's Perspective

- **No `roadmap pickup` command.** The single most important agent UX feature — "give me my next task" — doesn't exist. Agents must: (1) list ready states, (2) filter manually, (3) pick one, (4) claim it. This is multiple tool calls and requires agent judgment that should be automated.
- **No self-registration.** An agent has no way to declare "I am Agent-X, I can do `capability:coding`, I cost 0.003/token, I am available." The `openclaw.json` concept lives only in documentation.
- **Stale leases block work silently.** If an agent crashes mid-task, its lease expires but there's no automatic recovery. The next agent sees the state as "claimed" and must know to use `force: true` — which requires context not always available.
- **No event/webhook system.** An agent cannot subscribe to "notify me when STATE-X becomes ready." It must poll `state list --ready` repeatedly. This burns tokens and creates coordination lag.
- **Proof validation is missing.** An agent that follows the protocol (writes proof, adds final summary) gets no different treatment than one that doesn't. No positive reinforcement for doing it right.

---

## 4. Missing Tools & Skills for Market Adoption

### 4.1 Missing MCP Tools

| Tool Name | Purpose | Blocking State |
|---|---|---|
| `state_pickup` | Atomic "find best ready state and claim it" | STATE-008 |
| `agent_register` | Register agent profile (skills, cost, availability) | STATE-005 |
| `agent_heartbeat` | Signal agent is alive / renew all owned leases | STATE-007 |
| `state_proof_submit` | Attach structured proof to a state before marking Reached | STATE-010 |
| `agent_list` | List all registered agents and their status | STATE-005 |
| `state_ready_scored` | Ready states ranked by fit for requesting agent | STATE-006 |

### 4.2 Missing CLI Commands

| Command | Purpose |
|---|---|
| `roadmap pickup [--agent <name>]` | Autonomous best-fit state pickup |
| `roadmap agent register` | Register/update this agent's capability profile |
| `roadmap agent status` | List all agents, their active claims, and heartbeat status |
| `roadmap agent heartbeat` | Ping to renew all owned leases |
| `roadmap proof submit <state-id>` | Attach proof artifact before completing |
| `roadmap daemon start/stop/status` | Manage the persistent MCP service (STATE-019) |

### 4.3 Missing Discovery Infrastructure

For AI agents to *find* this tool without a human pointing them to it:

- **No MCP Registry listing.** The tool is not listed at `smithery.ai`, `mcpservers.org`, or any MCP discovery hub.
- **npm keywords are weak.** Current keywords: `["cli", "markdown", "kanban", "state", "project-management", "roadmap", "agents"]`. Missing: `mcp`, `model-context-protocol`, `ai-agents`, `autonomous`, `multi-agent`, `llm-tools`.
- **No `.well-known/mcp.json` endpoint.** A hosted version could expose a discovery manifest.
- **No OpenAPI spec for the HTTP server.** The web server (`roadmap browser`) has no machine-readable API documentation.
- **README doesn't lead with "Install as MCP server".** The primary agent discovery path — adding to a `claude_desktop_config.json` or Copilot extension — is buried.

### 4.4 Missing Integration Connectors

| Missing Integration | Market Segment |
|---|---|
| GitHub Issues/Projects sync | Developer teams using GitHub for PM |
| Linear sync | Startup/product teams |
| Jira adapter | Enterprise teams migrating to agent-native |
| LangGraph state machine integration | Python agent framework users |
| CrewAI role-task mapping | Multi-agent swarm frameworks |

---

## 5. How Would an Agent Discover This Tool?

### Current Discovery Path (Manual / Human-Mediated)

1. Human finds `agent-roadmap` on npm or GitHub.
2. Human installs globally: `npm i -g agent-roadmap`.
3. Human adds MCP config to `claude_desktop_config.json` or VS Code settings.
4. Human runs `roadmap init` in their project.
5. Human tells the agent "use roadmap MCP tools to manage tasks."

**Problem:** An autonomous agent operating in a new codebase would not find this tool independently. There is no mechanism for agent-led discovery.

### What a Discovery-Ready Tool Needs

For an agent to discover `agentRoadmap.md` without human help, the following should exist:

**A. In-repo signals (for agents already in a codebase)**
- A `roadmap/` directory with `DNA.md` and `MAP.md` is a strong signal, but agents don't know to look for it.
- A `.roadmap.yml` or `roadmap.config.json` in the project root would be a conventional discovery marker.
- An entry in `.cursor/mcp.json`, `.claude/mcp.json`, or similar agent config directories would trigger auto-registration.

**B. MCP registry presence**
- Listing on `smithery.ai` with a `smithery.yaml` config file is the most reliable way for MCP-native agents (Claude Desktop, Cursor) to find the server.
- The `mcp.so` directory is another emerging hub.

**C. npm discoverability**
- Adding `mcp-server` as a keyword ensures npm search `npx @modelcontextprotocol/create-server` flows surface this.
- The `@modelcontextprotocol` org has a curated list — submitting a PR there would drive significant discovery.

**D. AGENTS.md / CLAUDE.md / GEMINI.md pattern**
- This project already does this correctly — `AGENTS.md` teaches the agent the CLI, `CLAUDE.md` and `GEMINI.md` inject the skill. This is the best current practice.
- **Gap:** The skill files don't include a "bootstrap" section for when `roadmap` is *not yet installed* — an agent in a fresh environment needs `npm i -g agent-roadmap && roadmap init` before any of the skills work.

**E. Self-describing MCP resources**
- The `workflow/` MCP resource type is a good start. Adding a `roadmap://discovery` resource that returns "here is what this tool does and how to start using it" enables agents using resource exploration to onboard themselves.

---

## 6. Prioritized Recommendations

### Critical Path (Must unblock autonomous operation)

1. **Implement STATE-008 first, not STATE-005/6.** A simplified `roadmap pickup` that just picks the first ready state (without scoring) would immediately make the tool useful to agents. Add scoring later.
2. **Add `agent_heartbeat` and stale-lease auto-recovery** (STATE-007 core). Without this, a crashed agent permanently pollutes the ready-work queue.
3. **Enforce Proof of Arrival at the type system level** (STATE-010). Add a required `proof` field to the `Reached` transition guard. Even a string is better than nothing.

### High-Value Quick Wins

4. **Clean up test states** (STATE-012–18, 23, 24). Move to `roadmap/states/archive/test-fixtures/` or delete. They degrade AI output quality.
5. **Fix the nodes/ vs states/ dual structure.** Pick one, document it clearly. The confusion between the two directory names and two status vocabularies is the #1 onboarding failure for new agents.
6. **Add MCP registry listings** (smithery.ai + npm `mcp-server` keyword). Zero-code change, drives discovery.
7. **Add a bootstrap section to all SKILL.md files** covering the case where the tool is not yet installed.

### Strategic Differentiator

8. **Implement the Scout/Map Proposal Loop (STATE-011).** This is what makes the roadmap *self-evolving* and distinguishes it from every other project management tool. No human PM tool does this. It's the killer feature that defines the category.

---

## 7. Competitive Position

| Capability | agentRoadmap.md | Linear | GitHub Projects | Jira |
|---|---|---|---|---|
| Agent-native MCP interface | ✅ | ❌ | ❌ | ❌ |
| Local-first, no accounts needed | ✅ | ❌ | ❌ | ❌ |
| DAG dependency model | ✅ | ⚠️ partial | ❌ | ⚠️ partial |
| Multi-agent lease coordination | ✅ (STATE-004 done) | ❌ | ❌ | ❌ |
| Git worktree agent isolation | ✅ | ❌ | ❌ | ❌ |
| Proof of Arrival enforcement | ❌ (aspirational) | ❌ | ❌ | ❌ |
| Autonomous state pickup | ❌ (pending) | ❌ | ❌ | ❌ |
| Resource-aware agent matching | ❌ (pending) | ❌ | ❌ | ❌ |
| Human UI (web/TUI board) | ✅ | ✅ | ✅ | ✅ |
| Cloud collaboration | ❌ (local only) | ✅ | ✅ | ✅ |

**Conclusion:** The tool is ahead of every human-centric PM tool for agent-native workflows. The competitive risk is not from Jira — it's from other MCP-native project tools emerging in the same space (e.g., GitHub Copilot's own task management, Linear's upcoming AI features). The window to establish this as the canonical agent-native PM layer is 6-12 months.

---

## 8. Open Questions for Gemini Comparison

1. Does Gemini see the `nodes/` vs `states/` naming inconsistency as a significant onboarding blocker?
2. What is Gemini's assessment of the local-first constraint — strategic moat or adoption ceiling?
3. Does Gemini agree that STATE-008 (autonomous pickup) should be prioritized over STATE-005 (registry)?
4. How does Gemini evaluate the proof-of-arrival gap — is it a quality concern or a trust/security concern?
5. What MCP discovery hubs does Gemini recommend targeting first?

---

*Generated by GitHub Copilot (Claude Sonnet 4.6) on 2026-03-16. Cross-check with `roadmap/docs/gap-analysis.md` and GPT5Analysis.log.*
