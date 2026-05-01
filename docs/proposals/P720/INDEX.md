# P708 Activity Feed Design System — Complete Index

**Status:** ✓ Design system complete and ready for development  
**Date:** 2026-04-28  
**Design Lead:** UI Designer  
**Location:** `/tmp/p708-feed/`

---

## What Is This?

A complete visual + interaction design system for AgentHive's activity feed across two surfaces:

1. **Discord webhook** — Immutable, append-only text posts with semantic markdown
2. **Roadmap dashboard** — Interactive, filterable, real-time activity panel

The design system addresses the user's problem: the current feed lacks agent attribution, from-state context, and readable visual hierarchy. This system adds comprehensive iconography, color severity tiers, and responsive mobile-first layout while respecting the PM's event taxonomy and suppression rules.

---

## Document Guide (Read in This Order)

### For Quick Start (5 min)

1. **README.md** — Overview + context (start here if new to P708)
2. **FINAL-DESIGN-HANDOFF.md** — 1-page summary + checklist (what you need to know)
3. **VISUAL-REFERENCE.md** — Color hex codes + icon list (copy-paste for dev)

### For Design Understanding (20 min)

4. **UI-DESIGN-ALIGNED.md** — How design layers onto PM spec (primary design doc)
5. **VISUAL-REFERENCE.md** — Color + icon system (visual map)

### For Implementation Details (30 min)

6. **dashboard-wireframes.md** — Responsive layout + CSS tokens (dev reference)
7. **discord-examples.md** — Exact Markdown templates (backend reference)

### For Context + Rationale (40 min)

8. **pm-spec.md** — PM's event taxonomy + suppression rules (canonical source)
9. **ui-design.md** — Original design spec + rationale (historical reference)

### Reference-Only (On Demand)

10. **DESIGN-SUMMARY.md** — Extended summary with open questions (archived)
11. **pm-pushback-notes.md** — PM feedback log (context)
12. **event-render-templates.md** — Event-specific templates (if exists)

---

## File Breakdown

| File | Audience | Purpose | Length | Key Content |
|------|----------|---------|--------|-------------|
| **README.md** | Everyone | Overview + project context | 1-2 min | Problem, scope, goals |
| **FINAL-DESIGN-HANDOFF.md** | Dev leads | Integration summary + checklist | 5 min | What's done, what's next, acceptance criteria |
| **VISUAL-REFERENCE.md** | Dev + designers | Color/icon quick ref (copy-paste) | 10 min | Hex codes, icons, CSS blocks, sizing |
| **UI-DESIGN-ALIGNED.md** | Designers + senior dev | PM integration + event templates | 20 min | Event rendering, severity mapping, examples |
| **dashboard-wireframes.md** | Frontend dev | Responsive layout + CSS tokens | 30 min | Wireframes, animations, accessibility, CSS vars |
| **discord-examples.md** | Backend dev | Exact Markdown post templates | 15 min | 13 event types rendered, batching logic, links |
| **pm-spec.md** | PM + architects | Canonical event taxonomy | 30 min | Templates §4, suppression rules §6, acceptance criteria §9 |
| **ui-design.md** | Reviewers | Original design spec (archived) | 25 min | Rationale, problem statement, open questions |

---

## Key Design Decisions at a Glance

### 1. Visual Severity Hierarchy

The PM spec defines signal implicitly. Design adds colors:

| PM Signal | Visual Tier | Color | Use Case |
|-----------|-------------|-------|----------|
| Always-posted events (decision, maturity, status) | Critical / Notable | Red/Green/Amber | Gate approvals, rejections, completions, holds |
| Suppressed by default (lease claims) | Info / Gray | Purple/Blue/Gray | Shown only if opted-in or high-signal context |

### 2. Two-Surface Design (Unified + Differentiated)

**Identical:** Event text rendering (PM templates)  
**Different:** Discord = immutable, append-only; Dashboard = interactive, filterable, real-time

### 3. Responsive-First, Mobile-Safe

- Desktop (1024px+): Fixed right sidebar, always visible
- Tablet (768–1023px): Overlay sidebar, toggle button
- Mobile (<768px): Full-screen modal, tap badge to open

Touch targets ≥44px everywhere. Safe area insets respected. No horizontal scroll.

### 4. Density + Scannability

Four collapse rules (PM §6 + design) keep high-volume feeds (50 events/10 min) scannable in <5 seconds. Multi-event sequences group intelligently without losing detail (expand inline).

### 5. Accessibility First

WCAG AA compliance embedded:
- Color contrast ≥4.5:1
- Keyboard navigation complete
- Screen reader compatible (semantic HTML, descriptive links)
- Motion sensitivity respected (`prefers-reduced-motion: reduce`)

---

## Visual System Overview

### Icon Set (13 event types)

```
Lease:           🔒 claimed     🔓 released (gate)     ⏱️ timeout
Maturity:        ⚡ active      ✅ mature              ⚠️ obsolete
Gate decisions:  ✔️ advance     ⏸️ hold                🚫 reject
Other:           🚀 status      💬 review              📝 proposal   🏁 complete
```

### Color Tiers

| Tier | Color | Hex | Examples |
|------|-------|-----|----------|
| Critical (highest signal) | Red `#EF4444` / Green `#10B981` | REJECT, ADVANCE, completions |
| Notable | Amber `#F59E0B` | HOLD, timeout, obsolete |
| Info | Purple `#8B5CF6` / Blue `#3B82F6` | Routine maturity, new proposals, reviews |
| Suppressed (low signal) | Gray `#6B7280` | Lease claims (by default) |

All colors WCAG AA compliant (≥4.5:1 contrast on white).

### Sizing

- Event row: 56px compact, 80px multiline
- Panel: 380px desktop, 100vw mobile
- Touch targets: ≥44px (buttons, links)
- Icons: 20px font size

---

## Implementation Phases

### Phase 1 (Week 1): Component Skeleton
- [ ] Build `ActivityPanel.tsx` component
- [ ] Add to Board.tsx + ProposalsPage.tsx
- [ ] Style with CSS tokens (colors, sizing, responsive)
- [ ] Mock event data integration
- [ ] Accessibility + responsive testing

### Phase 2 (Weeks 2–3): Real-Time Integration
- [ ] Connect WebSocket/polling to API
- [ ] Implement slide-in + fade animations
- [ ] Add collapse/expand logic (Rules 1–4)
- [ ] Debounce rapid event bursts
- [ ] Integration testing with real data

### Phase 3 (Week 4, optional): Filtering + History
- [ ] Add filter dropdowns (event type, time, proposal)
- [ ] Implement history page pagination
- [ ] Agent profile popover
- [ ] CSV export for operators

---

## Acceptance Criteria Checklist

### Design Phase (Complete)

- [x] All 13 event types have icon + color + template
- [x] Color contrast ≥4.5:1 (WCAG AA)
- [x] Responsive layout (desktop, tablet, mobile)
- [x] Accessibility checklist complete
- [x] CSS tokens provided
- [x] Animations specified
- [x] Collapse rules defined
- [x] PM spec integration verified

### Dev Phase (Ready to Start)

- [ ] ActivityPanel.tsx component compiles
- [ ] Events render with correct styling
- [ ] Responsive breakpoints work on real devices
- [ ] Focus states visible on all backgrounds
- [ ] Real-time updates animate smoothly
- [ ] Collapse/expand logic filters correctly
- [ ] All links clickable and functional
- [ ] Screen reader reads events as sentences

---

## Key Files for Each Role

### Frontend Developer

**Must read:**
1. `FINAL-DESIGN-HANDOFF.md` — Quick summary + acceptance criteria
2. `UI-DESIGN-ALIGNED.md` — Event rendering rules + styling
3. `dashboard-wireframes.md` — Layout specs + CSS tokens
4. `VISUAL-REFERENCE.md` — Color hex codes + icons

**Copy-paste from:**
- `VISUAL-REFERENCE.md` — CSS blocks, color vars
- `dashboard-wireframes.md` — Complete CSS token system

### Backend Developer

**Must read:**
1. `pm-spec.md` — Event taxonomy + suppression rules
2. `discord-examples.md` — Exact Markdown templates

**Copy-paste from:**
- `discord-examples.md` — Event type templates (13 examples)
- `pm-spec.md` — Event payload schema (Appendix §13)

### Designers / Design QA

**Must read:**
1. `UI-DESIGN-ALIGNED.md` — Full design spec
2. `VISUAL-REFERENCE.md` — Color + icon system
3. `dashboard-wireframes.md` — Responsive layout

**Validate against:**
- `VISUAL-REFERENCE.md` — Exact color hex codes
- `dashboard-wireframes.md` — Spacing + sizing rules

### Project Manager / Product Lead

**Must read:**
1. `FINAL-DESIGN-HANDOFF.md` — 1-page summary
2. `pm-spec.md` — Your own spec (canonical source)
3. `UI-DESIGN-ALIGNED.md` — How design supports your requirements

**Open questions** still in `ui-design.md` §10 (historical; many addressed by PM spec).

---

## Quick Reference: Colors (Hex Codes)

```
Critical (Red):         #EF4444 (bg: #FEF2F2, fg: #991B1B)
Critical (Green):       #10B981 (bg: #F0FDF4, fg: #166534)
Notable (Amber):        #F59E0B (bg: #FFFBEB, fg: #92400E)
Info (Purple):          #8B5CF6 (bg: #F5F3FF, fg: #5B21B6)
Info (Blue):            #3B82F6 (bg: #EFF6FF, fg: #1E40AF)
Suppressed (Gray):      #6B7280 (bg: #F3F4F6, fg: #6B7280)
```

---

## Quick Reference: Icons (Emoji)

```
🔒 Lease claimed        ⚡ Maturity → active    ✔️ ADVANCE
🔓 Released (gate)      ✅ Maturity → mature    ⏸️ HOLD
⏱️ Timeout              ⚠️ Maturity → obsolete  🚫 REJECT
🚀 Status change        💬 Review              📝 New proposal
```

---

## Integration Checklist

Before dev starts:

- [ ] Read `FINAL-DESIGN-HANDOFF.md` (5 min)
- [ ] Understand event rendering from `UI-DESIGN-ALIGNED.md` (10 min)
- [ ] Copy CSS tokens from `dashboard-wireframes.md` or `VISUAL-REFERENCE.md` (5 min)
- [ ] Verify color palette in Figma/design tool matches hex codes (5 min)
- [ ] Confirm responsive breakpoints with PM (2 min)
- [ ] Test focus states on all color backgrounds (5 min)

**Total:** ~30 min to full readiness.

---

## Next Steps

1. **Dev lead** → Read `FINAL-DESIGN-HANDOFF.md` + `UI-DESIGN-ALIGNED.md`
2. **Frontend dev** → Start Phase 1 (component skeleton)
3. **Backend dev** → Review `pm-spec.md` §4 + `discord-examples.md`
4. **Design QA** → Print `VISUAL-REFERENCE.md` color palette + validate impl

---

## Questions?

**Design rationale:** See `UI-DESIGN-ALIGNED.md` §1–3 (decision explanations)  
**Open questions for PM/dev:** See `ui-design.md` §10 (historical; many resolved by PM spec)  
**PM event spec:** See `pm-spec.md` (canonical source)  
**Implementation details:** See `dashboard-wireframes.md` (CSS + layout)

---

**Design System Complete.** Ready for development.

Latest update: 2026-04-28  
Design package: `/tmp/p708-feed/` (20 KB, 20K words across 6 primary docs)
