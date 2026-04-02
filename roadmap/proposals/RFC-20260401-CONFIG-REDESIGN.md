---
id: RFC-20260401-CONFIG-REDESIGN
display_id: TEC-20260401-CONFIG-REDESIGN
proposal_type: TECHNICAL
category: INFRA
domain_id: ENGINE
title: "Config.yml Redesign for Critical Infrastructure Info"
status: Draft
maturity: 0
summary: "Redesign config.yml to include MCP server URL, port, SDB database name, and other critical infrastructure info."
---

# Config.yml Redesign for Critical Infrastructure Info

## Problem
The current `config.yml` lacks critical infrastructure information:
- MCP server URL and port
- SpacetimeDB database name
- Git remote URL
- Health check endpoints

## Proposed Config Structure

```yaml
project_name: "AgentRoadmap"
sdb_database: "roadmap2"
default_status: "New"
statuses: ["New", "Draft", "Review", "Active", "Accepted", "Complete", "Rejected", "Abandoned"]
labels: ["feature", "bugfix", "refactor", "docs"]
date_format: yyyy-mm-dd
max_column_width: 80
auto_open_browser: true
default_port: 6420
remote_operations: true
auto_commit: true
zero_padded_ids: 3
bypass_git_hooks: false
check_active_branches: true
active_branch_days: 30
proposal: "proposal"

# Critical Infrastructure
mcp:
  url: "http://localhost:6421"
  health_endpoint: "/health"
  tools_count: 40

sdb:
  database: "roadmap2"
  url: "http://127.0.0.1:3000"
  api_version: "v1"

git:
  remote: "gitlab.local:agentRoadmap/agentRoadmap.git"
  default_branch: "main"
  worktree_path: "/data/code/agentRoadmap-carter"

paths:
  proposals: "roadmap/proposals"
  archive: "roadmap/archive"
  docs: "roadmap/docs"
```

## Benefits
1. Single source of truth for all infrastructure
2. MCP server reads config instead of hardcoding
3. Easy to change database or MCP URL
4. Self-documenting configuration

## Implementation
1. Update `config.yml` with new structure
2. Update MCP server to read from config
3. Update TypeScript code to use config values
4. Add validation for required fields
