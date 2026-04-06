# AgentRoadmap Architecture

## Overview
AgentRoadmap is a "Digital Nervous System" for autonomous AI agent teams. It coordinates work across 100+ agents by separating real-time coordination (Soul), semantic memory (Memory), and physical artifacts (Body).

## Core Pillars
1. **The Soul (Shared State Layer)**: 
   - Primary coordination surface for personalities, budgets, real-time status, and expert registries.
   - Provides durable consistency guarantees to prevent agent race conditions.
2. **The Memory (Vector + Graph)**:
   - Stores research, past discussions, and decision-making context.
   - Provides high-speed retrieval for agent context.
3. **The Body (Git + Filesystem)**:
   - Source of truth for product artifacts (code, designs, documentation).
   - "Git-as-a-Database" pattern ensures auditability and point-in-time recovery.

## Component Domains
- **Identity**: Registry of agents, skills, and unique identities.
- **State**: Lifecycle management of tasks and milestones.
- **Orchestration**: Resource allocation, agent pool management, and reporting.
- **Storage**: Hybrid adapters for the active state layer and local filesystem export.
- **Messaging**: Event-driven communication protocol between agents.

## New Baseline (2026-03-31)
- Transitioned from pure file-based operations to a coordinated state-layer architecture.
- Modularized `src/core` into specialized domain managers.
- Established `roadmap/` as the canonical metadata and documentation home.

## Top Modules
**product development** through autonomous pipeline -state machine with maturity and dependency  - I see at least proposal_decision is missing
**workforce management** - registration, resorce allocation (model api key workspace, worktree etc. ACL), budget allowance, loading profile from agency-agents github
**Efficiency** model management, context management and optimization, cache write, agent memory management, local cache with pgvextor
**Utility** MCP tool, Messaging, User tools: TUI, Web Dash and Mobile App