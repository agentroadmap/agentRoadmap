# Product Gap Analysis: agentRoadmap.md

**Author**: Alex (Product Manager)
**Date**: 2026-03-22
**Status**: Analysis Complete

---

## Executive Summary

The agentRoadmap.md project has made strong progress with **24 Reached states** and **6 in progress**. However, analysis of the product vision (DNA.md) against the current roadmap reveals **critical gaps** that could limit adoption, scalability, and long-term viability.

**Key Finding**: The roadmap is execution-heavy (m-6 has 8 states) but underinvested in framework ecosystem, error recovery, and user-facing tooling. With 276 agents but limited states to work on, we need to expand the roadmap with states that unlock agent productivity and reduce friction.

---

## Current State Overview

### States by Milestone

| Milestone | States | Reached | Potential |
|-----------|--------|---------|-----------|
| m-0: Foundation | 000, 002 | 2 | 0 |
| m-1: CLI/TUI | 20 | 1 | 0 |
| m-2: MCP Power-Up | 19 | 1 | 0 |
| m-3: Scout & Map | 11 | 1 | 0 |
| m-4: Proof of Arrival | 10, 10.1, 28, 29, 30 | 5 | 0 |
| m-5: Web Interface | 21, 21.1 | 0 | 2 |
| m-6: Autonomous Execution | 3, 4, 5, 6, 7, 8, 9 | 7 | 0 |
| Cross-milestone | 1, 25, 26, 31-39 | 8 | 2 |

### Status Breakdown
- **Reached**: 24 states
- **In Progress**: 6 states (3 Review, 1 Active, 1 Complete, 1 in Progress)
- **Total**: 30 states

---

## Gap Analysis by Category

### 🔴 Critical Gaps (Blockers for Adoption)

#### GAP-1: Framework Skill Registry & Discovery
**Vision Reference**: "framework-agnostic" — "any agent framework can onboard in seconds"

| Current State | Gap |
|---------------|-----|
| STATE-004 (Framework Onboarding) exists | No mechanism to discover, register, or version skills dynamically |
| Static `skills/` directory | No skill marketplace or auto-discovery when new frameworks emerge |

**Proposed States**:
| State | Description | Milestone |
|-------|-------------|-----------|
| STATE-040 | **Skill Registry & Auto-Discovery** — Runtime skill discovery, versioning, and capability advertisement | m-2 (MCP) |
| STATE-041 | **Framework Adapter Contract** — Standardized interface for any agent framework to plug in | m-0 (Foundation) |

---

#### GAP-2: Error Recovery & Obstacle Management
**Vision Reference**: "Obstacles are not failures; they are new nodes in the graph"

| Current State | Gap |
|---------------|-----|
| STATE-022 (Node.js corruption) exists | Reactive, not systematic |
| STATE-007 (Heartbeat/Recovery) | Covers stale agents, not failed states |
| No obstacle-to-state conversion | Vision promises recursive discovery but no automation |

**Proposed States**:
| State | Description | Milestone |
|-------|-------------|-----------|
| STATE-042 | **Obstacle Node Creation Pipeline** — Auto-convert failed states into obstacle nodes with context capture | m-4 (Proof) |
| STATE-043 | **Automated Recovery Strategies** — Configurable retry/backoff/escalation for obstacle states | m-6 (Execution) |
| STATE-044 | **Failure Taxonomy & Classification** — Standardized error categories for cross-agent understanding | m-4 (Proof) |

---

#### GAP-3: State Dependency Resolution
**Current Gap**: No automated dependency resolution or parallelism optimization

| Current State | Gap |
|---------------|-----|
| STATE-033 (Connectivity/Orphan Detection) | Detects issues, doesn't resolve them |
| DAG exists in MAP.md | No runtime dependency solver or critical path analysis |

**Proposed States**:
| State | Description | Milestone |
|-------|-------------|-----------|
| STATE-045 | **Dependency Graph Solver** — Identify critical path, parallelizable work, and blockage chains | m-6 (Execution) |
| STATE-046 | **Smart Reordering Engine** — Re-prioritize states based on dependency resolution results | m-6 (Execution) |

---

### 🟡 Important Gaps (Limit Scalability)

#### GAP-4: Conflict Resolution & Merge Coordination
**Current Gap**: No multi-agent conflict handling

| Current State | Gap |
|---------------|-----|
| STATE-004 (Lease-Based Claiming) | Prevents conflicts, doesn't resolve them |
| STATE-009 (Negotiation) | Structured handoffs, not conflict resolution |
| Git worktree isolation | Merge conflicts between agents unaddressed |

**Proposed States**:
| State | Description | Milestone |
|-------|-------------|-----------|
| STATE-047 | **Merge Conflict Resolution Protocol** — Automated and semi-automated conflict handling for agent workspaces | m-1 (Collaboration) |
| STATE-048 | **State Ownership Transfer** — Formal mechanism for agents to transfer partial ownership of shared state | m-6 (Execution) |

---

#### GAP-5: Agent Performance Telemetry
**Current Gap**: No agent performance metrics or benchmarking

| Current State | Gap |
|---------------|-----|
| STATE-031 (Push Messaging) | Communication, not telemetry |
| STATE-034 (Provenance Log) | Activity tracking, not performance analysis |

**Proposed States**:
| State | Description | Milestone |
|-------|-------------|-----------|
| STATE-049 | **Agent Performance Dashboard** — Track completion rates, cycle times, error rates per agent | m-5 (Web) |
| STATE-050 | **Agent Scoring & Trust** — Historical performance influences future work assignment priority | m-6 (Execution) |

---

#### GAP-6: Documentation & Knowledge Management
**Current Gap**: No auto-documentation or knowledge capture

| Current State | Gap |
|---------------|-----|
| STATE-011 (Scout/Map) | Creates proposals, doesn't document learnings |
| `roadmap/documents/` | Just created today — no states leverage it |

**Proposed States**:
| State | Description | Milestone |
|-------|-------------|-----------|
| STATE-051 | **Auto-Generated Changelog** — Extract changelog from state transitions automatically | m-5 (Web) |
| STATE-052 | **Learning Capture Pipeline** — Capture insights from completed states for future agents | m-3 (Scout) |

---

### 🟢 Nice-to-Have Gaps (Future Value)

#### GAP-7: External Integration
| Proposed State | Description | Milestone |
|----------------|-------------|-----------|
| STATE-053 | **GitHub/GitLab Integration** — Auto-create PRs/MRs from states, sync status bidirectionally | m-1 |
| STATE-054 | **CI/CD Pipeline Triggering** — Auto-trigger builds when states reach completion criteria | m-4 |

#### GAP-8: Resource Management
| Proposed State | Description | Milestone |
|----------------|-------------|-----------|
| STATE-055 | **Resource Quota Management** — Limits on agent compute, token, or file operations | m-6 |
| STATE-056 | **Cost Tracking & Attribution** — Track resource consumption per agent per state | m-6 |

#### GAP-9: Advanced Collaboration Patterns
| Proposed State | Description | Milestone |
|----------------|-------------|-----------|
| STATE-057 | **Agent Pairing / Mob Programming** — Multiple agents collaborating on single complex state | m-1 |
| STATE-058 | **Async Review Workflows** — Structured review/approval chains for agent deliverables | m-4 |

---

## Recommended Prioritization

### Phase 1: Foundation (Next Quarter)
| Priority | State | Rationale |
|----------|-------|-----------|
| P0 | STATE-040 (Skill Registry) | Blocks true framework-agnostic operation |
| P0 | STATE-041 (Framework Adapter Contract) | Foundational for ecosystem growth |
| P1 | STATE-042 (Obstacle Pipeline) | Vision-core capability, missing automation |

### Phase 2: Scale (Q3)
| Priority | State | Rationale |
|----------|-------|-----------|
| P1 | STATE-045 (Dependency Solver) | Unlocks parallelism optimization |
| P1 | STATE-049 (Agent Telemetry) | Needed for 276+ agent fleet management |
| P2 | STATE-047 (Merge Conflict) | Required as agent count scales |

### Phase 3: Ecosystem (Q4)
| Priority | State | Rationale |
|----------|-------|-----------|
| P2 | STATE-053 (GitHub/GitLab) | External integration for real-world workflows |
| P2 | STATE-051 (Auto Changelog) | Developer experience improvement |
| P3 | STATE-057 (Agent Pairing) | Advanced collaboration pattern |

---

## Milestone Expansion Proposal

The current 7 milestones (m-0 through m-6) are insufficient. Proposed additions:

| New Milestone | Purpose | States |
|---------------|---------|--------|
| **m-7: Ecosystem & Integrations** | External platform connections | 53, 54 |
| **m-8: Agent Intelligence** | Performance tracking, scoring, optimization | 49, 50, 56 |
| **m-9: Knowledge Management** | Auto-documentation, learning capture | 51, 52 |

---

## Quantitative Analysis

### Current Gaps vs. Vision Coverage

| Vision Pillar | States Coverage | Gap Level |
|---------------|-----------------|-----------|
| Local-first collaboration | 8 states | ✅ Strong |
| Autonomous coordination | 7 states | ✅ Strong |
| Easy plug-in | 2 states | 🟡 Weak |
| Framework-agnostic | 1 state | 🔴 Critical |
| Code as truth | 5 states | ✅ Strong |
| Symbolic DAG | 3 states | 🟡 Weak |
| Recursive discovery | 1 state | 🔴 Critical |

### Roadmap Health Metrics

| Metric | Current | Target |
|--------|---------|--------|
| States per milestone (avg) | 4.3 | 5-7 |
| Milestones with 0 in-progress | 4/7 | 0/7 |
| Gaps vs. DNA coverage | 9 identified | 0 |
| Proposed states | 19 new | — |

---

## Appendix: State Numbering

Continuing from STATE-039, new states should be numbered:

| Range | Category |
|-------|----------|
| 40-44 | Gaps 1-3 (Critical) |
| 45-50 | Gaps 4-6 (Important) |
| 51-58 | Gaps 7-9 (Nice-to-Have) |

---

## Next Steps

1. **Review this analysis** with the agent team
2. **Create STATE-040** (Skill Registry) as highest-impact gap fill
3. **Update MAP.md** to include new milestones and states
4. **Establish milestone definitions** for m-7, m-8, m-9
5. **Schedule discovery** for critical gap states (interview agents about pain points)
