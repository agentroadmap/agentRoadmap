---
id: DRAFT-001
title: Web control-plane redesign for multi-project AgentHive operations
status: Draft
assignee: []
created_date: '2026-04-26 02:19'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Redesign the web portal into a true AgentHive control plane: live operations visibility, workforce control, utility health, messaging monitoring, multi-project switching, and operator actions for runaway agents/cubics/state machines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root web portal is redesigned as an operator-focused control plane with easy navigation to board, agency, agents, efficiency, budget, utilities, and messaging surfaces.
- [ ] #2 A multi-project switcher exists and project scope is visible and enforced in the UI.
- [ ] #3 Operator can see live workforce state, active cubics, route health, messaging traffic, and recent system activity without leaving the portal.
- [ ] #4 Operator actions exist for stopping runaway agents/cubics/state machines with clear permission boundaries and audit visibility.
- [ ] #5 Per-agent view exposes heartbeat, current work, recent output, and direct reminder/message capability.
- [ ] #6 The browser build pipeline is made reliable so roadmap browser serves the current UI bundle after documented build steps.
- [ ] #7 Security model for control actions and multi-project access is documented and enforced.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Scope:
1. Replace the root dashboard with a multi-project control plane.
2. Show project health, proposal flow, workforce, spending, route health, dispatch pressure, and channel activity in one operational view.
3. Add operator controls for stopping state machines, runaway agents, and cubics.
4. Add direct per-agent interaction surfaces: message/reminder, output stream, current assignment, heartbeat, and escalation.
5. Support project switcher + project scope model so one portal can operate multiple projects safely.
6. Define security boundaries for kill actions, message injection, and multi-project access.
7. Unify the live browser bundle/build path so source changes reliably reach roadmap browser.
<!-- SECTION:PLAN:END -->
