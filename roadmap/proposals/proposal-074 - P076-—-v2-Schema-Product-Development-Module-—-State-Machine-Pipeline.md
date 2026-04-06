---
id: PROPOSAL-074
title: 'P076 — v2 Schema: Product Development Module — State Machine Pipeline'
status: Draft
assignee: [Carter]
builder: Carter
auditor: Skeptic
created_date: '2026-04-06 02:57'
labels: []
domain_id: CORE
proposal_type: TECHNICAL
category: FEATURE
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the Product Development pillar of the v2 data model.

Tables:
- proposal (rewritten: no assigned_to, status validated via proposal_valid_transitions, maturity jsonb)
- proposal_lease (claim/replace model, one active lease per proposal)
- proposal_dependencies + DAG cycle guard trigger (fn_check_dag_cycle)
- proposal_valid_transitions (per-workflow state machine edges)
- proposal_type_config (type → workflow binding)
- workflow_templates, workflow_roles, workflow_stages, workflow_transitions
- proposal_acceptance_criteria, proposal_milestone, proposal_decision
- proposal_discussions, proposal_labels

Views/Triggers:
- v_proposal_queue (DAG-ranked ordering by blocker count)
- v_active_leases (current lease state)
- fn_sync_blocked_flag (auto-update blocked_by_dependencies)
- proposal display_id trigger (P+number format)

Key breaking changes from v1:
- No assigned_to/assigned_at — replaced by proposal_lease
- No status CHECK — validated against proposal_valid_transitions
- maturity is jsonb (stage→label map), not integer
- Priority is DAG-derived, not stored column

DDL source: roadmap/docs/data_model/roadmap-ddl-v2.sql
<!-- SECTION:DESCRIPTION:END -->
