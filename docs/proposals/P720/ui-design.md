# P708 — Activity Feed UI Design System

**Design Scope:** Visual + interaction layer for agent/proposal event stream across Discord (text) + Roadmap dashboard (web).

**Design Constraints:**
- Discord: immutable posts, 10-embed limit per webhook call, markdown rendering
- Dashboard: mobile-responsive, real-time updates, accessibility-first
- Event velocity: 50+ events / 10 min (high-volume morning)
- Proposal workflows: RFC (5 stages) + Hotfix (3 stages), 4-tier maturity ladder

---

## 1. Problem Statement & Design Rationale

**Current state:** Discord posts lack from-state, agent attribution, and consistent iconography. Dashboard has no activity panel. High-volume feeds become noise.

**Design goals:**
1. **Clarity.** Every event clearly states: *who → action → what → transition* (e.g. "agent skeptic-alpha claimed P705|REVIEW to review and enhance").
2. **Scannability.** Group related events; use color + icon semantic meaning; avoid visual repetition.
3. **Severity layering.** Gate decisions and completions stand out; info events recede.
4. **Mobile-first.** Dashboard panel collapses gracefully; Touch targets ≥44px; readable at 320px+.
5. **Immutability.** Discord posts are final; event streams are append-only, no edits.

---

## 2. Event Type Classification & Severity Tiers

### Event Taxonomy

```
Tier 1 (Critical): decision_made [advance/reject], status_changed [→COMPLETE]
Tier 2 (Notable):  maturity_changed [→mature], proposal_created, lease_released
Tier 3 (Info):     lease_claimed, maturity_changed [other], review_submitted
```

**Rationale:** Gate decisions (advance/hold/reject) and proposal completions affect all downstream stakeholders. Maturity transitions signal internal progress. Lease/review are operational noise at scale — they're useful per-proposal, but in aggregate feed they're routine.

---

## 3. Iconography + Color System

| Event | Icon | Color | Severity | Reasoning |
|-------|------|-------|----------|-----------|
| `proposal_created` | 📝 | `#5B8DEE` (Blue) | Info | New entity, calm/neutral |
| `lease_claimed` | 🔒 | `#9CA3AF` (Gray) | Info | Ownership signal, muted |
| `lease_released` (normal) | 🔓 | `#9CA3AF` (Gray) | Info | Unblocked, but routine |
| `lease_released` (timeout) | ⏱️ | `#F59E0B` (Amber) | Notable | Stale lease — operator attention |
| `lease_released` (reject) | ❌ | `#EF4444` (Red) | Critical | Lease holder rejected work |
| `maturity_changed` (→active) | ⚡ | `#8B5CF6` (Purple) | Info | Momentum, but expected progression |
| `maturity_changed` (→mature) | ✅ | `#10B981` (Green) | Notable | Ready for gate review |
| `maturity_changed` (→obsolete) | ⚠️ | `#F59E0B` (Amber) | Notable | Scope killed, affects timeline |
| `status_changed` (→DEVELOP/MERGE) | 🚀 | `#3B82F6` (Blue) | Notable | Stage progression |
| `status_changed` (→COMPLETE) | 🏁 | `#10B981` (Green) | Critical | Delivery milestone |
| `decision_made` (advance) | ✔️ | `#10B981` (Green) | Critical | Gate approval; unblocks work |
| `decision_made` (hold) | ⏸️ | `#F59E0B` (Amber) | Critical | Waiting signal; comms needed |
| `decision_made` (reject) | 🚫 | `#EF4444` (Red) | Critical | Scope killed; reassess proposal |
| `review_submitted` | 💬 | `#9CA3AF` (Gray) | Info | Feedback added, routine review cycle |

---

## 4. Discord Delivery Format

**Choice: Plain text with markdown semantic markup + emoji prefixes.**

**Rationale:** 
- Embeds (colored sidebars + fields) force 10-per-post limit → requires batching logic + complexity.
- Plain text scales infinitely within Discord message size (4000 chars).
- Emoji + bold/italic + code blocks provide sufficient visual distinction.
- Markdown links preserve click-through to dashboard.
- Trade-off: lose structured field layout, gain simplicity + volume.

### Discord Event Templates

Each event is a single line rendered as:
```
[ICON] [AGENT_SHORT] [ACTION] [PROPOSAL_REF] [FROM_STATE → TO_STATE] [CONTEXT]
```

#### Example Posts

**Single event (fast):**
```
📝 skeptic-alpha created P708 | **RFC Draft**
→ Operator visibility surface for activity feed (web dashboard)
```

**Lease lifecycle batch (efficiency at scale):**
```
🔒 codex-two claimed P674 | REVIEW (enhance)
🔒 worker-15097@codex-one claimed P675 | DEVELOP (review gating)
🔒 claude-joe claimed P689 | DEVELOP (code)

3 proposals under lease — agents iterating
```

**Gate decision (critical highlight):**
```
✔️ **skeptic-alpha ADVANCED** P705 | REVIEW → DEVELOP
→ Operator visibility + activity feed ready for development
   Gating notes: AC met, no blockers
```

**Lease timeout (operator alert):**
```
⏱️ ⚠️ P674 | REVIEW — lease held by codex-two for 6h30m
→ May need escalation or release. [View in Dashboard]
```

**Maturity transition → gate review:**
```
✅ codex-two marked P675 as **MATURE** | DEVELOP
→ Ready for gating review. [View in Dashboard]
```

**Rejection (critical):**
```
🚫 **skeptic-alpha REJECTED** P612 | DRAFT
→ Duplicate of P464 (resource allocation proposal). Marking obsolete.
   Gating notes: Scope overlap — author to merge into P464.
```

**Batch format rule:**
- 1–3 related events: inline list (as above)
- 4+ events in 5 min window: summary header + collapsed thread
  ```
  ⚡ Morning activity spike (8:42 AM)
  4 lease claims, 1 maturity change, 0 gate decisions
  🔒 codex-two [P674], worker-15097 [P675], claude-joe [P689], jane-smith [P710]
  ✅ codex-three [P673→MATURE]
  [View full feed in Dashboard]
  ```

---

## 5. Dashboard Activity Panel Design

### Layout & Positioning

**Panel location:** Right sidebar on Board + ProposalsPage (below the column headers, above the fold on desktop, modal overlay on mobile <768px).

**Desktop layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Proposals Board / List View                              │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  [DRAFT]      [REVIEW]      [DEVELOP]      [MERGE]      │ 
│  (6 props)    (4 props)     (8 props)      (2 props)    │
│                                                           │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │ P701 | RFC Draft    │  │  ACTIVITY FEED           │  │
│  │ Timeline review     │  ├──────────────────────────┤  │
│  └─────────────────────┘  │ 🔒 codex-two claimed    │  │
│                           │    P674|REVIEW (6m ago)  │  │
│  ┌─────────────────────┐  │                          │  │
│  │ P705 | RFC Review   │  │ ✔️ skeptic-alpha adv.   │  │
│  │ Activity panel      │  │    P705|REVIEW→DEVELOP  │  │
│  │ [LIVE]              │  │    (2m ago)              │  │
│  └─────────────────────┘  │                          │  │
│                           │ ✅ codex-two marked      │  │
│                           │    P675 MATURE|DEVELOP   │  │
│                           │    (1m ago)              │  │
│                           │                          │  │
│                           │ 📝 jane-smith created    │  │
│                           │    P710 | RFC Draft      │  │
│                           │    (30s ago)             │  │
│                           │                          │  │
│                           │ [Show 12 more] ∨         │  │
│                           └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Mobile layout (<768px):**
```
┌─────────────────────┐
│ Proposals List      │
│                     │
│ ┌─────────────────┐ │
│ │ P701|RFC Draft  │ │
│ │ Timeline review │ │
│ └─────────────────┘ │
│ [ACTIVITY FEED ▼]   │  ← Collapsed, tap to expand modal
│ ┌─────────────────┐ │
│ │ P705|RFC Review │ │
│ │ Activity panel  │ │
│ │ [LIVE]          │ │
│ └─────────────────┘ │
└─────────────────────┘

Modal (tap activity feed):
┌──────────────────────┐
│ ← Activity Feed      │
├──────────────────────┤
│ (full-height, 100vw) │
│ 🔒 codex-two claimed │
│    P674|REVIEW       │
│    6m ago            │
│                      │
│ ✔️ skeptic-alpha adv.│
│    P705|REVIEW→DEVELOP
│    2m ago            │
│                      │
│ [Load more] ∨        │
└──────────────────────┘
```

### Interaction Patterns

**Real-time updates:**
- New event slides in from top with 150ms ease-in animation
- Color highlight fade: 2s at full opacity, then 8s fade to neutral
- No jarring transitions; max 1 new event per 500ms (debounce rapid bursts)

**Filtering (optional, for v2):**
- Proposal ID search box (↓ shows only events for P###)
- Event type tabs (All / Gate Decisions / Completions / Lease / Review)
- Time range (Last hour / 24h / 7d)

**Empty state:**
```
┌──────────────────────┐
│  ACTIVITY FEED       │
├──────────────────────┤
│                      │
│      No events yet   │
│   🌱 Start by        │
│   creating or        │
│   claiming a         │
│   proposal           │
│                      │
│    [Browse Drafts]   │
│                      │
└──────────────────────┘
```

**Loading state (first load):**
```
┌──────────────────────┐
│  ACTIVITY FEED       │
├──────────────────────┤
│ ⏳ Loading recent    │
│    events…           │
│ ⏳ Loading recent    │
│    events…           │
│ ⏳ Loading recent    │
│    events…           │
└──────────────────────┘
```

---

## 6. Density Rules & Scannability Strategy

### Grouping & Collapse Rules

**Goal:** Keep feed ≤10 visible rows at any time; group related events without losing detail.

**Rule 1: Lease batch (same agent, same proposal, within 30s)**
```
Single: 🔒 codex-two claimed P674|REVIEW (6m ago)
Batch:  🔒 codex-two claimed P674|REVIEW, P675|DEVELOP, P710|DRAFT (6m ago)
```

**Rule 2: Maturity ladder (same proposal, 5 min window)**
```
Multiple: ⚡ P705|REVIEW moved to active (10m ago)
          ✅ P705|REVIEW → MATURE (5m ago)
          ✔️ skeptic-alpha ADVANCED P705 REVIEW→DEVELOP (3m ago)
          
Collapsed: 🚀 P705 REVIEW→DEVELOP via maturity review (3m ago)
```

**Rule 3: Burst dampening (4+ events in 2 min)**
```
Header: ⚡ Activity spike (8:42 AM) — 6 events
Items:  🔒 [P674, P675, P710] claimed
        ✅ [P673, P680] matured
        📝 P688 created

[Show individual timeline] ← Expandable detail view
```

**Rule 4: Age-based collapse**
- ≤15 min old: show with exact time ("6m ago")
- 15–60 min old: show time ("42m ago")
- ≥1 hour old: show timestamp ("8:42 AM")
- ≥24 hours old: move to paginated history; don't show in live panel

### Scan-ability Metrics

| Scenario | Feeds | Visual Scan Time | Key Signal |
|----------|-------|------------------|-----------|
| Routine morning (6 events) | Ungrouped | 3s | All info, no reds |
| Busy morning (20 events) | Grouped by agent | 4s | 2 gate decisions (green), 1 rejection (red) |
| Crisis mode (50 events) | Grouped by type + burst collapse | 2s | 3 rejects (red), 4 on-hold (amber), rest info |

---

## 7. Agent Identity Normalization

**Problem:** `claude/skeptic-alpha-p463` vs `worker-15097 (triage-agent)@codex-one` vs `codex-two` — inconsistent formats.

**Solution:** Normalize to:
```
[HOST]/[ROLE] or [HOST]/[AGENT_NAME]
```

**Examples:**
```
Input                              → Display
────────────────────────────────────────────
claude/skeptic-alpha-p463          → claude/skeptic-alpha
codex-two                          → codex/agent-two
worker-15097 (triage-agent)@codex-one → codex/triage-agent
jane-smith (reviewer)              → operator/jane-smith
bot/orchestrator                   → bot/orchestrator
```

**Rendering:**
- Full version in hover tooltip (pop-up shows `claude/skeptic-alpha-p463`)
- Shortened display by default (≤20 chars for mobile)
- Operator identities prefixed with 🧑 (person emoji)
- Agent identities prefixed with 🤖 (bot emoji)

---

## 8. Discord Embed Alternative (Rejected)

**Evaluated format:**
```json
{
  "embeds": [
    {
      "color": 16764928,
      "title": "skeptic-alpha ADVANCED P705",
      "description": "REVIEW → DEVELOP",
      "fields": [
        {"name": "Proposal", "value": "P705 | Operator visibility surface", "inline": true},
        {"name": "Stage", "value": "REVIEW → DEVELOP", "inline": true},
        {"name": "Time", "value": "2m ago", "inline": false}
      ]
    }
  ]
}
```

**Why rejected:**
- 10-embed limit forces batching logic (overhead)
- Structured fields add cognitive overhead (user must scan fields, not skim line)
- Markdown link preservation is awkward in embed descriptions
- Plain text is faster to parse in real-time high-volume scenarios
- Discord mobile renders embeds poorly on narrow screens

---

## 9. Implementation Roadmap

### Phase 1 (MVP)
- Discord: plain text templates + agent display normalization
- Dashboard: static activity list (API fetch, no WebSocket)
- Severity tiers: full color + icon system

### Phase 2
- Discord: batch collapse logic (Rule 1–3)
- Dashboard: real-time WebSocket updates + animations
- Filtering: proposal ID search only

### Phase 3
- Dashboard: advanced filtering (event type, time range)
- Age-based collapse (Rule 4) for large feeds
- Proposal detail page: "Activity" tab showing filtered event history

---

## 10. Open Questions for PM/Dev

1. **Discord batch timing:** Should we buffer events for 5s before posting to allow batching (trade-off: latency vs. cleaner feed)? Or post immediately + edit to collapse?
   
2. **WebSocket vs polling:** Dashboard updates — SSE (push) or 500ms polling? Budget constraint?

3. **Proposal cross-linking:** In Discord, should we make proposal IDs into markdown links? E.g. `[P705](https://dashboard/proposals/P705)` — or is the dashboard primary + Discord is secondary read-only mirror?

4. **Operator notifications:** Should lease timeouts + rejections trigger separate Slack/PagerDuty alerts, or is the Discord feed sufficient?

5. **History retention:** How many events in dashboard live panel (last 30? 100?)? Database: archive after 7 days?

6. **Severity per-org:** Are colors/severity tiers organization-wide, or do different teams want different emphasis? (E.g., platform team cares about rejections; product team cares about maturity transitions.)

7. **Agent attribution:** Should decisions (gate_decision_made) also attribute which gating agent made the call? Currently proposal_event only logs action + event, not agent ID. Confirm the feed will include agent context.

---

## Design System CSS Tokens (Foundation)

```css
:root {
  /* Activity Feed Colors (Semantic) */
  --feed-critical-bg: #FEF2F2;        /* #EF4444 light */
  --feed-critical-fg: #991B1B;
  --feed-critical-border: #EF4444;
  
  --feed-notable-bg: #FFFBEB;         /* #F59E0B light */
  --feed-notable-fg: #92400E;
  --feed-notable-border: #F59E0B;
  
  --feed-info-bg: #F5F3FF;            /* #8B5CF6 light */
  --feed-info-fg: #3F0F64;
  --feed-info-border: #D8B4FE;
  
  /* Icon Font Sizes */
  --icon-event: 1.25rem;              /* 20px */
  --icon-severity: 0.875rem;          /* 14px */
  
  /* Spacing */
  --feed-row-height: 3.5rem;          /* 56px, touch-safe */
  --feed-gap: 0.5rem;                 /* 8px */
  --feed-padding: 1rem;               /* 16px */
  
  /* Animation */
  --feed-slide-in: slide-in 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --feed-highlight-fade: highlight 10s ease-out;
}

/* Event Row Base */
.activity-event {
  display: flex;
  align-items: center;
  gap: var(--feed-gap);
  padding: var(--feed-padding);
  border-left: 4px solid var(--feed-info-border);
  border-radius: 0.375rem;
  background-color: var(--feed-info-bg);
  font-size: 0.875rem;
  line-height: 1.5;
  animation: var(--feed-slide-in);
  min-height: var(--feed-row-height);
}

.activity-event--critical {
  --feed-info-border: var(--feed-critical-border);
  --feed-info-bg: var(--feed-critical-bg);
  color: var(--feed-critical-fg);
}

.activity-event--notable {
  --feed-info-border: var(--feed-notable-border);
  --feed-info-bg: var(--feed-notable-bg);
  color: var(--feed-notable-fg);
}

.activity-event__icon {
  font-size: var(--icon-event);
  flex-shrink: 0;
}

.activity-event__time {
  font-size: 0.75rem;
  opacity: 0.6;
  margin-left: auto;
  white-space: nowrap;
}

/* Accessibility */
.activity-event:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}
```

---

**Prepared by:** UI Designer  
**Date:** 2026-04-28  
**Status:** Design ready for PM review + dev specification
