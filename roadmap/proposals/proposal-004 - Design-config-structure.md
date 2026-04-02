---
id: "proposal-004"
display_id: "TEC-004"
title: "Design config.yml structure for all 16 major components"
status: "New"
proposal_type: "TECHNICAL"
category: "INFRA"
domain_id: "ENGINE"
maturity: 0
parent_id: null
priority: "High"
labels: ["config", "architecture", "components"]
created_date: "2026-04-01"
updated_date: "2026-04-01"
---

# Design config.yml structure for all 16 major components

## Problem

The current `config.yml` is flat and doesn't capture critical information about each major component:

- MCP server URL and port
- SpacetimeDB connection details
- Component-specific settings
- Maturity levels per component

## Requirements

Design a config structure that includes:

### Global Settings
- Project name
- Database connection (provider, name, host, port)
- Default status and lifecycle

### Per-Component Settings (16 total)
Each component needs:
- `enabled` — Is this component active?
- `maturity` — Current maturity level (0-3)
- `port` — Service port (if applicable)
- `url` — Service URL (if applicable)
- `dependencies` — Other components it depends on

### Components to Configure
1. data_model
2. mcp_tools
3. workforce
4. security
5. product
6. pipeline
7. business
8. spending
9. model
10. messaging
11. tui
12. websash
13. mobile
14. project
15. context
16. infrastructure

## Proposed Structure

```yaml
project_name: "AgentRoadmap"

database:
  provider: "spacetime"
  name: "roadmap2"
  host: "127.0.0.1"
  port: 3000

mcp:
  url: "http://localhost:6421"
  health_endpoint: "/health"

components:
  data_model:
    enabled: true
    maturity: 2
    description: "Schema definitions and data structure"
    
  mcp_tools:
    enabled: true
    maturity: 2
    port: 6421
    url: "http://localhost:6421"
    description: "Agent interface for tools and resources"
    
  workforce:
    enabled: true
    maturity: 2
    description: "Agent identity, registration, profiles"
    
  security:
    enabled: true
    maturity: 0
    description: "ACL, audit logging, authorization"
    
  # ... etc for all 16 components

default_status: "New"
statuses: ["New", "Draft", "Review", "Active", "Accepted", "Complete", "Rejected", "Abandoned"]
```

## Benefits

1. **Single source of truth** — All configuration in one place
2. **No hardcoded values** — Code reads from config
3. **Component visibility** — Easy to see what's enabled and at what maturity
4. **Service discovery** — URLs and ports documented
5. **Dependency tracking** — Know what depends on what

## Implementation

1. Update `RoadmapConfig` type in `src/types/index.ts`
2. Add `components` field with per-component config
3. Update MCP server to read from config
4. Add validation at startup
5. Update documentation

## Acceptance Criteria

- [ ] Config structure supports all 16 components
- [ ] Each component has enabled, maturity, and optional service config
- [ ] MCP server reads database name from config
- [ ] No hardcoded values in codebase
- [ ] Config validation at startup
