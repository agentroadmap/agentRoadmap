# Reached Status Workflow & Gates

## Overview

States must pass through a validation workflow before being marked as Reached. This prevents agents from self-certifying completion without evidence.

## Workflow

```
Potential → Active → Review → Reached
             ↓        ↓
          (coding)  (validation)
                    ↓
              pass → Reached ✅
              fail → Active (return to claimant)
              3+ fails → Escalate 🚨
```

## Gates Blocking Reached

### 1. Audited Maturity Gate

The state must have `maturity: audited` before it can transition to Reached.

**Requirements:**
- State must have a `builder` field set (who implemented it)
- State must have an `auditor` field set (peer reviewer, different from builder)
- System enforces: auditor cannot be the same as builder

**Commands:**
```bash
# Set builder and auditor
roadmap state edit 32 --builder "MiMo-V2-Omni"
roadmap state edit 32 --auditor "GitHub-Copilot"

# Set maturity to audited
roadmap state edit 32 --maturity audited
```

### 2. Proof of Arrival Gate

The state must have at least one proof reference before transitioning to Reached.

**Proof Types:**
- `command-output` — output from a command (e.g., "npm test passed")
- `test-result` — test execution results
- `artifact` — generated file or build output
- `commit` — git commit hash
- `validation-summary` — peer validation summary

**Commands:**
```bash
# Add proof reference
roadmap state edit 32 --proof "test-result: All 25 tests passed"

# View proof in state
roadmap state 32 --plain
```

## Review Workflow

### Requesting Review

When an agent completes coding, they move the state to Review:

```bash
roadmap state edit 32 -s "Review"
```

### Performing Review

A reviewer (ideally different from the builder) validates:
1. All acceptance criteria are met
2. Tests pass
3. Code quality is acceptable
4. Proof of arrival is provided

### Review Outcomes

**Pass:**
```bash
roadmap state edit 32 --maturity audited
roadmap state edit 32 --proof "validation-summary: All ACs verified by @Reviewer"
roadmap state edit 32 -s "Reached"
```

**Fail (return to claimant):**
```bash
roadmap state edit 32 -s "Active"
roadmap state edit 32 --append-notes "Review failed: Missing tests for AC #3"
```

## Loop Detection

If a state fails review 3 or more times, it is automatically escalated:

- Status changes to "Blocked"
- Coordinator intervention required
- Review history tracks all attempts

**Review History Format (in state markdown):**
```markdown
## Review History

- [pass] 2026-03-20T12:00:00Z by @Opus (claimant: @Gemini)
- [fail] 2026-03-20T13:00:00Z by @Copilot (claimant: @Gemini) — Missing tests
- [fail] 2026-03-20T14:00:00Z by @Opus (claimant: @Gemini) — Still broken
```

## Quick Reference

| Step | Command | Who |
|------|---------|-----|
| Complete coding | `state edit X -s "Review"` | Builder |
| Assign auditor | `state edit X --auditor "Name"` | Builder or Coordinator |
| Add proof | `state edit X --proof "type: value"` | Builder |
| Set audited | `state edit X --maturity audited` | Reviewer |
| Mark reached | `state edit X -s "Reached"` | Reviewer |
| Reject | `state edit X -s "Active"` | Reviewer |

## Configuration

The "Review" status is defined in `roadmap/config.yml`:

```yaml
statuses: ["Potential", "Active", "Review", "Reached", "Abandoned"]
```

The DAG visualization uses amber/yellow for Review status nodes.
