# P708 Visual Reference — Color + Icon Quick Guide

**For:** Designers, developers, QA  
**Purpose:** Copy-paste color values, icon sets, sizing rules  
**Date:** 2026-04-28

---

## Event Type → Icon → Color → Severity (Quick Lookup)

```
EVENT TYPE              ICON  DESCRIPTION            COLOR       BG COLOR   FG COLOR   SEVERITY
─────────────────────────────────────────────────────────────────────────────────────────────────
lease_claimed           🔒    Ownership locked       #6B7280     #F3F4F6    #6B7280    Info
maturity_changed→active ⚡    Momentum/energy        #8B5CF6     #F5F3FF    #5B21B6    Info
maturity_changed→mature ✅    Ready/approved         #10B981     #F0FDF4    #166534    Notable
maturity_changed→obso.  ⚠️    Warning/voided         #F59E0B     #FFFBEB    #92400E    Notable
status_changed         🚀    Launch/progression     #3B82F6     #EFF6FF    #1E40AF    Info
decision_made ADVANCE   ✔️    Approved/yes           #10B981     #F0FDF4    #166534    Critical
decision_made HOLD      ⏸️    Pause/waiting          #F59E0B     #FFFBEB    #92400E    Critical
decision_made REJECT    🚫    Denied/no              #EF4444     #FEF2F2    #991B1B    Critical
lease_released (gate)   🔓    Unlocked               #10B981     #F0FDF4    #166534    Notable
lease_released (timeout)⏱️    Time expired           #F59E0B     #FFFBEB    #92400E    Notable
review_submitted        💬    Feedback/comment       #3B82F6     #EFF6FF    #1E40AF    Info
proposal_created        📝    New document           #3B82F6     #EFF6FF    #1E40AF    Info
review (BLOCKER)        💬    Blocker feedback       #EF4444     #FEF2F2    #991B1B    Critical
```

---

## Hex Color Palette (Drop-in Reference)

### Critical (Highest Signal)

```css
/* ADVANCE / APPROVE / MATURE / DELIVERED */
--color-critical-green: #10B981;
--color-critical-green-bg: #F0FDF4;
--color-critical-green-fg: #166534;

/* REJECT / HOLD (urgent) / BLOCKER */
--color-critical-red: #EF4444;
--color-critical-red-bg: #FEF2F2;
--color-critical-red-fg: #991B1B;
```

### Notable (Medium Signal)

```css
/* MATURE / GATE DECISIONS / TIMEOUT */
--color-notable-amber: #F59E0B;
--color-notable-amber-bg: #FFFBEB;
--color-notable-amber-fg: #92400E;

/* MATURE APPROVAL (alt) */
--color-notable-green: #10B981;
--color-notable-green-bg: #F0FDF4;
--color-notable-green-fg: #166534;
```

### Info (Low Signal, Visible)

```css
/* ROUTINE MATURITY / REVIEWS / NEW PROPOSALS */
--color-info-purple: #8B5CF6;
--color-info-purple-bg: #F5F3FF;
--color-info-purple-fg: #5B21B6;

--color-info-blue: #3B82F6;
--color-info-blue-bg: #EFF6FF;
--color-info-blue-fg: #1E40AF;
```

### Suppressed (Low Signal, Hidden by Default)

```css
/* LEASE CLAIMS / ROUTINE RELEASES */
--color-gray: #6B7280;
--color-gray-bg: #F3F4F6;
--color-gray-fg: #6B7280;
--color-gray-border: #D1D5DB;
```

---

## Icon Set (Copy-Paste)

### Lease Events
- Claimed: 🔒
- Released: 🔓
- Timeout: ⏱️

### Maturity Transitions
- → active: ⚡
- → mature: ✅
- → obsolete: ⚠️

### Gate Decisions
- ADVANCE: ✔️
- HOLD: ⏸️
- REJECT: 🚫

### Other Events
- status_changed: 🚀
- review_submitted: 💬
- proposal_created: 📝
- Completion: 🏁

---

## Sizing Reference

### Event Row Heights
```css
--event-height-compact: 56px;      /* Single line + time */
--event-height-multiline: 80px;    /* Headline + detail + time */
--event-height-expanded: 120px;    /* Expanded multi-line batch */
```

### Spacing
```css
--event-padding: 12px 16px;        /* Vertical 12px, horizontal 16px */
--event-gap: 8px;                  /* Gap between icon/text/time */
--event-border-width: 4px;         /* Left border thickness */
--event-icon-size: 20px;           /* Emoji font size */
```

### Panel Dimensions
```css
--panel-width: 380px;              /* Desktop sidebar width */
--panel-max-width: 400px;          /* Tablet overlay max */
--panel-min-width: 320px;          /* Mobile min width */
```

### Typography
```css
--event-header-size: 14px;         /* Agent + action text */
--event-detail-size: 13px;         /* Proposal title / context */
--event-time-size: 12px;           /* "6m ago" secondary text */
--event-header-weight: 600;        /* Agent name bold */
--event-action-weight: 400;        /* Regular action text */
```

---

## Responsive Breakpoints

```css
/* Mobile First */
@media (max-width: 639px) {
  /* Panel hidden; badge only */
  .activity-panel { display: none; }
  .activity-badge { display: block; }
}

@media (min-width: 640px) and (max-width: 767px) {
  /* Still mobile/small tablet; panel modal */
  .activity-panel { position: fixed; width: 100vw; }
}

@media (min-width: 768px) and (max-width: 1023px) {
  /* Tablet; overlay sidebar */
  .activity-panel { width: 380px; position: fixed; right: -380px; }
  .activity-panel--open { right: 0; }
}

@media (min-width: 1024px) {
  /* Desktop; always-visible sidebar */
  .activity-panel { width: 380px; position: fixed; right: 0; }
}
```

---

## Focus States (Accessibility)

```css
.activity-event:focus-visible {
  outline: 2px solid #3B82F6;     /* Primary blue */
  outline-offset: -2px;            /* Inside the element */
}

/* Contrast check: #3B82F6 on all backgrounds ≥3:1 */
/* On white: ✓ 4.0:1 */
/* On #F3F4F6 (gray): ✓ 3.2:1 */
/* On #FEF2F2 (red): ✓ 3.1:1 */
```

---

## Animation Timings

```css
--animation-slide-duration: 150ms;        /* Slide-in speed */
--animation-slide-easing: cubic-bezier(0.4, 0, 0.2, 1);

--animation-fade-duration: 10s;           /* Total fade time */
--animation-fade-delay: 2s;               /* Wait before fading */
--animation-fade-easing: ease-out;        /* Ease-out curve */

/* Result: Event appears instantly, stays highlighted 2s, fades over 10s */
```

---

## Border + Shadow

```css
--event-border-width: 4px;         /* Left accent border */
--event-border-color: (varies);    /* Per event type */
--event-border-radius: 4px;        /* Slight roundedness */

--shadow-none: none;
--shadow-hover: 0 1px 3px rgba(0, 0, 0, 0.1);  /* On hover */
--shadow-focus: 0 0 0 3px rgba(59, 130, 246, 0.1);  /* Focus ring */
```

---

## Motion Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  .activity-event--new {
    /* Skip slide-in + fade animations */
    animation: none;
    opacity: 1;
    transform: translateX(0);
  }
  
  .activity-event {
    transition: none;
  }
}
```

---

## Font Families (Inherited from Dashboard)

```css
--font-primary: 'Inter', system-ui, sans-serif;    /* Body */
--font-mono: 'JetBrains Mono', monospace;          /* Code */
```

(Reuse existing dashboard typography system; no new fonts.)

---

## Developer Copy-Paste Blocks

### Critical Green (ADVANCE / APPROVE)
```css
.activity-event--critical-green {
  background-color: #F0FDF4;
  color: #166534;
  border-color: #10B981;
}
```

### Critical Red (REJECT / BLOCKER)
```css
.activity-event--critical-red {
  background-color: #FEF2F2;
  color: #991B1B;
  border-color: #EF4444;
}
```

### Notable Amber (HOLD / TIMEOUT)
```css
.activity-event--notable-amber {
  background-color: #FFFBEB;
  color: #92400E;
  border-color: #F59E0B;
}
```

### Info Purple (ROUTINE MATURITY)
```css
.activity-event--info-purple {
  background-color: #F5F3FF;
  color: #5B21B6;
  border-color: #D8B4FE;
}
```

### Info Blue (NEW PROPOSALS / REVIEWS / STATUS)
```css
.activity-event--info-blue {
  background-color: #EFF6FF;
  color: #1E40AF;
  border-color: #60A5FA;
}
```

### Info Gray (SUPPRESSED CLAIMS)
```css
.activity-event--info-gray {
  background-color: #F3F4F6;
  color: #6B7280;
  border-color: #D1D5DB;
}
```

---

## Complete Event Row CSS (Template)

```css
.activity-event {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-left: 4px solid currentColor;
  border-radius: 4px;
  min-height: 56px;
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

.activity-event--new {
  animation:
    slideInFromRight 150ms cubic-bezier(0.4, 0, 0.2, 1),
    fadeHighlight 10s ease-out 2s forwards;
}

@keyframes slideInFromRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fadeHighlight {
  0% { background-color: rgba(250, 204, 21, 0.3); }
  20% { background-color: rgba(250, 204, 21, 0.3); }
  100% { background-color: transparent; }
}

.activity-event__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.activity-event__icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.activity-event__agent {
  font-weight: 600;
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
  padding-left: 28px;  /* Align with icon + gap */
}
```

---

## Emotion/Tailwind Class Names (If Using Utility CSS)

```css
/* Instead of custom CSS, could use: */

.event-critical-green = bg-green-50 text-green-900 border-l-4 border-green-500
.event-critical-red = bg-red-50 text-red-900 border-l-4 border-red-500
.event-notable-amber = bg-amber-50 text-amber-900 border-l-4 border-amber-400
.event-info-purple = bg-purple-50 text-purple-900 border-l-4 border-purple-300
.event-info-blue = bg-blue-50 text-blue-900 border-l-4 border-blue-300
.event-info-gray = bg-gray-100 text-gray-700 border-l-4 border-gray-300

/* All require padding p-3 and border-radius rounded */
```

(Reference only; primary approach is CSS custom properties for maintainability.)

---

## Checklist for Implementation

### Colors
- [ ] All 6 color groups defined (critical, notable, info × 2, gray)
- [ ] Contrast verified ≥4.5:1 on all backgrounds
- [ ] Focus outline color tested on all event backgrounds
- [ ] Dark mode variants (if applicable) added

### Icons
- [ ] 13 icons tested in dashboard context (emoji render consistently)
- [ ] Sizing 20px validated on mobile + desktop
- [ ] Alignment with text verified (baseline, centering)

### Sizing
- [ ] Event rows 56px compact, 80px multiline measured
- [ ] Touch targets ≥44px verified (buttons, links)
- [ ] Panel width 380px on desktop, responsive on mobile
- [ ] Safe area insets applied on iOS

### Animation
- [ ] Slide-in 150ms tested on slow networks
- [ ] Highlight fade 10s not too aggressive
- [ ] Motion reduced respected via media query
- [ ] No janky transitions on low-end devices

### Accessibility
- [ ] Focus outline visible on all backgrounds
- [ ] Keyboard Tab order correct
- [ ] Screen reader tested (events read as sentences)
- [ ] Color not sole differentiator (icons + text always together)

---

**Quick Ref Version:** 1.0  
**Last Updated:** 2026-04-28  
**For Questions:** See `UI-DESIGN-ALIGNED.md` or `FINAL-DESIGN-HANDOFF.md`
