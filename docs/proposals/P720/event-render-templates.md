# Event Render Templates — Quick Reference for Dev

**Purpose:** Exact template strings for each event_type. Use this as pseudocode for the `StateEventRenderer` class.

---

## 1. lease_claimed

**Suppression:** Default hidden unless opted in or high-signal stage.

**Fields needed:**
- `agent_name` (from triggered_by)
- `display_id` (from proposal)
- `stage_label` (from StateNamesRegistry)
- `claimed_for` (from payload)

**Template:**
```
agent {agent_name} claimed P{display_id}|{stage_label} to {claimed_for}
```

**Examples:**
```
agent alice claimed P502|REVIEW to review and enhance
agent bob claimed P703|DEVELOP to implement
```

**Special cases:**
- If `claimed_for` is missing, infer from the proposal status (e.g., if status=REVIEW, claimed_for="review").
- If multiple claims on the same proposal within 30s: show only the last one, suppress the others.

---

## 2. lease_released

**Suppression:** Post only if `release_reason` in [gate_review_complete, gate_hold, gate_reject, gate_waive]. Suppress all others.

**Fields needed:**
- `agent_name` (from triggered_by)
- `display_id` (from proposal)
- `stage_label` (from StateNamesRegistry)
- `release_reason` (from payload)
- `rationale` (from payload, optional, for reason details)

**Template:**
```
agent {agent_name} released P{display_id}|{stage_label} — {reason_label}
```

**reason_label mapping:**
| release_reason | reason_label |
|---|---|
| gate_review_complete | gate review complete ✓ |
| gate_hold | gate hold — awaiting {first 40 chars of rationale} |
| gate_reject | gate reject: {first 60 chars of rationale} |
| gate_waive | gate waive |

**Examples:**
```
agent alice released P502|REVIEW — gate review complete ✓
agent bob released P703|DEVELOP — gate hold — awaiting design spike
agent charlie released P601|REVIEW — gate reject: out of scope for Q2
```

**Add proposal title as second line:**
```
agent alice released P502|REVIEW — gate review complete ✓
Implement auto-scaling for proposal queue
```

---

## 3. maturity_changed

**Suppression:** Reject no-ops (old_maturity == new_maturity). Always post if transitioning to a new maturity.

**Fields needed:**
- `display_id` (from proposal)
- `stage_label` (from StateNamesRegistry)
- `old_maturity` (from payload or DB history)
- `new_maturity` (from payload or current DB value)
- `title` (from proposal)

**Template:**
```
maturity shift on P{display_id}|{stage_label}: {old_maturity} → {new_maturity}
{title}
{implication_for_new_maturity}
```

**implication_for_new_maturity:**
| new_maturity | implication |
|---|---|
| active | Under active lease — agent is iterating |
| mature | Ready for gate decision — work is complete enough to advance |
| obsolete | Marked obsolete — work cancelled or superseded |
| new | Back to new — lease released, awaiting new claim |

**Examples:**
```
maturity shift on P502|REVIEW: new → active
Implement auto-scaling for proposal queue
Under active lease — agent is iterating

maturity shift on P703|DEVELOP: active → mature
Event feed redesign
Ready for gate decision — work is complete enough to advance
```

---

## 4. status_changed

**Suppression:** Reject no-ops (old_status == new_status). Always post.

**Fields needed:**
- `display_id` (from proposal)
- `stage_label` (from StateNamesRegistry; use new_status to look up)
- `old_status` (from payload or DB history, e.g., "DRAFT")
- `new_status` (from payload or current DB value, e.g., "REVIEW")
- `title` (from proposal)
- `implication` (from existing STATE_IMPLICATIONS map)

**Template:**
```
status advance on P{display_id}|{new_status_label}: {old_status_label} → {new_status_label}
{title}
{implication}
```

**old_status_label & new_status_label:**
Translate from stage names (DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE) to human-friendly labels:
| status | label |
|---|---|
| DRAFT | drafting |
| REVIEW | reviewing |
| DEVELOP | developing |
| MERGE | merge-ready |
| COMPLETE | shipped |

*For Hotfix:*
| status | label |
|---|---|
| TRIAGE | triaging |
| FIX | fixing |
| DEPLOYED | deployed |

**implication:** Use existing STATE_IMPLICATIONS map from state-feed-listener.ts.

**Examples:**
```
status advance on P502|REVIEW: drafting → reviewing
Implement auto-scaling for proposal queue
Ready for gate review — architecture validation, feasibility check

status advance on P703|DEVELOP: reviewing → developing
Event feed redesign
Approved — coding can begin, agents can claim implementation work
```

---

## 5. decision_made

**Suppression:** Always post. Highest priority.

**Fields needed:**
- `agent_name` (from triggered_by)
- `decision` (from payload, enum: ADVANCE, HOLD, REJECT, WAIVE)
- `display_id` (from proposal)
- `stage_label` (from StateNamesRegistry)
- `title` (from proposal)
- `rationale` (from gate_decision_log, optional but highly preferred)

**Template:**
```
agent {agent_name} decided {decision} on P{display_id}|{stage_label}
{title}
{rationale_summary}
```

**rationale_summary:** First 80 chars of rationale, or empty if no rationale.

**decision emoji/prefix:**
| decision | emoji |
|---|---|
| ADVANCE | ✅ |
| HOLD | ⏸️ |
| REJECT | ❌ |
| WAIVE | 🔄 |

**Examples:**
```
agent alice decided ADVANCE on P502|REVIEW
Implement auto-scaling for proposal queue
✅ All AC met, design approved. Ready for development.

agent bob decided HOLD on P703|DEVELOP
Event feed redesign
⏸️ Requires design spike on multi-tenant support first.

agent charlie decided REJECT on P601|REVIEW
Deprecated API cleanup
❌ Out of scope for Q2. Revisit in Q3.
```

---

## 6. proposal_created

**Suppression:** Post only if the proposal has tags including "urgent" or "blocker", OR no tags and P## is in DRAFT with implied routine status. Otherwise suppress.

**Fields needed:**
- `display_id` (from proposal)
- `title` (from proposal)
- `creator_name` (from audit.created_by, optional)
- `tags` (from proposal.tags, optional)

**Template:**
```
new proposal filed: P{display_id} — {title}
```

**With creator (optional):**
```
new proposal filed by {creator_name}: P{display_id} — {title}
```

**Examples:**
```
new proposal filed: P710 — Rebuild state-feed for real-time ops visibility

new proposal filed by alice: P711 — Multi-tenant schema migration (blocker)
```

---

## 7. review_submitted

**Suppression:** Post only if this is a gate-decision review (from roadmap.gate_decision_log), not inline discussion comments.

**Fields needed:**
- `display_id` (from proposal)
- `stage_label` (from StateNamesRegistry)
- `reviewer_name` (from triggered_by)
- `review_content` (from payload, first 100 chars)
- `is_blocker` (derived: if decision is REJECT or HOLD, set to true)

**Template:**
```
review posted on P{display_id}|{stage_label} by {reviewer_name}
{review_excerpt}
```

**If blocker:**
```
⚠️ review posted on P{display_id}|{stage_label} by {reviewer_name}
{review_excerpt}
```

**Examples:**
```
review posted on P502|REVIEW by alice
"Needs clarification on the dependency model. See AC #3."

⚠️ review posted on P601|REVIEW by bob
"Out of scope for Q2. Revisit in Q3 if capacity."
```

---

## Implementation Notes

### Pseudocode Structure

```typescript
class StateEventRenderer {
  constructor(
    private stateNamesRegistry: StateNamesRegistry,
    private proposal: Proposal,
    private event: ProposalEvent
  ) {}

  render(): string {
    switch (this.event.event_type) {
      case 'lease_claimed':
        if (!this.shouldPostLeaseClaimed()) return '';
        return this.renderLeaseClaimed();
      case 'lease_released':
        if (!this.shouldPostLeaseReleased()) return '';
        return this.renderLeaseReleased();
      case 'maturity_changed':
        if (this.isNoOpMaturity()) return '';
        return this.renderMaturityChanged();
      // ... etc
    }
  }

  private getStageLabel(): string {
    try {
      const view = this.stateNamesRegistry.getView(this.proposal.type);
      const stage = view.stages.find(s => s.name === this.proposal.status);
      return stage?.name || `status=${this.proposal.status}`;
    } catch {
      return `status=${this.proposal.status}`;
    }
  }

  private shouldPostLeaseClaimed(): boolean {
    // Check env var, gateable stage, elevated agent role
  }

  private shouldPostLeaseReleased(): boolean {
    // Only if release_reason in [gate_review_complete, gate_hold, gate_reject, gate_waive]
  }

  private isNoOpMaturity(): boolean {
    return this.event.payload.old_maturity === this.event.payload.new_maturity;
  }

  // ... render* methods implement the templates above
}
```

### Testing

For each event_type, write tests that:
1. Render the template correctly (agent name, stage label, proposal reference all present).
2. Suppress events that should be suppressed (no-op maturity, routine releases).
3. Include the implication or rationale summary when required.
4. Translate stage labels correctly (RFC vs Hotfix).
5. Handle missing fields gracefully (fallback values, not crashes).

---

## Discord Specific

- **Max length:** 2000 chars. Truncate with "... [full text in dashboard]" if longer.
- **Markdown:** bold (`**text**`), code (`` `text` ``), spoiler (`||text||`).
- **No JSX or fancy embeds.** Plain text + markdown only (or simple embeds with a color bar if you want).
- **Emoji prefix:** Use sparingly for priority (✅ for ADVANCE, ⚠️ for blockers).

---

## Web Dashboard Specific

- Clickable P### opens the proposal modal.
- Clickable agent name opens the agent's health panel.
- Event timestamp is sortable; filter dropdown works for event_type.
- Collapse control for sequences of events on the same proposal within 5 min.

