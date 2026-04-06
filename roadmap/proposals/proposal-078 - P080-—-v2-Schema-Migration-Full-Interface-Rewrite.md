---
id: PROPOSAL-078
title: 'P080 — v2 Schema Migration: Full Interface Rewrite'
status: Draft
assignee: [Andy]
created_date: '2026-04-06 03:05'
labels: []
domain_id: CORE
proposal_type: TECHNICAL
category: FEATURE
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Master task for migrating all database interfaces to the v2 schema.

4 sub-tasks (each tracked as child proposal):
- P074: Product Development Module schema
- P075: Workforce Module schema
- P076: Efficiency Module schema
- P077: Utility Module schema
- P078+: Interface rewrite (MCP tools, CLI, board)
- P079+: DDL apply + migration

Team assignments:
- Bob: Project planning, task tracking, dependency mapping
- Carter: Core implementation (proposal table, MCP pg-handlers, state transitions)
- Gilbert: Schema migration work, DDL fixes, CLI/board updates
- Skeptic: Code review, schema validation, edge case analysis

Source docs: roadmap/docs/data_model/ (4 files committed d1ede45)
<!-- SECTION:DESCRIPTION:END -->
