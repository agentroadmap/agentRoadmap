---
id: PROPOSAL-076
title: 'P078 — v2 Schema: Efficiency Module — Models, Context, Cache, Memory'
status: Draft
assignee: [Carter]
builder: Carter
auditor: Skeptic
created_date: '2026-04-06 02:59'
labels: []
domain_id: EFFICIENCY
proposal_type: TECHNICAL
category: FEATURE
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the Efficiency pillar of the v2 data model.

Tables:
- model_metadata (LLM catalog with cost, context window, capabilities)
- model_assignment (proposal type + pipeline stage routing)
- context_window_log (per-call token tracking, FK to run_id)
- cache_write_log (immutable write records, FK to model)
- cache_hit_log (append-only hit records — replaces mutable hit_count)
- agent_memory (4-layer memory with TTL eviction, pgvector HNSW index)
- prompt_template (versioned system prompts, type/stage lookup)
- embedding_index_registry (tracks embedding model + staleness)

Key changes:
- cache_hit_log is append-only (fixes race condition on mutable hit_count)
- run_id becomes FK → run_log table (not yet created — dependency)
- agent_memory uses pgvector(1536) for embedding storage

DDL sources:
- roadmap/docs/data_model/roadmap-ddl-v2.sql (model_metadata, agent_memory)
- roadmap/docs/data_model/roadmap-ddl-v2-additions.sql (cache_hit_log, run_log, prompt_template, embedding_index_registry)
<!-- SECTION:DESCRIPTION:END -->
