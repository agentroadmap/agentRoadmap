# P446 — MCP Runtime Reliability

> **Type:** issue  **Parent:** P429  **MCP-tracked:** Yes  **Source-of-truth:** Postgres `roadmap_proposal.proposal` row P446

This is a design note paired with MCP proposal P446. The MCP/Postgres record is canonical (CONVENTIONS.md §0); this file is a synced projection of the design context.

## Problem

Proposal workflow depends on MCP, but MCP failures currently surface as opaque transport errors such as `Transport closed`. Operators cannot quickly distinguish service-down, transport incompatibility, database reachability, handler errors, or stale deployment code.

## Proposal

Make MCP health, transport compatibility, and proposal-tool readiness observable and testable.

## Acceptance Criteria

1. MCP exposes a direct smoke-test path for `initialize`, `tools/list`, and `tools/call`.
2. MCP health checks report service health separately from database reachability.
3. Proposal-tool failures return structured errors instead of closing the transport.
4. The deployed service path, git revision, project root, database host, and schema are visible without exposing secrets.
5. A runbook explains how to deploy, restart, and verify MCP before agents depend on it.

## Dependencies

- P410 Control Database Boundary
