# Agent-Native Product Development — Feature Matrix

## Vision
**Any team can turn a visionary idea into a shipped product — using an agent team that handles 90% of the work.**

---

## 1. Workflow Engine

| Feature | Description | Priority |
|---------|-------------|----------|
| **State Machine** | Proposal → Draft → Accepted → Active → Review → Complete | Core |
| **Phase Gates** | G1=Design Review, G2=Build Complete, G3=Test Passed, G4=Ship | Core |
| **DAG Dependencies** | States declare dependencies, auto-unblock when ready | Core |
| **Parallel Execution** | Multiple states active simultaneously across cubics | Core |
| **Auto-Transition** | States move forward when ACs met and verified | High |
| **Escalation Paths** | When agent can't proceed, route to human or higher-tier agent | High |

## 2. Autonomous Research

| Feature | Description | Priority |
|---------|-------------|----------|
| **Context Gathering** | Agent autonomously researches before proposing solutions | High |
| **Codebase Scanning** | Read existing code, understand architecture | High |
| **Web Research** | Fetch docs, APIs, frameworks, best practices | Medium |
| **Pattern Matching** | Identify similar problems solved in the codebase | Medium |
| **Research Memory** | Cache findings across agents, avoid redundant research | Medium |

## 3. Human Injection & Oversight

| Feature | Description | Priority |
|---------|-------------|----------|
| **Gate Approvals** | Human approves G1 (design) and G4 (ship) decisions | Core |
| **Veto Power** | Human can reject any agent decision with rationale | Core |
| **Context Injection** | Human adds context mid-workflow without breaking flow | High |
| **Approval Queues** | Batch pending decisions for efficient human review | High |
| **Escalation Alerts** | Agent flags uncertainty → human gets pinged | Medium |
| **Priority Override** | Human can reprioritize work, inject urgent tasks | Medium |

## 4. Smart Collaboration

| Feature | Description | Priority |
|---------|-------------|----------|
| **Cubic Handoffs** | Structured messages between agent phases | Core |
| **Peer Review** | Agent reviews another agent's work automatically | High |
| **Conflict Resolution** | When agents disagree, escalate with context | Medium |
| **Shared Context** | Agents share research, patterns, decisions via Postgres | High |
| **Async Messaging** | Non-blocking inter-agent communication | Medium |

## 5. Instant Implementation

| Feature | Description | Priority |
|---------|-------------|----------|
| **Code Generation** | Write code from ACs + design specs | Core |
| **Test Generation** | Auto-generate tests from ACs | Core |
| **Sandbox Execution** | Run code in isolated environment | Core |
| **Hot Reload** | See changes instantly without full rebuild | High |
| **Multi-Language** | Support TypeScript, Python, Rust, Go, etc. | High |
| **Framework Awareness** | Understand React, Express, Django patterns | Medium |

## 6. Token & Model Efficiency

| Feature | Description | Priority |
|---------|-------------|----------|
| **Tiered Models** | Design=Claude Opus, Build=Claude Sonnet, Test=GPT-4o | Core |
| **Context Pruning** | Remove irrelevant context from agent windows | High |
| **Prompt Caching** | Cache system prompts and repeated context | High |
| **Batch Operations** | Group similar tasks to reduce overhead | Medium |
| **Cost Tracking** | Real-time token usage and cost per state | High |
| **Budget Limits** | Hard stops at configured spend thresholds | Medium |
| **Model Switching** | Dynamically switch models mid-task based on complexity | Medium |

## 7. Agent Expertise Management

| Feature | Description | Priority |
|---------|-------------|----------|
| **Skill Registry** | Agents declare skills (languages, frameworks, domains) | Core |
| **Capability Matching** | Route tasks to agents with matching skills | Core |
| **Expertise Levels** | Junior/Mid/Senior routing based on task complexity | High |
| **Skill Decay** | Track recency of skill use, prioritize fresh expertise | Medium |
| **Learning Signals** | Track what worked/didn't to improve routing | Medium |

## 8. Agent Team Building

| Feature | Description | Priority |
|---------|-------------|----------|
| **Role Definition** | Architect, Builder, Tester, Reviewer, PM roles | Core |
| **Dynamic Assembly** | Auto-pick team based on project requirements | High |
| **Invitation Flow** | Agents accept/decline based on availability | High |
| **Team Lead Selection** | Auto-select lead by role priority | Medium |
| **Dissolution Protocol** | Clean team teardown when project completes | Medium |
| **Cross-Project Teams** | Agents work across multiple projects | Low |

## 9. Budget Control

| Feature | Description | Priority |
|---------|-------------|----------|
| **Per-State Budgets** | Estimated tokens/cost per state | High |
| **Project Budgets** | Total budget cap per project | High |
| **Real-Time Tracking** | Live spend dashboard | High |
| **Cost Optimization** | Auto-downgrade model when nearing budget | Medium |
| **ROI Metrics** | Cost vs. value delivered per state | Medium |
| **Alert Thresholds** | Warn at 75%, hard stop at 100% | High |

## 10. Time to Market

| Feature | Description | Priority |
|---------|-------------|----------|
| **Critical Path** | Identify bottlenecks in dependency chain | High |
| **Parallel Optimization** | Maximize concurrent work | High |
| **ETA Estimates** | Predict completion based on velocity | Medium |
| **Blocker Detection** | Flag stuck states, escalate immediately | High |
| **Milestone Tracking** | Phase completion with dates | Medium |
| **Velocity Metrics** | States completed per day/week | Medium |

---

## Cubic Architecture (Phase Isolation)

```
┌─────────────┐   G1   ┌─────────────┐   G2   ┌─────────────┐   G3   ┌─────────────┐
│   DESIGN    │───────▶│    BUILD    │───────▶│    TEST     │───────▶│    SHIP     │
│   (Opus)    │        │   (Sonnet)  │        │   (GPT-4o)  │        │   (Haiku)   │
└─────────────┘        └─────────────┘        └─────────────┘        └─────────────┘
      │                      │                      │                      │
      ▼                      ▼                      ▼                      ▼
  [Research]            [Code Gen]             [Test Run]            [Deploy]
  [Design Doc]          [Implement]            [Coverage]            [Release]
  [AC Draft]            [Self-Test]            [Review]              [Monitor]
```

Each cubic is an **isolated sandbox** with specialized agents. Phases hand off via structured messages.

---

## Agent Roles

| Role | Phase | Responsibility |
|------|-------|----------------|
| **PM** | All | Orchestrate, route, monitor, trigger gates |
| **Architect** | Design | Research, design, draft ACs |
| **Builder** | Build | Implement code from ACs |
| **Tester** | Test | Write/run tests, verify ACs |
| **Reviewer** | Review | Peer review, approve/reject |
| **Shipper** | Ship | Deploy, monitor, rollback |

---

## What This Unlocks

For any team with an idea:
1. **Define** — PM drafts the roadmap as states
2. **Assemble** — System picks agent team based on requirements
3. **Execute** — Agents work autonomously through phases
4. **Review** — Humans approve key gates, inject context
5. **Ship** — Product ships with tests, docs, monitoring

**Target: Idea → Production in days, not months.**
