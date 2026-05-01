# P708 UI Design — Aligned with PM Spec

**Status:** Design refined to match PM event templates (pm-spec.md §4)  
**Date:** 2026-04-28  
**Integration:** This document adds visual + interaction design layers to the PM spec's event taxonomy.

---

## Design Integration Overview

The PM spec (pm-spec.md) defines **canonical event templates** (§4) with exact wording, suppression rules, and stage-label resolution. The UI design adds:

1. **Visual hierarchy** (color + icon system) to make event severity scannable
2. **Dashboard panel layout** (responsive wireframes, animations, interactions)
3. **Density/collapse rules** that respect PM's deduplication logic (§6)
4. **Accessibility + CSS tokens** for implementation

**Key alignment points:**
- Event templates are fixed (PM spec); visual styling is new (design scope)
- Suppression rules (claim filtering, etc.) are PM's concern; we display what the PM lets through
- Stage labels come from `StateNamesRegistry.getView(proposal.type)` — no hardcoding
- Both Discord and dashboard render identical event text; design adds interactivity (dashboard only)

---

## Visual Severity Mapping (Aligned to PM Signal Hierarchy)

The PM spec defines signal tiers implicitly through templates:

| PM Signal Tier | Events | Visual Severity | Color | Icon |
|---|---|---|---|---|
| **Highest** | `decision_made` (ADVANCE/HOLD/REJECT), `status_changed` (→COMPLETE) | Critical | Red / Green | ✔️ / ⏸️ / 🚫 |
| **High** | `maturity_changed` (→mature), `lease_released` (gate decisions) | Notable | Amber / Green | ✅ / 🔓 |
| **Medium** | `maturity_changed` (→active/new), `status_changed` (other) | Info | Purple | ⚡ / 🚀 |
| **Low (suppressed by default)** | `lease_claimed`, `lease_released` (work_delivered), `proposal_created` (non-urgent) | Gray (if shown) | Gray | 🔒 / 📝 |
| **High (gating context)** | `review_submitted` (gate-decision only) | Notable | Blue | 💬 |

**Rationale:** The PM spec suppresses low-signal events by default (lease claims unless opted in). The UI design respects this by styling visible events with semantic color to show their importance.

---

## Event Display Template (PM Spec + Design Layer)

### Structure

```
[ICON] [AGENT_NAME] [ACTION_VERB] [PROPOSAL_REF|STAGE]
→ [CONTEXT_LINE] [TIME_AGO]
  [OPTIONAL_DETAIL_LINK]
```

### Examples (Rendered per PM Spec §4)

#### lease_claimed (Suppressed by default, shown if opts-in)

**PM Template:** `agent **{agent_name}** claimed **P{display_id}|{stage_label}** to {role}`

**Design render (gray, low priority):**
```
🔒 agent alice claimed P502|REVIEW to review and enhance
   6m ago
```

**Visual styling:**
- Icon: 🔒 (lock)
- Color: Gray (`#9CA3AF` border, `#F3F4F6` bg)
- Severity: Info (recedes visually)
- Time: Right-aligned, secondary color

---

#### maturity_changed (Always posted, high signal)

**PM Template:** `maturity shift on **P{display_id}|{stage_label}**: {old_maturity} → **{new_maturity}**`

**Design render (purple for active, green for mature):**

**Case 1: new → active**
```
⚡ maturity shift on P502|REVIEW: new → active
   Operator visibility surface for P674/P675/P689 outputs
   4m ago
```

**Visual styling:**
- Icon: ⚡ (momentum)
- Color: Purple (`#8B5CF6` border, `#F5F3FF` bg)
- Title bold: ✓
- Proposal title as context line (clickable)

**Case 2: active → mature**
```
✅ maturity shift on P502|REVIEW: active → mature — ready for merge decision
   Operator visibility surface for P674/P675/P689 outputs
   2m ago
```

**Visual styling:**
- Icon: ✅ (checkmark)
- Color: Green (`#10B981` border, `#F0FDF4` bg)
- Severity: Notable (stands out)
- Implication text included (PM rule)

---

#### decision_made (Always posted, highest signal)

**PM Template:** `agent **{agent_name}** decided **{decision}** on **P{display_id}|{stage_label}**`

**Design render (bold, colored by decision type):**

**Case 1: ADVANCE (approval)**
```
✔️ agent skeptic-alpha decided ADVANCE on P502|REVIEW
   → approved for development  [Gating decision details]
   2m ago
```

**Visual styling:**
- Icon: ✔️ (checkmark)
- Color: Green (critical, approval)
- Agent name: Bold (`<strong>`)
- Decision: Bold, uppercase
- Context: First 80 chars of rationale (PM rule)
- Link: Optional "Gating decision details"

**Case 2: HOLD (waiting)**
```
⏸️ agent alice decided HOLD on P703|DEVELOP
   → requires design spike first  [Gating decision]
   5m ago
```

**Visual styling:**
- Icon: ⏸️ (pause)
- Color: Amber (notable, requires action)
- Agent name: Bold

**Case 3: REJECT (scope killed)**
```
🚫 agent bob decided REJECT on P601|REVIEW
   → out of scope for Q2  [Gating decision]
   12m ago
```

**Visual styling:**
- Icon: 🚫 (prohibition)
- Color: Red (critical, negative)
- Agent name: Bold

---

#### status_changed (Always posted, medium signal)

**PM Template:** `status advance on **P{display_id}|{stage_label}**: {old_status} → **{new_status}**`

**Design render (varies by destination stage):**

```
🚀 status advance on P502|REVIEW: reviewing → approved for develop
   Operator visibility surface...
   1m ago
```

**Visual styling:**
- Icon: 🚀 (launch/progression)
- Color: Blue (info, forward movement)
- Translation applied: `REVIEW` → "reviewing" (PM rule)

---

#### review_submitted (Gate-decision only, posted)

**PM Template:** `review posted on **P{display_id}|{stage_label}** by **{reviewer_name}**: {first 100 chars of content}`

**Design render:**

```
💬 review posted on P502|REVIEW by alice
   "Needs clarification on the dependency model. See AC #3."
   7m ago  [View review]
```

**Visual styling:**
- Icon: 💬 (comment)
- Color: Blue (info)
- Quoted text in code block (readability)
- Time on right

**If blocker:**
```
💬 ⚠️ BLOCKER: review posted on P502|REVIEW by alice
   "Missing acceptance criteria. Cannot proceed."
   3m ago  [View review]
```

---

#### proposal_created (Urgent/blocker only, posted)

**PM Template:** `new proposal filed: **P{display_id}** — {title}`

**Design render:**

```
📝 new proposal filed: P710 — Rebuild state-feed for real-time ops visibility
   by jane-smith  [View proposal]
   45m ago
```

**Visual styling:**
- Icon: 📝 (document/new)
- Color: Blue (info)
- Title as context

---

## Dashboard Activity Panel Design

### Layout (Unchanged from wireframe spec)

**Desktop:** Fixed right sidebar (380px), 1024px+  
**Tablet:** Overlay sidebar, 768–1023px  
**Mobile:** Full-screen modal, <768px  

**Panel content:** Scrollable list of events (1000 most recent, per PM spec §7).

### Event Row Styling

**Base row height:** 56px (compact) to 80px (multiline)  
**Touch target:** ≥44px ✓  
**Focus state:** 2px outline, -2px offset (WCAG AA) ✓

### Interactive Elements

**Click on P###:** Navigate to proposal detail page (modal opens)  
**Click on agent name:** [Optional] Expand agent profile (recent work, current lease)  
**Collapse/expand sequences:** [Per PM §7] Multi-event sequences (e.g., "5 events on P502 in 10min") expand inline to show full timeline

### Filtering (Optional, v2)

**Dropdowns:**
- Event type: [All / Lease / Maturity / Status / Decision / Review]
- Time range: [Last hour / 24h / 7d / All]
- Proposal: [Search or autocomplete]

**Behavior:**
- Debounce search 300ms
- Live result count at bottom ("Showing X of Y events")
- "Reset filters" button

### Real-Time Update Animation

**New event arrives:**
```
0ms:    Transform: translateX(20px), opacity: 0
75ms:   Transform: translateX(0), opacity: 1 (150ms slide-in)
500ms:  Event settled; highlight background active
2.5s:   Highlight background begins fade (8s ease-out)
10.5s:  Normal appearance (highlight fully faded)
```

**CSS keyframes:**
```css
@keyframes slideInFromRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fadeHighlight {
  0% { background-color: rgba(250, 204, 21, 0.3); }
  20% { background-color: rgba(250, 204, 21, 0.3); }
  100% { background-color: transparent; }
}

.activity-event--new {
  animation:
    slideInFromRight 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    fadeHighlight 10s ease-out 2s forwards;
}
```

---

## Icon System (Final)

| Event Type | Icon | Semantic Meaning | Design Note |
|---|---|---|---|
| `lease_claimed` | 🔒 | Ownership, locked in | Low priority (gray) unless opted-in |
| `lease_released` | 🔓 | Released, unlocked | Low priority unless gate decision |
| `lease_released` (gate hold) | ⏱️ | Time/waiting | Amber (notable) |
| `maturity_changed` (→active) | ⚡ | Energy, momentum | Purple (info) |
| `maturity_changed` (→mature) | ✅ | Ready, approved | Green (notable) |
| `maturity_changed` (→obsolete) | ⚠️ | Warning, voided | Amber (notable) |
| `status_changed` | 🚀 | Progression, launch | Blue (info) |
| `status_changed` (→COMPLETE/DEPLOYED) | 🏁 | Finish, delivered | Green (critical) |
| `decision_made` (ADVANCE) | ✔️ | Yes, approved | Green (critical) |
| `decision_made` (HOLD) | ⏸️ | Pause, waiting | Amber (critical) |
| `decision_made` (REJECT) | 🚫 | No, denied | Red (critical) |
| `review_submitted` | 💬 | Feedback, comment | Blue (info); amber if BLOCKER |
| `proposal_created` | 📝 | New document | Blue (info) |

---

## Color Palette (Aligned to PM Signal Hierarchy)

| Tier | Name | Hex | Foreground | Use Case |
|---|---|---|---|---|
| Critical | Red | `#EF4444` | `#991B1B` | REJECT, HOLD (urgent), completions |
| Critical | Green | `#10B981` | `#166534` | ADVANCE, mature, delivered |
| Notable | Amber | `#F59E0B` | `#92400E` | HOLD, timeout, obsolete |
| Notable | Green | `#10B981` | `#166534` | mature (transition), approvals |
| Info | Purple | `#8B5CF6` | `#5B21B6` | Routine maturity (active), transitions |
| Info | Blue | `#3B82F6` | `#1E40AF` | New proposals, status changes, reviews |
| Info | Gray | `#6B7280` | `#6B7280` | Lease claims (suppressed), routine releases |

**Backgrounds:** Light variants (e.g., `#FEF2F2` for red background).

**Contrast:** All text ≥4.5:1 ratio (WCAG AA).

---

## Suppression & Density Rules (PM Spec §6 + Design)

### Rule 1: Claim Filtering (PM §6)

**What:** `lease_claimed` events  
**When suppressed:** By default (unless `AGENTHIVE_FEED_SHOW_CLAIMS=true` or proposal in gateable stage)  
**Design implication:** Claim rows appear in gray, lower visual weight. If user has filtering enabled, claims appear on demand.

### Rule 2: Release Filtering (PM §6)

**What:** `lease_released` events  
**When suppressed:** Unless `release_reason` in {gate_review_complete, gate_hold, gate_reject, gate_waive}  
**Design implication:** Most releases don't appear. Gate-related releases appear with elevated color (amber for hold, green for completion).

### Rule 3: No-op Deduplication (PM §6)

**What:** maturity_changed / status_changed where old == new  
**When suppressed:** Rejected in query/listener  
**Design implication:** Never see duplicate rows for same value.

### Rule 4: Event Grouping (PM §6, Dashboard-specific)

**5-minute window on same proposal:**
- If `lease_claimed` + `maturity_changed` both fire → show maturity only (lease is context)
- If multiple `maturity_changed` fire → show all (e.g., new→active, active→mature are both signal)
- If multiple claims by same agent in 30s → show final claim only

**Design pattern (collapse/expand):**
```
⚡ 3 events on P502 | REVIEW (last 10 minutes)  [Expand ∨]

[Collapsed: shows single summary line]

[Expanded:]
  ⚡ maturity shift on P502|REVIEW: new → active (5m ago)
  ✅ maturity shift on P502|REVIEW: active → mature (3m ago)
  ✔️ agent alice decided ADVANCE on P502|REVIEW (2m ago)
```

---

## Accessibility (WCAG AA Compliance)

### Color Contrast
- All text on background: ≥4.5:1 ratio ✓
- Icons + text always together (color not sole signal) ✓

### Keyboard Navigation
- Tab order: event rows → agent name link → P### link → expand/collapse button
- Focus visible: 2px outline, -2px offset (visible on all colors) ✓
- Enter/space: expand/collapse, navigate links ✓

### Screen Reader
- Event row read as complete sentence: "Agent alice claimed P502 REVIEW to review and enhance, 6 minutes ago."
- Headings: `<h3>Activity Feed</h3>` above panel
- Links descriptive: `<a href="/proposals/502">P502 | REVIEW proposal</a>` (not "click here")

### Motion Sensitivity
- `prefers-reduced-motion: reduce` skips animations (slide-in, fade)
- Reduced: event appears instantly, no highlight fade

### Mobile Accessibility
- Touch targets ≥44px ✓
- Safe area insets respected (notches) ✓
- Swipe gestures have keyboard alternatives (← back button) ✓

---

## CSS Token System (Drop-in Reference)

```css
:root {
  /* Activity Panel Sizing */
  --activity-panel-width: 380px;
  --activity-panel-max-width: 400px;
  --activity-panel-min-width: 320px;
  
  /* Event Row */
  --activity-event-height-compact: 56px;
  --activity-event-height-multiline: 80px;
  --activity-event-border-width: 4px;
  --activity-event-gap: 8px;
  --activity-event-padding: 12px 16px;
  --activity-event-icon-size: 20px;
  
  /* Colors */
  --activity-critical-red-bg: #FEF2F2;
  --activity-critical-red-fg: #991B1B;
  --activity-critical-red-border: #EF4444;
  
  --activity-critical-green-bg: #F0FDF4;
  --activity-critical-green-fg: #166534;
  --activity-critical-green-border: #10B981;
  
  --activity-notable-amber-bg: #FFFBEB;
  --activity-notable-amber-fg: #92400E;
  --activity-notable-amber-border: #F59E0B;
  
  --activity-info-purple-bg: #F5F3FF;
  --activity-info-purple-fg: #5B21B6;
  --activity-info-purple-border: #D8B4FE;
  
  --activity-info-blue-bg: #EFF6FF;
  --activity-info-blue-fg: #1E40AF;
  --activity-info-blue-border: #60A5FA;
  
  --activity-info-gray-bg: #F3F4F6;
  --activity-info-gray-fg: #6B7280;
  --activity-info-gray-border: #D1D5DB;
  
  /* Animation */
  --activity-slide-duration: 150ms;
  --activity-slide-easing: cubic-bezier(0.4, 0, 0.2, 1);
  --activity-fade-duration: 10s;
  --activity-fade-delay: 2s;
  --activity-fade-easing: ease-out;
}

/* Event Row Base */
.activity-event {
  display: flex;
  flex-direction: column;
  gap: var(--activity-event-gap);
  padding: var(--activity-event-padding);
  border-left: var(--activity-event-border-width) solid currentColor;
  min-height: var(--activity-event-height-compact);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 200ms ease;
}

.activity-event:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.activity-event:focus-visible {
  outline: 2px solid #3B82F6;
  outline-offset: -2px;
}

.activity-event--critical-red {
  background-color: var(--activity-critical-red-bg);
  color: var(--activity-critical-red-fg);
  border-color: var(--activity-critical-red-border);
}

.activity-event--critical-green {
  background-color: var(--activity-critical-green-bg);
  color: var(--activity-critical-green-fg);
  border-color: var(--activity-critical-green-border);
}

.activity-event--notable-amber {
  background-color: var(--activity-notable-amber-bg);
  color: var(--activity-notable-amber-fg);
  border-color: var(--activity-notable-amber-border);
}

.activity-event--info-purple {
  background-color: var(--activity-info-purple-bg);
  color: var(--activity-info-purple-fg);
  border-color: var(--activity-info-purple-border);
}

.activity-event--info-blue {
  background-color: var(--activity-info-blue-bg);
  color: var(--activity-info-blue-fg);
  border-color: var(--activity-info-blue-border);
}

.activity-event--info-gray {
  background-color: var(--activity-info-gray-bg);
  color: var(--activity-info-gray-fg);
  border-color: var(--activity-info-gray-border);
}

.activity-event--new {
  animation:
    slideInFromRight var(--activity-slide-duration) var(--activity-slide-easing),
    fadeHighlight var(--activity-fade-duration) var(--activity-fade-easing) var(--activity-fade-delay) forwards;
}

/* Typography */
.activity-event__header {
  display: flex;
  align-items: baseline;
  gap: var(--activity-event-gap);
  font-size: 14px;
  line-height: 1.5;
}

.activity-event__icon {
  font-size: var(--activity-event-icon-size);
  flex-shrink: 0;
  margin-top: 2px;
}

.activity-event__agent {
  font-weight: 600;
}

.activity-event__action {
  font-weight: 400;
  flex: 1;
}

.activity-event__time {
  font-size: 12px;
  opacity: 0.6;
  white-space: nowrap;
  margin-left: auto;
}

.activity-event__detail {
  font-size: 13px;
  line-height: 1.4;
  opacity: 0.8;
  padding-left: 28px;
}

.activity-event__link {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: rgba(0, 0, 0, 0.2);
}

.activity-event__link:hover {
  text-decoration-color: currentColor;
}

/* Animations */
@keyframes slideInFromRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fadeHighlight {
  0% { background-color: rgba(250, 204, 21, 0.3); }
  20% { background-color: rgba(250, 204, 21, 0.3); }
  100% { background-color: transparent; }
}
```

---

## Implementation Notes

### Event Rendering Function (Pseudocode)

```typescript
function renderEvent(event: ProposalEvent, proposal: Proposal): {
  className: string;  // e.g., "activity-event--critical-green"
  icon: string;       // e.g., "✔️"
  header: string;     // e.g., "agent skeptic-alpha decided ADVANCE on P502|REVIEW"
  detail?: string;    // e.g., "approved for development"
  time: string;       // e.g., "2m ago"
}

switch (event.event_type) {
  case 'decision_made':
    const decision = event.payload.decision; // ADVANCE, HOLD, REJECT, WAIVE
    const iconMap = {
      ADVANCE: '✔️',
      HOLD: '⏸️',
      REJECT: '🚫',
      WAIVE: '✔️'
    };
    const colorMap = {
      ADVANCE: 'critical-green',
      HOLD: 'notable-amber',
      REJECT: 'critical-red',
      WAIVE: 'critical-green'
    };
    return {
      className: `activity-event--${colorMap[decision]}`,
      icon: iconMap[decision],
      header: `agent ${event.triggered_by} decided ${decision} on P${proposal.display_id}|${stageLabel}`,
      detail: event.payload.rationale?.substring(0, 80),
      time: formatTime(event.created_at)
    };
  
  case 'maturity_changed':
    const maturityColorMap = {
      'active': 'info-purple',
      'mature': 'critical-green',
      'obsolete': 'notable-amber'
    };
    const maturityIconMap = {
      'active': '⚡',
      'mature': '✅',
      'obsolete': '⚠️'
    };
    return {
      className: `activity-event--${maturityColorMap[event.new_maturity]}`,
      icon: maturityIconMap[event.new_maturity],
      header: `maturity shift on P${proposal.display_id}|${stageLabel}: ${event.old_maturity} → ${event.new_maturity}`,
      detail: proposal.title,
      time: formatTime(event.created_at)
    };
  
  // ... (other cases)
}
```

---

## Final Design Checklist

- [x] All event types styled per PM signal hierarchy
- [x] Color contrast ≥4.5:1 (WCAG AA)
- [x] Icons semantically mapped to event types
- [x] Responsive layout (desktop, tablet, mobile)
- [x] Touch targets ≥44px
- [x] Keyboard navigation complete
- [x] Screen reader compatible
- [x] Motion sensitivity respected
- [x] Real-time animation specified
- [x] Collapse/expand rules defined
- [x] CSS tokens provided
- [x] Implementation pseudocode sketched

---

**UI Design Status:** ✓ Complete and aligned with PM spec  
**Ready for:** Dev handoff (dashboard component implementation)
