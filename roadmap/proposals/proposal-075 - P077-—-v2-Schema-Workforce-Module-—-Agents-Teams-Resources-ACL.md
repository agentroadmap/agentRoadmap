---
id: PROPOSAL-075
title: 'P077 — v2 Schema: Workforce Module — Agents, Teams, Resources, ACL'
status: Draft
assignee: [Gilbert]
builder: Gilbert
auditor: Skeptic
created_date: '2026-04-06 02:58'
labels: []
domain_id: WORKFORCE
proposal_type: TECHNICAL
category: FEATURE
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the Workforce pillar of the v2 data model.

Tables:
- agent_registry (agent_identity PK, type: human|llm|tool|hybrid, skills jsonb, preferred_model FK)
- team + team_member (team structure)
- resource_allocation (api_key, worktree, workspace, mcp_tool mappings)
- acl (subject → resource → action access control)
- agency_profile (GitHub-synced agent profiles, cached from agent.json)
- budget_allowance (named budget envelopes: global|proposal|team)
- spending_caps (per-agent limits, auto-freeze trigger)
- spending_log (6dp precision, FK to model + budget)

Triggers:
- fn_check_spending_cap (auto-freeze agent on daily limit breach)
- fn_update_spending_totals (spending log → caps → budget_allowance)

DDL source: roadmap/docs/data_model/roadmap-ddl-v2.sql (pillars 2 + workforce triggers)
<!-- SECTION:DESCRIPTION:END -->
