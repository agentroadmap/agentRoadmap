# Research-and-Build Engine

## The Problem

The current roadmap tool is too rigid, too much ceremony, designed top-down. It was built as a project management system when it should be a research-and-build engine.

**What happens today:**
- Human writes states upfront with acceptance criteria, plans, dependencies
- Agent picks up state, follows the plan, checks boxes, requests peer review
- Heavy gates block transitions (proof of arrival, peer audit, verification statements)
- Worktree conflicts silently archive states
- Agent communication goes into a void with no response

**What should happen:**
- Human injects a simple vision or seed idea
- Agent researches, discovers what's needed, creates states bottom-up
- Agent picks up work, builds, learns, discovers new sub-problems
- Plan evolves as agent learns — not fixed at creation time
- Agent marks things done when they're done, no gatekeeping bottleneck

## The Reframe

Stop calling it project management. It's a **research-and-build engine**:
- Human gives a seed → agent grows the tree
- The roadmap is the agent's notebook, not the human's Gantt chart
- Structure should emerge from work, not precede it

## Core Principles

1. **Bottom-up discovery**: States emerge from agent research, not human planning
2. **Trust with visibility**: Agents can claim and complete freely; what matters is that actions are recorded and visible
3. **AC is the only contract**: If acceptance criteria are met, the state is done. No separate proof/audit/verification layer.
4. **Lightweight and resilient**: No maturity levels, no peer audit gates, no proof-of-arrival ceremony
5. **Record don't block**: Log who did what when, but don't prevent actions. Bad completions are visible and reversible.

## What Changes

### Remove (too much ceremony)
- Guarded reached transitions (STATE-030 gates)
- Proof of arrival requirements
- Peer audit as a gate (keep as optional, not mandatory)
- Verification statements as a required checklist
- Maturity levels (skeleton → contracted → audited)
- Definition of Reached duplication (STATE-035)

### Simplify (keep the signal)
- **Status**: Potential → Active → Reached (that's it)
- **AC**: The single checklist that defines "done"
- **Assignment**: Who's working on it (collision prevention)
- **Description**: What needs to happen and why
- **Final Summary**: What was done (post-completion)

### Add (fill the actual gaps)
- **Activity provenance** (STATE-034): Who did what when, auto-logged
- **Token-efficient output** (STATE-036): Agents need lean context
- **Resilient communication**: Messages that queue and retry, not vanish
- **Worktree-safe state management**: Conflicts shouldn't archive work silently

## The Self-Regulation Model

Instead of gates blocking bad transitions:

```
Agent claims state → works → checks AC → marks reached
                                      ↓
                          Activity log records everything
                                      ↓
                          Human or other agent reviews post-hoc
                                      ↓
                          Bad completion → reopen or create follow-up state
```

This is how git works. You commit freely. Code review happens after. Bad commits get reverted. The system doesn't block you at commit time — it makes your actions visible.

## Self-Claim and Self-Reach Control

### The Concern
If agents can freely claim and mark reached, what stops them from rubber-stamping?

### The Answer: Record, Don't Block

The current system (STATE-030) blocks Reached with hard gates: proof of arrival, peer audit, verification statements. This creates bottlenecks and ceremony.

**New approach: trust the agent, record everything, review post-hoc.**

#### What an agent can do freely:
- Claim any unclaimed state
- Mark it Active
- Check acceptance criteria
- Mark it Reached
- Write final summary

#### What the system records automatically (STATE-034):
- `[2026-03-21 08:31] @agent-k claimed state`
- `[2026-03-21 09:15] @agent-k checked AC #1, #2, #3`
- `[2026-03-21 09:45] @agent-k marked Reached`

#### What prevents abuse:
1. **Visibility**: Activity log shows exactly who did what and when. Rubber-stamping is obvious when a state goes from claimed to reached in 2 minutes with no notes.
2. **Reversibility**: Human or another agent can reopen a state, uncheck AC, or create a follow-up "this wasn't actually done" state.
3. **Git is the ground truth**: The real verification is whether the code works. The roadmap is a coordination layer, not a quality gate.
4. **Lightweight peer signal** (optional): An agent can add a one-line "verified by @X" to the activity log. No formal audit flow, no gate — just a signal.

#### The one hard gate (maybe):
- **Tests pass**: The only gate worth having. If the project has tests, reaching a state could optionally require `npm test` to exit 0. This is a machine check, not a human gate.

### Summary

| Old model (STATE-030) | New model |
|---------------------|-----------|
| Proof of arrival required | Activity log auto-recorded |
| Peer audit blocks Reached | Optional "verified by" signal |
| Verification statements mandatory | AC is the only checklist |
| Maturity levels gate transitions | No maturity concept |
| Hard block on missing proof | Soft visibility + reversibility |

## Worktree & Symlink: Current State and Direction

### What's Built
- STATE-001: Shared roadmap via symlink across worktrees
- STATE-026: Schema compatibility for mixed-version worktrees
- File locking (FileLock class) for atomic operations
- resolveStateConflict() for multi-branch merging

### The Problem with Symlinks
Symlinks are inherently fragile:
- Break silently when worktree is moved or deleted
- Not portable across filesystems (NFS, Docker, remote)
- No cleanup mechanism for broken links
- Agent loses access to roadmap silently, works in isolation
- Creates a hidden single point of failure

### Direction: Move Away from Symlinks
Symlinks were a quick solution for sharing state across worktrees. The long-term approach should be a **service-based model**: agents talk to a single roadmap daemon/service (STATE-019) rather than sharing filesystem paths. The roadmap becomes an API, not a shared directory.

Until then, symlink is the mechanism. Don't invest in hardening it — invest in replacing it.

### Inter-Agent Communication: Current Gaps
- **No push messaging** (STATE-031 planned, not started): agents poll blindly
- **No message acknowledgment**: sender doesn't know if message was received
- **No retry/queue**: messages vanish if nobody reads them
- **Communication goes into void**: no "was this seen?" signal

These gaps block reliable multi-agent coordination. The minimum viable fix: message ack + visibility on delivery status. Full push notification (STATE-031) is the complete solution.

## Open Questions

1. Should "tests pass" be the one hard gate, or fully trust agents?
2. How do agents discover and prioritize work without milestones?
3. How should the activity log be surfaced — inline in state view, or separate query?
4. What's the minimal viable communication protocol between agents?
5. Service-based roadmap (daemon/API) vs symlink — when to make the switch?
