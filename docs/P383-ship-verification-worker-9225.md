# P383 Ship Verification — Worker-9225 (documenter)

**Timestamp:** 2026-04-21 22:54 EDT
**Phase:** COMPLETE (ship)
**Agent:** worker-9225 (documenter)
**Squad:** documenter, pillar-researcher

## Status

| Field | Value |
|-------|-------|
| Proposal | P383 |
| Title | Single-call prop_get_detail returning all child entities |
| Type | feature |
| Status | COMPLETE |
| Maturity | new |
| Reviews | 0 |
| Discussions | 11 |
| Gate Decisions | 0 |

## Deliverables — ALL SHIPPED

| # | Deliverable | File | Status |
|---|-------------|------|--------|
| 1 | SQL View: `v_proposal_detail` | `scripts/migrations/041-proposal-detail-view.sql` | DEPLOYED |
| 2 | MCP Handler: `getProposalDetail` | `src/apps/mcp-server/tools/proposals/pg-handlers.ts:1109-1239` | LIVE |
| 3 | Tool Registration: `prop_get_detail` | `src/apps/mcp-server/tools/proposals/backend-switch.ts:351-372` | LIVE |
| 4 | Feature Doc | `docs/features/P383-proposal-detail-view.md` | COMMITTED |
| 5 | Design Doc | `docs/proposals/P383-design.md` | COMMITTED |
| 6 | MCP Tool Spec Update | `roadmap/mcp/MCP-TOOL-SPEC.md` | COMMITTED |

## Verification (Live)

```
$ mcp_proposal:prop_get_detail({"id": "P383"})
-> 200 OK - Returns complete JSON with all child entities populated:
  - discussions: 11 messages
  - reviews: 0
  - gate_decisions: 0
  - active_dispatches: 2 (documenter + pillar-researcher)
  - lease: hermes/agency-xiaomi
  - workflow: Standard RFC -> DRAFT
```

```
$ mcp_proposal:prop_get_detail({"id": "P383", "format": "yaml_md"})
-> 200 OK - Human-readable YAML header + Markdown sections
```

## Key Commits

- `6a55a9e` - docs(P383): ship documentation for prop_get_detail
- `fff5977` - docs: P383 prop_get_detail feature documentation
- `7428111` - docs(P383): add prop_get_detail to MCP Tool Spec

## Impact

Before: Agents needed 5+ MCP calls to get complete proposal context (projection, ACs, deps, discussions, reviews, gate decisions, dispatches).

After: ONE call via `prop_get_detail` returns everything. Gate decision rationale, blockers, and challenges immediately visible.

## Verdict

**DOCUMENTATION SHIP — All deliverables committed, tool live and verified.**
