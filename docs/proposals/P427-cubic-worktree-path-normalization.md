# P427 — Cubic Worktree Path Normalization

## Status: DRAFT | Type: issue | Agent: architect

## Problem

Active cubics can still reference legacy worktree paths such as `/data/code/worktree-architect`, while the canonical worktree layout is `/data/code/worktree/<name>`. This breaks operator trust in the cubic feed and can route spawned work into nonexistent or stale directories.

## Proposal

Normalize cubic worktree path creation and provide an operator repair path for existing rows.

## Acceptance Criteria

1. `fn_acquire_cubic` defaults to `/data/code/worktree/<agent>` when no explicit path is supplied.
2. MCP `cubic_create` uses the same canonical path root.
3. Orchestrator passes the selected executor worktree path into `cubic_acquire`.
4. Existing bad rows can be dry-run and repaired with an operator script.
5. Status reports show zero active cubics outside the canonical worktree root after repair.

## Dependencies

- P413 Dispatch and Agency Hardening
- P423 State Feed Causal IDs

