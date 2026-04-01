# Agent-Native Product Development

**Vision:** Any visionary idea → shipped product, powered by an agent team that handles the work.

---

## 1. Workflow Engine

The backbone — states move through phases with gates.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **State Machine** | Proposal → Draft → Accepted → Active → Review → Complete | ✅ Implemented |
| **Phase Gates** | G1=Design Review, G2=Build Complete, G3=Test Passed, G4=Ship | ✅ STATE-091 |
| **DAG Dependencies** | States declare deps, auto-unblock when ready | ✅ STATE-075 |
| **Parallel Execution** | Multiple states active simultaneously | ✅ Current |
| **Auto-Transition** | States move forward when ACs met | 🔜 Proposal |
| **Escalation Paths** | When stuck → route to human or higher-tier agent | 🔜 Proposal |

---

## 2. Autonomous Research

Agents research before they build.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **Context Gathering** | Agent reads codebase, docs, specs before proposing | ✅ Built-in |
| **Web Research** | Fetch frameworks, APIs, best practices | ✅ web_fetch |
| **Codebase Scanning** | Understand existing architecture | ✅ Built-in |
| **Pattern Reuse** | Identify similar solutions already in codebase | 🔜 Proposal |
| **Research Memory** | Cache findings across agents, avoid redundant work | 🔜 Proposal |
| **Decision Logging** | Research → ADR → Implementation trace | ✅ STATE-001 |

---

## 3. Human Notification & Oversight

**Principle:** Humans are informed, not blockers. Agents keep working; humans decide when to intervene.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **Smart Notifications** | Only flag what matters — skip routine decisions | 🔜 Proposal |
| **Multi-Channel Delivery** | Email, Discord, SMS, phone call, mobile push | 🔜 Proposal |
| **Notification Tiers** | Info → Alert → Urgent → Critical (escalates channel) | 🔜 Proposal |
| **Veto Power** | Human can reject any decision, post-facto | ✅ STATE-091 |
| **Context Injection** | Add requirements mid-flow without breaking agent | 🔜 Proposal |
| **Escalation Alerts** | Agent flags uncertainty → notify human | ✅ STATE-091 |
| **Digest Mode** | Batch non-urgent updates into hourly/daily summary | 🔜 Proposal |
| **Do Not Disturb** | Respect quiet hours, batch until morning | 🔜 Proposal |

### Notification Routing

| Severity | Channel | Example |
|----------|---------|---------|
| **Info** | Discord/Digest | "STATE-042 completed tests" |
| **Alert** | Discord + Email | "Budget at 75% for Project X" |
| **Urgent** | Discord + SMS | "G4 blocked — needs human approval" |
| **Critical** | All channels + Phone | "Production deploy failed, rolled back" |

### What Doesn't Block

- ✅ Design reviews (agents proceed unless human vetoes within X min)
- ✅ Code reviews (agents proceed unless human flags)
- ✅ Test results (agents fix and retry)
- ✅ Budget thresholds (agents auto-downgrade model)

### What Does Notify

- 🔔 Phase gate transitions (G1, G2, G3, G4)
- 🔔 Budget milestones (25%, 50%, 75%, 100%)
- 🔔 Agent escalation (uncertainty, conflict)
- 🔔 Production deploy / rollback
- 🔔 Scope changes affecting timeline

---

## 4. Smart Collaboration

Agents work together, not in silos.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **Cubic Handoffs** | Structured messages between phases | ✅ SpacetimeDB messaging |
| **Peer Review** | Agent reviews another agent's work | ✅ STATE-084 |
| **Shared Context** | Agents share research via knowledge base | ✅ STATE-47 |
| **Conflict Resolution** | When agents disagree → escalate with context | 🔜 Proposal |
| **Cross-Cubic Comms** | SpacetimeDB message table for phase handoffs | ✅ Architecture defined |

---

## 5. Instant Implementation

From AC to code, fast.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **Code Generation** | Write code from ACs + design specs | ✅ Built-in |
| **Test Generation** | Auto-generate tests from ACs | ✅ Built-in |
| **Sandbox Execution** | Run code in isolated environment | ✅ STATE-084 |
| **Hot Reload** | See changes without full rebuild | 🔜 Proposal |
| **Multi-Language** | TS, Python, Rust, Go support | ✅ Built-in |
| **Framework Awareness** | React, Express, Django patterns | ✅ Built-in |

---

## 6. Token & Model Efficiency

Smart spending, not just spending.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **Tiered Models** | Design=Opus, Build=Sonnet, Test=GPT-4o, Ship=Haiku | ✅ STATE-093 |
| **Multi-LLM Router** | Right model for right task | ✅ STATE-093 |
| **Cost Tracking** | Real-time token usage per state | ✅ STATE-093 |
| **Context Pruning** | Remove irrelevant context from windows | 🔜 Proposal |
| **Prompt Caching** | Cache system prompts, repeated context | 🔜 Proposal |
| **Budget Limits** | Hard stops at configured spend thresholds | 🔜 Proposal |
| **Model Switching** | Dynamically switch mid-task based on complexity | ✅ STATE-093 |

---

## 7. Agent Expertise Management

Right agent, right task.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **Skill Registry** | Agents declare skills (languages, frameworks, domains) | ✅ STATE-063 |
| **Capability Matching** | Route tasks to agents with matching skills | ✅ STATE-062 |
| **Expertise Levels** | Junior/Mid/Senior routing by task complexity | ✅ STATE-078 |
| **Role Definition** | Architect, Builder, Tester, Reviewer, PM roles | ✅ STATE-078 |
| **Skill Decay** | Track recency of skill use | 🔜 Proposal |
| **Learning Signals** | Track what worked/didn't to improve routing | 🔜 Proposal |

---

## 8. Agent Team Building

Assemble the right team for each project.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **Dynamic Assembly** | Auto-pick team based on project requirements | ✅ STATE-062 |
| **Invitation Flow** | Agents accept/decline based on availability | ✅ STATE-063 |
| **Team Lead Selection** | Auto-select lead by role priority | ✅ STATE-062 |
| **Dissolution Protocol** | Clean team teardown when project completes | ✅ STATE-062 |
| **Workspace Assignment** | Pool-branch + worktree per agent | ✅ STATE-063 |
| **Cross-Project Teams** | Agents work across multiple projects | 🔜 Proposal |

---

## 9. Budget Control

Know exactly where your spend goes.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **Per-State Budgets** | Estimated tokens/cost per state | ✅ STATE-093 |
| **Project Budgets** | Total budget cap per project | 🔜 Proposal |
| **Real-Time Dashboard** | Live spend view (Cubic Dashboard) | ✅ STATE-073 |
| **Cost Optimization** | Auto-downgrade model when nearing budget | ✅ STATE-093 |
| **ROI Metrics** | Cost vs. value delivered per state | 🔜 Proposal |
| **Alert Thresholds** | Warn at 75%, hard stop at 100% | 🔜 Proposal |

---

## 10. Time to Market

Ship faster, not just work faster.

| Feature | What It Does | Status |
|---------|-------------|--------|
| **Critical Path** | Identify bottlenecks in dependency chain | ✅ STATE-003 |
| **Parallel Optimization** | Maximize concurrent work across cubics | ✅ Architecture |
| **ETA Estimates** | Predict completion based on velocity | 🔜 Proposal |
| **Blocker Detection** | Flag stuck states, escalate immediately | ✅ STATE-091 |
| **Milestone Tracking** | Phase completion with dates | ✅ Milestones |
| **Velocity Metrics** | States completed per day/week | ✅ Overview |

---

## Cubic Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRODUCT VISION                           │
│                   (PM / Orchestrator)                       │
└────────────┬────────────────────────────────────────────────┘
             │ routes states to cubics
    ┌────────┴────────┬─────────────────┬─────────────────┐
    ▼                 ▼                 ▼                 ▼
┌────────┐      ┌────────┐      ┌────────┐      ┌────────┐
│ DESIGN │      │ BUILD  │      │ TEST   │      │ SHIP   │
│ (Opus) │─────▶│(Sonnet)│─────▶│(GPT-4o)│─────▶│(Haiku) │
│        │  G1  │        │  G2  │        │  G3  │        │
└────────┘      └────────┘      └────────┘      └────────┘
   Sandbox        Sandbox         Sandbox         Sandbox
   Isolated       Isolated        Isolated        Isolated
```

Each cubic is an **isolated environment** with specialized agents and models.

---

## Summary: What Makes It Agent-Native

| Traditional | Agent-Native |
|-------------|--------------|
| Humans create tickets | PM agent creates states |
| Humans assign work | System routes by skill |
| Humans code | Builder agents implement |
| Humans write tests | Tester agents generate tests |
| Humans review PRs | Reviewer agents peer review |
| Humans deploy | Shipper agents deploy |
| Humans track progress | Dashboard shows everything |
| Humans budget | Cost tracking is automatic |

**The human role shifts from doer to approver.**
