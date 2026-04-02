---
id: PROPOSAL-004
title: Design config.yml structure for all major components
status: New
assignee: []
created_date: '2026-04-02 00:47'
labels: []
proposal_type: TECHNICAL
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem\n\nAs we add 16 major components, the config.yml needs to be carefully designed to avoid becoming a mess.\n\n## Current config issues\n\n- sdb_database added ad-hoc\n- default_status was wrong\n- No structure for MCP, SDB, Workforce, etc.\n\n## Solution\n\nDesign a structured config with sections for each component:\n\n- sdb: database name, URL, port\n- mcp: server name, port, transport\n- workforce: agent types, defaults\n- pipeline: preflight settings\n- spending: budget limits\n- mobile: alert thresholds\n- tui: display options\n\n## Benefits\n\n- Single source of truth for all config\n- No more hardcoded values\n- Easy to add new components\n- Clear separation of concerns
<!-- SECTION:DESCRIPTION:END -->
