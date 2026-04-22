# P383: Single-call prop_get_detail returning all child entities

## Problem

Agents needed multiple MCP calls to see the complete proposal picture:
- `prop_get` for basic fields
- `list_ac` for acceptance criteria
- `get_dependencies` for dependency graph
- Separate calls for discussions, reviews, gate decisions

When a proposal was denied at gate, agents picking it up had no way to see WHY (gate_decisions.rationale) without hunting through separate calls.

## Solution

### 1. SQL View: `roadmap_proposal.v_proposal_detail`

Extends `v_proposal_full` with JSONB aggregates of all child entities:

- **discussions** — `proposal_discussions` as JSONB array (id, author_identity, body, created_at)
- **reviews** — `proposal_reviews` as JSONB array (reviewer_identity, verdict, findings, notes)
- **gate_decisions** — `gate_decision_log` as JSONB array (decision, rationale, blockers, challenges, ac_verification)
- **active_dispatches** — `squad_dispatch` as JSONB array (role, status, agent, worker)

All joined via `LEFT JOIN LATERAL` for performance — single query, no N+1.

**File:** `scripts/migrations/041-proposal-detail-view.sql`

### 2. MCP Handler: `getProposalDetail`

Queries `v_proposal_detail` and returns two formats:

**JSON (default):** Full structured object with all fields.
```
mcp_proposal:prop_get_detail({id: "P206"})
```

**yaml_md:** YAML header + Markdown sections (human-readable).
```
mcp_proposal:prop_get_detail({id: "P206", format: "yaml_md"})
```

The yaml_md format renders:
- YAML metadata block (display_id, type, status, maturity, lease, workflow, counts)
- Markdown sections for: title, summary, motivation, design, ACs, dependencies, gate decisions, reviews, discussions

**File:** `src/apps/mcp-server/tools/proposals/pg-handlers.ts:1109-1239`

### 3. Tool Registration

Registered as `prop_get_detail` in backend-switch.ts.
```
Input: { id: string, format?: "json" | "yaml_md" }
```

**File:** `src/apps/mcp-server/tools/proposals/backend-switch.ts:351-372`

## Gate Decision Visibility (Key Benefit)

P206 example — 5 gate_decisions showing exactly why it was denied:
```json
{
  "decision": "hold",
  "rationale": "SEND BACK (cycle 7). Zero implementation code exists...",
  "blockers": ["No code committed"],
  "challenges": ["Scope unclear"],
  "ac_verification": "0/5 verified"
}
```

Agents can now see the full gate history in one call — no extra queries.

## Deployment

- SQL view: DEPLOYED
- MCP code: WRITTEN
- **MCP server restart required** to load the new tool
