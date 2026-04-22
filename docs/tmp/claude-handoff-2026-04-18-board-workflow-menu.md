# Handoff to Claude Code — 2026-04-18

## What changed

- `W` on the roadmap board now opens a workflow selector menu instead of cycling views.
- The board keeps a separate `Obsolete` lane so archived proposals do not crowd the live lanes.
- The master-detail proposal view now refreshes from Postgres before binding the selected proposal.

## What to know

- The flat `All` board view is not a good long-term answer for every workflow. It stays out of the direct cycle path, and the proper vertically stacked layout has been filed as [P277].
- [P277] is the proposal for a vertically stacked all-workflows board view.
- [P276] remains the proposal for canonical proposal detail timelines and export.

## Verification

- `node --import jiti/register --test tests/unit/board-workflow.test.ts tests/unit/proposal-viewer-format.test.ts`
- `npm run build`
- `git diff --check`
