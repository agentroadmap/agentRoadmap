# Auto-Merge Worktree Changes to Main (P148)

Status: COMPLETE | Type: feature | Maturity: new

## Overview

When an agent finishes a proposal in a worktree, there is no automated path to merge changes back to main and notify other agents. This feature provides three mechanisms: an MCP tool for manual/programmatic merges, a post-merge sync to rebase other active worktrees, and a tool agent that auto-triggers merges on MERGE state transitions.

## Architecture

Three-phase worktree lifecycle automation:

### Phase 1: worktree_merge MCP Tool

Three MCP tools registered under the consolidated proposal router:

| MCP Action        | Tool Name             | Purpose                                                |
|-------------------|-----------------------|--------------------------------------------------------|
| `merge_worktree`  | `worktree_merge`      | Merge a worktree branch back to main for a proposal    |
| `sync_worktrees`  | `worktree_sync`       | Rebase all active worktrees on latest target branch    |
| `merge_status`    | `worktree_merge_status` | Check merge history for a proposal                   |

**worktree_merge workflow:**
1. Validates proposal is in MERGE or COMPLETE state
2. Verifies worktree path exists on disk
3. Detects source branch from worktree HEAD
4. Runs conflict pre-check via `git merge-tree` (falls back to `merge --no-commit --no-ff` then abort)
5. If conflicts detected: records in `worktree_merge_log` with status='conflict', returns file list
6. If clean: runs `git merge --no-ff` in worktree, pushes to origin
7. Records merge commit SHA in `worktree_merge_log` and proposal audit trail

**worktree_sync workflow:**
1. Fetches latest from origin
2. Lists all git worktrees (or accepts explicit paths)
3. Filters out the target branch worktree
4. Rebases each active worktree on `origin/<target>`
5. On rebase conflict: aborts rebase, reports the failure per worktree

### Phase 2: Post-Merge Agent Sync

`worktree_sync` handles propagation. After a successful merge to main, run `worktree_sync` to rebase all active agent worktrees. This ensures agents working on dependent proposals incorporate the latest changes.

### Phase 3: Workflow Integration (Tool Agent)

`MergeExecutor` is a zero-cost tool agent registered in `tool_agent_config`:

```
agent_identity: tool/merge-executor
trigger_type:   queue
trigger_source: transition_queue
handler_class:  MergeExecutor
is_active:      true
config:         { "queueFilter": "to_stage = 'Merge'", "escalateOnConflict": true }
```

When a proposal transitions to the MERGE stage, the transition queue fires, and the MergeExecutor processes it automatically. It runs git merge in the proposal's worktree and escalates to an LLM agent if conflicts are detected.

## Database

**Table: `roadmap.worktree_merge_log`** (migration 017)

| Column          | Type           | Description                                    |
|-----------------|----------------|------------------------------------------------|
| id              | BIGINT         | Auto-increment PK                              |
| proposal_id     | BIGINT FK      | References `roadmap.proposal(id)`              |
| commit_sha      | TEXT           | Merge commit SHA (null for conflicts/failures) |
| status          | TEXT           | `merged`, `conflict`, `failed`, `pending`      |
| conflict_files  | JSONB          | Array of conflicting file paths                |
| error_message   | TEXT           | Error details for failed merges                |
| created_at      | TIMESTAMPTZ    | Timestamp of merge attempt                     |

Index: `idx_worktree_merge_log_proposal` on `(proposal_id, created_at DESC)`

## API Usage

### Merge a worktree
```
mcp_proposal(merge_worktree, {
  proposal_id: "P148",
  worktree_path: "/data/code/worktree/feature-p148",
  target_branch: "main",       // optional, defaults to "main"
  dry_run: false               // optional, set true to check conflicts only
})
```

### Sync all worktrees after merge
```
mcp_proposal(sync_worktrees, {
  target_branch: "main",                    // optional
  worktree_paths: ["/data/code/worktree/.."], // optional, omit to auto-detect all
  notify_agents: true                        // optional
})
```

### Check merge history
```
mcp_proposal(merge_status, {
  proposal_id: "P148"
})
```

## Implementation

| File                                                    | Lines | Purpose                                  |
|---------------------------------------------------------|-------|------------------------------------------|
| `src/apps/mcp-server/tools/worktree-merge/handlers.ts`  | 599   | Core merge/sync/status logic             |
| `src/apps/mcp-server/tools/worktree-merge/index.ts`     | 69    | MCP tool registration                    |
| `src/apps/mcp-server/tools/worktree-merge/schemas.ts`   | -     | Input validation schemas                 |
| `src/core/tool-agents/merge-executor.ts`                | 148   | Auto-trigger tool agent for MERGE stage  |
| `scripts/migrations/017-worktree-merge-log.sql`         | 22    | DB migration                             |
| `src/test/worktree-merge.test.ts`                       | 212   | Unit tests (git ops, conflicts, lifecycle)|

## Acceptance Criteria

| #   | Criterion                                                                 | Status  |
|-----|---------------------------------------------------------------------------|---------|
| AC1 | CLI/MCP command merges worktree branch to main, handles conflicts gracefully | implemented |
| AC2 | Post-merge sync notifies or auto-rebases other active agents               | implemented |
| AC3 | Integration with proposal workflow: merge triggered at Merge state entry   | implemented |
| AC4 | Merge operation logs clear audit trail in proposal record                  | implemented |
| AC5 | Merge conflicts reported back with actionable guidance, not silent failure | implemented |

## Error Handling

- **Merge conflicts**: Returns structured error with conflicting file paths. Does NOT auto-resolve. Proposal held at MERGE state. Conflict recorded in `worktree_merge_log` with status='conflict'.
- **Diverged main**: If main has moved since worktree creation, merge will likely conflict. Use `worktree_sync` first to rebase.
- **Missing worktree**: If worktree path doesn't exist, returns error indicating worktree may have been cleaned up.
- **Push failure**: Merge commits locally but push fails — returns warning with local commit SHA so manual push is possible.
- **Concurrent merges**: The `worktree_merge_log` table serializes via proposal_id FK. The tool agent queue provides additional serialization.
