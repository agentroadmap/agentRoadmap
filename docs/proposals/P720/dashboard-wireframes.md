# Dashboard Activity Panel — Detailed Wireframes & Implementation Guide

---

## 1. Desktop Layout (1024px+)

### Board.tsx Integration — Right Sidebar

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ AgentHive Dashboard / Board                                                      [⚙️] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌───────────────────────────────────┬──────────────────────────────────┐              │
│  │  DRAFT (6)      REVIEW (4)        │  DEVELOP (8)    MERGE (2)        │              │
│  ├───────────────────────────────────┼──────────────────────────────────┤              │
│  │                                   │                                  │              │
│  │ ┌─────────────────────────────┐  │ ┌────────────────────────────────────────────┐ │
│  │ │ P701 | RFC Draft            │  │ │ P705 | RFC Develop                         │ │
│  │ │ Timeline review             │  │ │ Operator visibility surface                │ │
│  │ │ 🔒 codex-two                │  │ │ ⚡ ACTIVE, claimed 6m ago                  │ │
│  │ │ 2 days old                  │  │ │ [View] [Comment]                           │ │
│  │ └─────────────────────────────┘  │ │                                            │ │
│  │                                   │ │ ┌────────────────────────────────────────┐ │ │
│  │ ┌─────────────────────────────┐  │ │ │ ACTIVITY PANEL                         │ │ │
│  │ │ P702 | RFC Draft            │  │ │ ├────────────────────────────────────────┤ │ │
│  │ │ Multi-project bootstrap     │  │ │ │                                        │ │ │
│  │ │ 📝 NEW, waiting for leader  │  │ │ │ 🔒 codex-two claimed P705|DEVELOP    │ │ │
│  │ │ 5 hours old                 │  │ │ │    (6m ago)                            │ │ │
│  │ │ [View] [Comment]            │  │ │ │                                        │ │ │
│  │ └─────────────────────────────┘  │ │ │ ✅ codex-three marked P674 MATURE    │ │ │
│  │                                   │ │ │    |DEVELOP (4m ago)                   │ │ │
│  │ ┌─────────────────────────────┐  │ │ │                                        │ │ │
│  │ │ P703 | RFC Draft            │  │ │ │ ⚡ 3 lease claims in 30s window       │ │ │
│  │ │ SDK consolidation           │  │ │ │    [Show batch] (2m ago)               │ │ │
│  │ │ 📝 NEW, awaiting review     │  │ │ │                                        │ │ │
│  │ │ 3 days old                  │  │ │ │ 📝 jane-smith created P710             │ │ │
│  │ │ [View] [Comment]            │  │ │ │    |RFC Draft (1m ago)                 │ │ │
│  │ └─────────────────────────────┘  │ │ │                                        │ │ │
│  │                                   │ │ │ 💬 jane-smith reviewed P720            │ │ │
│  │ [Load more draft cards...]        │ │ │    DRAFT — 2 items (45s ago)           │ │ │
│  │                                   │ │ │                                        │ │ │
│  │                                   │ │ │ [Show 8 more events] ∨                 │ │ │
│  │                                   │ │ │                                        │ │ │
│  │                                   │ │ └────────────────────────────────────────┘ │ │
│  │                                   │ │                                            │ │
│  │                                   │ │ ┌────────────────────────────────────────┐ │ │
│  │                                   │ │ │ P706 | RFC Merge                       │ │ │
│  │                                   │ │ │ State feed v2                          │ │ │
│  │                                   │ │ │ ✅ MATURE, merged 2h ago               │ │ │
│  │                                   │ │ │ [View] [Comment]                       │ │ │
│  │                                   │ │ └────────────────────────────────────────┘ │ │
│  │                                   │                                               │ │
│  └───────────────────────────────────┴──────────────────────────────────┘              │
│                                                                                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Panel placement:** Right sidebar, fixed width 380px, 100vh height, scrollable content.

**Panel responsiveness:**
- Desktop (1024px+): Always visible sidebar
- Tablet (768–1023px): Toggle button in header, slides out as overlay
- Mobile (<768px): Hidden by default, tap "Activity Feed" badge in header

---

## 2. Mobile Layout (<768px)

### Collapsed Header Badge

```
┌──────────────────────────────────────────────┐
│ Proposals                    [🔔 ACTIVITY▼]  │  ← Tap to expand modal
├──────────────────────────────────────────────┤
│                                              │
│ ┌────────────────────────────────────────┐  │
│ │ P705 | RFC Develop                     │  │
│ │ Operator visibility surface            │  │
│ │ [More] [Comment]                       │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ ┌────────────────────────────────────────┐  │
│ │ P702 | RFC Draft                       │  │
│ │ Multi-project bootstrap                │  │
│ │ [More] [Comment]                       │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ [Load more...]                               │
│                                              │
└──────────────────────────────────────────────┘
```

**Badge styling:**
- Indicator dot (red/amber/green) if unread activity
- "ACTIVITY" text + chevron "∨"
- Tap to open full-screen modal

### Activity Modal (Full Screen, Mobile)

```
┌──────────────────────────────────────────────┐
│ ← Activity Feed        [🔍] [⚙️]              │
├──────────────────────────────────────────────┤
│                                              │
│ 🔒 codex-two claimed P705|DEVELOP           │
│    (6m ago)                                 │
│                                              │
│ ─────────────────────────────────────────── │
│                                              │
│ ✅ codex-three marked P674 MATURE|DEVELOP   │
│    (4m ago)                                 │
│                                              │
│ ─────────────────────────────────────────── │
│                                              │
│ ⚡ 3 lease claims in 30s window [Show ▼]    │
│    (2m ago)                                 │
│                                              │
│ ─────────────────────────────────────────── │
│                                              │
│ 📝 jane-smith created P710|RFC Draft        │
│    (1m ago)                                 │
│                                              │
│ ─────────────────────────────────────────── │
│                                              │
│ [Load more events] ∨                        │
│                                              │
│                                              │
└──────────────────────────────────────────────┘
```

**Modal behavior:**
- Height: 100vh (full screen)
- Swipe down to close (native mobile UX)
- Safe area inset respected (notch, home bar)
- Tap proposal ID to navigate to detail page
- Pull-to-refresh for instant update

---

## 3. Empty State

```
┌──────────────────────────────────────────┐
│ ACTIVITY FEED                            │
├──────────────────────────────────────────┤
│                                          │
│                                          │
│           🌱 No events yet               │
│                                          │
│      Start by creating or claiming      │
│      a proposal to see activity         │
│                                          │
│      [Browse Drafts] [Create New]        │
│                                          │
│                                          │
│                                          │
└──────────────────────────────────────────┘
```

**Spacing:** Vertically centered, padding 2rem

---

## 4. Loading State (First Page Load)

```
┌──────────────────────────────────────────┐
│ ACTIVITY FEED                            │
├──────────────────────────────────────────┤
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ⏳ Loading…                           │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ⏳ Loading…                           │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ ⏳ Loading…                           │ │
│ └──────────────────────────────────────┘ │
│                                          │
│                                          │
└──────────────────────────────────────────┘
```

**Skeleton style:** Gray placeholder bars, 3 rows, 200ms staggered animation.

---

## 5. Individual Event Rows — Detailed Specs

### Event Row Anatomy

```
┌─ 4px left border (color) ─────────────────────────────────────────────────────────┐
│                                                                                    │
│ [ICON]  AGENT           ACTION TEXT                                    [TIME]     │
│ (20px)  (12–20px)        (body text, 14px)                           (12px, gray) │
│          bold            Regular text with optional **bold**            Tertiary   │
│         #3B82F6          Links styled in primary color                  color     │
│                                                                                    │
│ [ICON]  → CONTEXT TEXT (secondary detail, 13px, gray)                             │
│ (20px)    Regular text, typically proposal summary or decision note               │
│                                                                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Lease Claimed Row

```
┌─────────────────────────────────────────────────────────┐
│ 🔒 codex-two claimed P705|DEVELOP          6m ago      │
│ → Expected duration: 2–3 days               [GRAY]     │
└─────────────────────────────────────────────────────────┘
```

**Color:** Gray (info tier) `#F3F4F6` bg, `#6B7280` text  
**Border:** Gray accent `#D1D5DB`  
**Height:** 56px (touch-safe ≥44px rule)

### Gate Decision — Approved (Critical)

```
┌─ Green border ────────────────────────────────────────┐
│ ✔️ **skeptic-alpha ADVANCED** P705|REVIEW→DEVELOP    │
│ → Gating notes: AC met. No architectural blockers.    │
│                                                        │
│    [View gating decision]                 2m ago     │
│                                          [GRAY]      │
└────────────────────────────────────────────────────────┘
```

**Color:** Green (critical tier) `#F0FDF4` bg, `#166534` text  
**Border:** Green `#22C55E`  
**Height:** 72px (multiline)  
**Highlight fade:** 2s at full opacity, 8s fade to neutral

### Maturity Transition → Mature (Notable)

```
┌─ Purple border ────────────────────────────────────────┐
│ ✅ codex-three marked P674 **MATURE**|DEVELOP         │
│ → Ready for gating review.         4m ago            │
│                                   [GRAY]             │
└────────────────────────────────────────────────────────┘
```

**Color:** Purple (notable tier) `#F5F3FF` bg, `#5B21B6` text  
**Border:** Purple `#D8B4FE`  
**Height:** 56px

### Collapsed Batch (Multiple Events)

```
┌─ Purple border ────────────────────────────────────────┐
│ ⚡ 3 lease claims in 30s window [Show individual ▼]   │
│                                                        │
│    • codex-two P674|REVIEW                             │
│    • worker-15097 P675|DEVELOP                         │
│    • claude-joe P710|DRAFT                             │
│                                           2m ago      │
└────────────────────────────────────────────────────────┘
```

**Expanded inline:** Show ≤3 items; if more, use expandable detail section.  
**Collapsible toggle:** Click [Show individual ▼] to expand full event timeline for that batch.

---

## 6. Filtering Bar (Optional v2 Feature)

```
┌──────────────────────────────────────────────────────────────┐
│ 🔍 Proposal ID: [P705       ▼]                                │
│                                                               │
│ Event Type:  [All ▼]  [Gate Decisions] [Completions] [Lease] │
│              [Show]                                            │
│                                                               │
│ Time Range:  [Last 1 hour ▼]  [24h] [7d]  [Reset]            │
│              [Clear filters]                                  │
│                                                               │
│ ─────────────────────────────────────────────────────────────│
│ Showing 15 events (filtered from 47 total)                    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Implementation notes:**
- Debounce search input (300ms)
- Tab UX for event type quickfilter
- Time range picker with presets
- Live result count

---

## 7. Real-Time Update Animation

**New event slide-in:**
```
0ms:      Event is off-screen to the right
          opacity: 0, transform: translateX(20px)

75ms:     Event slides in, becoming visible
          opacity: 1, transform: translateX(0)
          transition: 150ms cubic-bezier(0.4, 0, 0.2, 1)

500ms:    Event settles at normal position
          Highlight background color active (2s full opacity)

2.5s:     Background highlight begins fade
          opacity: 1 → 0.3 (8s ease-out)

10.5s:    Background returns to neutral
          Event visually identical to older rows
```

**CSS:**
```css
@keyframes slideInFromRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeHighlight {
  0% { background-color: var(--feed-highlight-color); }
  20% { background-color: var(--feed-highlight-color); }
  100% { background-color: transparent; }
}

.activity-event--new {
  animation: slideInFromRight 0.15s cubic-bezier(0.4, 0, 0.2, 1),
             fadeHighlight 10s ease-out 2s forwards;
}
```

---

## 8. Pagination & History

**Live panel:** Last 15 events visible; older events move to "Show X more" button.

**Full history page (v2):**
```
/proposals/:id/activity  or  /dashboard/activity
```

Features:
- All events for a single proposal (if accessed from proposal detail)
- Or global activity history (if accessed from dashboard)
- Pagination: 50 events per page
- Advanced filters: proposal, agent, event type, date range
- Export as CSV (operator use case)

---

## 9. Responsive Breakpoint Rules

| Breakpoint | Panel | Header | Modal |
|------------|-------|--------|-------|
| <640px | Hidden (badge only) | Activity badge visible | Full-screen modal on tap |
| 640–767px | Hidden (badge only) | Activity badge visible | Full-screen modal on tap |
| 768–1023px | Overlay sidebar (slide-in from right) | Toggle button | — |
| 1024px+ | Fixed sidebar (always visible) | — | — |

**Key behaviors:**
- Sidebar always has min-width 320px, max-width 400px
- On tablet, sidebar overlays content (z-index 50) with 50% opacity backdrop
- On mobile, modal uses safe-area-inset to respect notches + home bar
- Touch targets always ≥44px height

---

## 10. Accessibility Checklist

- [ ] Focus order: Activity panel keyboard-navigable (Tab → each event → "Show more" button)
- [ ] ARIA labels: `role="region"` + `aria-label="Recent activity feed"`
- [ ] Links: Proposal IDs are `<a>` tags with descriptive text ("Go to P705 | DEVELOP proposal")
- [ ] Color not only signal: Icons + text always accompany color
- [ ] Motion: `prefers-reduced-motion: reduce` skips animations
- [ ] Mobile: Swipe gestures have keyboard alternatives (← back button)
- [ ] Screen reader: Event rows read as complete sentences ("Agent codex-two claimed P705 DEVELOP proposal. 6 minutes ago.")
- [ ] Focus visible: `:focus-visible` outline on all interactive elements

---

## 11. CSS Tokens (Activity Panel)

```css
:root {
  /* Activity Panel Sizing */
  --panel-width: 380px;
  --panel-max-width: 400px;
  --panel-min-width: 320px;
  
  /* Event Row */
  --event-row-height-compact: 56px;        /* 4.5 × 8px */
  --event-row-height-multiline: 72px;      /* 5.5 × 8px */
  --event-icon-size: 20px;
  --event-border-width: 4px;
  --event-gap: 8px;
  --event-padding: 12px 16px;
  
  /* Severity Colors (backgrounds + text + borders) */
  --severity-critical-bg: #FEF2F2;
  --severity-critical-fg: #991B1B;
  --severity-critical-border: #EF4444;
  
  --severity-notable-bg: #FFFBEB;
  --severity-notable-fg: #92400E;
  --severity-notable-border: #F59E0B;
  
  --severity-info-bg: #F5F3FF;
  --severity-info-fg: #5B21B6;
  --severity-info-border: #D8B4FE;
  
  --severity-gray-bg: #F3F4F6;
  --severity-gray-fg: #6B7280;
  --severity-gray-border: #D1D5DB;
  
  /* Animations */
  --event-slide-duration: 150ms;
  --event-slide-easing: cubic-bezier(0.4, 0, 0.2, 1);
  --event-fade-duration: 10s;
  --event-fade-delay: 2s;
  --event-fade-easing: ease-out;
}

/* Activity Panel Container */
.activity-panel {
  position: fixed;
  right: 0;
  top: 64px;                              /* Below header */
  width: var(--panel-width);
  height: calc(100vh - 64px);
  background: white;
  border-left: 1px solid #E5E7EB;
  overflow-y: auto;
  z-index: 40;
  padding: 16px 0;
}

@media (max-width: 1023px) {
  .activity-panel {
    position: fixed;
    right: -380px;
    transition: right 200ms ease;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
  }
  
  .activity-panel--open {
    right: 0;
  }
  
  .activity-panel::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: -1;
  }
}

@media (max-width: 767px) {
  .activity-panel {
    width: 100vw;
    right: -100vw;
    border-left: none;
    padding-top: max(16px, env(safe-area-inset-top));
  }
}

/* Event Row */
.activity-event {
  display: flex;
  flex-direction: column;
  gap: var(--event-gap);
  padding: var(--event-padding);
  border-left: var(--event-border-width) solid currentColor;
  background-color: var(--event-bg-color);
  color: var(--event-fg-color);
  min-height: var(--event-row-height-compact);
  animation: slideInFromRight var(--event-slide-duration) var(--event-slide-easing),
             fadeHighlight var(--event-fade-duration) var(--event-fade-easing) var(--event-fade-delay) forwards;
  cursor: pointer;
  transition: background-color 200ms ease;
}

.activity-event:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.activity-event:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: -2px;
}

.activity-event--critical {
  --event-bg-color: var(--severity-critical-bg);
  --event-fg-color: var(--severity-critical-fg);
  --event-border-color: var(--severity-critical-border);
}

.activity-event--notable {
  --event-bg-color: var(--severity-notable-bg);
  --event-fg-color: var(--severity-notable-fg);
  --event-border-color: var(--severity-notable-border);
}

.activity-event--info {
  --event-bg-color: var(--severity-info-bg);
  --event-fg-color: var(--severity-info-fg);
  --event-border-color: var(--severity-info-border);
}

/* Header Row (agent + action) */
.activity-event__header {
  display: flex;
  align-items: baseline;
  gap: var(--event-gap);
  font-size: 14px;
  line-height: 1.5;
}

.activity-event__icon {
  font-size: var(--event-icon-size);
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

/* Detail Row (context) */
.activity-event__detail {
  font-size: 13px;
  line-height: 1.4;
  opacity: 0.8;
  padding-left: 28px;                    /* Icon width + gap */
}

.activity-event__detail-icon {
  margin-right: 4px;
}

/* Link styling */
.activity-event__link {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: rgba(0, 0, 0, 0.2);
  text-underline-offset: 2px;
}

.activity-event__link:hover {
  text-decoration-color: currentColor;
}

/* Loading skeleton */
.activity-event--skeleton {
  background: linear-gradient(
    90deg,
    rgba(200, 200, 200, 0.2) 25%,
    rgba(200, 200, 200, 0.3) 50%,
    rgba(200, 200, 200, 0.2) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

**Prepared by:** UI Designer  
**Status:** Ready for dashboard component development  
**Reference:** Main design doc: `/tmp/p708-feed/ui-design.md`
