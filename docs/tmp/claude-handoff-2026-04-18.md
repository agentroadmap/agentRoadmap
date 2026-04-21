# Handoff to Claude Code — 2026-04-18

**Workspace:** `/data/code/worktree/codex`
**Branch:** `codex-main`
**Purpose:** carry forward the proposal detail-thread UI work from this session.

## What changed

- The proposal detail pane now shows the current `status` and `maturity` together at the top of the detail body.
- That current-state line is visually emphasized with blinking tags so it is easy to spot while scanning a proposal.
- Proposal details now include an `Activity Thread` section beneath the proposal body.
- The thread is hydrated from Postgres by combining:
  - `roadmap_proposal.proposal_state_transitions`
  - `roadmap_proposal.proposal_maturity_transitions`
  - `roadmap_proposal.proposal_event`
- The global board feed was left chronological and separate. This change is specifically the per-proposal detail view.

## Files touched in this session

- `src/core/roadmap.ts`
- `src/apps/ui/proposal-viewer-with-search.ts`
- `tests/unit/proposal-viewer-format.test.ts`

## Verification

- `node --import jiti/register --test tests/unit/proposal-viewer-format.test.ts`
- `npm run build`
- `git diff --check`

## Operational note

- I stopped the active `andy` orchestrator/gate workers for this session before committing.
- One stale `gary` gate-pipeline process is still present on the host, but it is outside my permissions to terminate from this user.

## Good next step

If the board should also show a second feed mode later, keep it separate from the per-proposal thread. The thread is already in the detail pane, so a second feed view should be additive, not a replacement.
