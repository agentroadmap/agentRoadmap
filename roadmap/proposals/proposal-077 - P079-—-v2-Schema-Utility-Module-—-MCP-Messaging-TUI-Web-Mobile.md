---
id: PROPOSAL-077
title: 'P079 — v2 Schema: Utility Module — MCP, Messaging, TUI, Web, Mobile'
status: Draft
assignee: [Gilbert]
builder: Gilbert
auditor: Skeptic
created_date: '2026-04-06 02:59'
labels: []
domain_id: UTILITY
proposal_type: TECHNICAL
category: FEATURE
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the Utility pillar of the v2 data model.

Tables:
- mcp_tool_registry (catalogue of all MCP tools: name, schema, version, category)
- mcp_tool_assignment (per-agent tool enablement with override flag)
- message_ledger (agent-to-agent messaging, channel routing, type validation)
- notification (multi-surface targeting: TUI, web, mobile, all)
- notification_delivery (per-surface delivery receipts with acknowledged_at)
- user_session (surface, token, preferences, expiry)
- attachment_registry (files, images, documents with content hash + vision summary)
- scheduled_job (cron registry for maintenance: lease reaper, memory purge, profile sync)
- webhook_subscription (external system event subscriptions)
- audit_log (cross-entity audit trail for ACL, budget, agent, resource changes)
- proposal_event (transactional outbox — state changes trigger events atomically)

Triggers:
- fn_proposal_event_trigger (on proposal status change → insert proposal_event)
- fn_notify_roadmap_events (pg_notify for real-time agent wakeups)
- fn_audit_sensitive_tables (AFTER changes on acl, spending_caps, agent_registry, resource_allocation)

DDL sources:
- roadmap/docs/data_model/roadmap-ddl-v2.sql (mcp_tool_registry, message_ledger, notification, user_session, attachment_registry)
- roadmap/docs/data_model/roadmap-ddl-v2-additions.sql (proposal_event, webhook_subscription, scheduled_job, audit_log, notification_delivery, pg_notify trigger)
<!-- SECTION:DESCRIPTION:END -->
