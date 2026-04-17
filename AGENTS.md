## AgentHive Working Notes

### Purpose
This repository is an agent-native product development platform. Work is proposal-driven, and changes should stay aligned with the current proposal type, workflow, and acceptance criteria.

### Precedence
- Proposal type decides the workflow.
- Workflow decides the allowed states.
- Maturity applies inside every state.

### Proposal Types

| Type | Category | Workflow | Description |
| :--- | :--- | :--- | :--- |
| **product** | Type A (Design) | Standard RFC | Top-level product vision, pillars, constraints |
| **component** | Type A (Design) | Standard RFC | Major subsystem or architectural pillar |
| **feature** | Type B (Impl) | Standard RFC | Concrete capability to build |
| **issue** | Type B (Impl) | Standard RFC | Problem in the product requiring code changes |
| **hotfix** | Type C (Ops) | Hotfix | Localized operational fix to running instance |

### Standard RFC Workflow (product, component, feature, issue)

| State | Phase | Description |
| :--- | :--- | :--- |
| **Draft** | Architecture | Initial idea. If too broad or incoherent, **split it** into smaller proposals. |
| **Review** | Gating | Gating review for feasibility, coherence, and architectural fit. |
| **Develop** | Building | Building, coding and testing. |
| **Merge** | Integration | Merging branch to `main`. Focus on compatibility and stability. |
| **Complete** | Stable | Temporary stable state until the next evolution cycle begins. |

| Maturity | Description |
| :--- | :--- |
| **New** | Just entered the state. Waiting for an agent to claim or lease it, or for dependencies to clear. |
| **Active** | Under lease and being worked on with fast iteration. |
| **Mature** | Work in this state is complete enough to request a gate decision to advance. |
| **Obsolete** | No longer relevant because the structure or direction has changed. |

### Instruction Files
- `AGENTS.md` is the repo-wide instruction file for Codex and similar tools.
- `CLAUDE.md` is the repo-wide instruction file for Claude Code.
- `.github/copilot-instructions.md` is the repo-wide instruction file for GitHub Copilot.

### Working Rules
- Check the current proposal, state, and dependencies before changing shared behavior.
- Use the MCP and proposal workflow when the task affects shared project state, release flow, or agent coordination.
- Create and update tracked proposals through MCP/Postgres first; treat markdown files as synced projections, not the lifecycle source of truth.
- Claim or lease work when the workflow requires ownership before implementation.
- If the type, state, or owner is unclear, inspect the proposal and ask before changing shared state.
- If a task is blocked by workflow, dependency, or missing context, stop and report that instead of guessing.
- If a blocker is architectural or persistent, log it through the normal issue/proposal path instead of working around it silently.
- Keep changes surgical. Avoid unrelated refactors, formatting churn, or broad cleanup.
- If you make a change that creates unused imports, functions, or variables, clean up only what your change made unused.
- Prefer tests that reproduce the bug or validate the behavior you changed.

### Coding Principles
- Think before coding: state assumptions, surface tradeoffs, and ask when uncertain.
- Simplicity first: make the smallest change that solves the request.
- Surgical changes: touch only what you must, and do not refactor unrelated code.
- Goal-driven execution: define a clear success criterion and verify it before handing work back.

### Coding Preferences
- Make the smallest change that solves the request.
- Prefer existing repo patterns over new abstractions.
- State assumptions when the task is ambiguous.
- Push back on overcomplicated solutions when a simpler one is sufficient.
- Verify the result before handing the work back.

### Commit Discipline
- Commit when the task is complete or when the user asks for a commit.
- Keep commits scoped to the request.
- Avoid mega-commits that mix unrelated work.
- Keep modifications in the current worktree and branch; let the Git specialist handle merges to `main` when that is part of the workflow.

### Repo Context
- Current worktree root: CWD
- Main project root: repository root
- MCP server: `http://127.0.0.1:6421/sse`

### Notes
- Proposal terminology in this repo matters. Use the current workflow/state names from the codebase, not legacy labels.
- If a section becomes stale, prefer moving the detail into docs and keeping this file short.
- Don't litter workspace with random files, especially project root folder
