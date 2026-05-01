# P708 State Feed Redesign — PM Spec & Decisions

**Date:** 2026-04-28  
**Status:** Ready for User Review  
**Audience:** Ops, Dev Lead, Design Lead, Product Lead

---

## What's Here

This directory contains the **Product Manager specification** for redesigning AgentHive's state feed — the activity stream that surfaces what agents and proposals are doing in real time.

Three documents:

1. **`pm-spec.md`** — The canonical spec. Event taxonomy, display templates, filtering rules, acceptance criteria, edge cases. ~900 words.
2. **`pm-pushback-notes.md`** — PM's opinionated decisions + rationale. Open questions that need user input. ~500 words.
3. **`README.md`** — This file. Quick orientation.

---

## The Problem (1-minute read)

**Current state:** Discord webhook and web dashboard both emit raw event streams with missing context.

- Event: `⏫ P705 maturity: ? → active`
- Missing: who did this? what stage is P705 in? why did they do it?
- Result: operators can't tell what's happening without manual DB queries.

**Volume:** 632 lease-claimed events/day ≈ 26 posts/hr, but most are noise (routine work). Operators report the feed is "not very informative."

**Goal:** make the feed legible and actionable without adding chaos.

---

## The Solution (2-minute read)

### Event Taxonomy

Seven event types render with **canonical templates** that include:
- **WHO** (agent name) — always required
- **WHAT** (action verb) — event-specific
- **WHICH** (P### with stage label) — always required
- **WHY** (rationale/implication) — only if high-signal

Example renders:

```
agent alice decided ADVANCE on P502|REVIEW — approved for development
maturity shift on P703|DEVELOP: new → active
agent bob released P601|REVIEW — gate hold: blocked by P604
```

### Volume Control

- **Claim events:** suppressed by default (26/hr is noise). Ops opt in or see only high-signal claims (gating reviews).
- **Routine releases:** suppressed (work_delivered, lease_expired). Only gate decisions (hold, reject, waive) post.
- **Status/maturity shifts:** always posted (high-signal).
- **Decisions:** always posted (highest-signal).
- **Result:** ~5–8 posts/hr instead of 26+.

### Stage Labels

All P### references include the workflow stage label (RFC or Hotfix):
- `P502|REVIEW` — RFC proposal in Review stage
- `P703|DEVELOP` — RFC proposal in Develop stage
- `P601|FIX` — Hotfix proposal in Fix stage

Stage names are derived from the database (`StateNamesRegistry`), not hardcoded. If a stage name changes in the workflow definition, the feed auto-updates.

### Two Surfaces, Different Affordances

**Discord webhook** (fire-and-forget notifications):
- Append-only, immutable posts.
- Max 2000 chars; truncate if needed.
- High-signal events only (decisions, status/maturity shifts, high-priority proposals).

**Web dashboard activity panel** (deep inspection):
- Real-time updates; click P### to expand proposal details.
- Filter by proposal, agent, event type.
- Hover to see agent health and lease expiration countdown.
- Collapse multi-event sequences for readability.
- Retains 1000 most recent events.

---

## What I'm Pushing Back On (5-minute read)

See `pm-pushback-notes.md` for the full reasoning, but the key PM decisions are:

1. **Claim events suppressed by default** — not optional. We lose granular claim tracking in Discord (but DB has full history). Trade-off: reduce noise from 26 posts/hr to ~2.
2. **Maturity AND status posts** — not combined into one. Both timelines are important; combining them would hide context.
3. **Routine release events hidden** — only gate decisions post. Releasing after work is expected; the *next* event (status advance) tells the story.
4. **Stage labels from registry** — not hardcoded. This keeps the feed aligned with the canonical workflow definitions and allows DB-driven stage name changes to propagate automatically.

**These are opinions, not requirements.** If the user pushes back, we can adjust:
- Claims always visible (no suppression) → brings volume back to 26/hr, but gets full audit trail in Discord.
- Claims by elevated agents only → compromise; middle ground between "all claims" and "no claims".

---

## Open Questions for You

Before design starts, I need decisions on:

1. **Claim collapsing:** If 3 agents claim the same proposal within 1 minute (rapid handoff), should we show all 3 or just the final one?

2. **Hourly summary posts:** Do you want "10:00 AM — 12 proposals in active work, 3 awaiting gate decision" as a digest, or real-time events only?

3. **Agent role filtering:** Show claims from all agents, or only elevated agents (gate reviewers, architects)?

4. **Tags in posts:** Should P502#urgent include the tags, or just the bare P###?

5. **Gate stall escalation:** If a proposal sits in REVIEW for 24h+ without a decision, who gets @-mentioned? (Defer to v2, or include in v1?)

Answers help us lock down the spec and start design + implementation.

---

## Acceptance Criteria (for Dev + Design)

### Event Rendering

- Every `decision_made` post includes agent name + decision (ADVANCE/HOLD/REJECT) + P### + stage label.
- Every `maturity_changed` post includes old and new maturity values; no-op transitions are rejected.
- Every `status_changed` post includes old and new status values, translated to human-friendly labels.
- All P### references include stage labels derived from the workflow registry.

### Suppression

- `lease_claimed` does not post by default.
- `lease_released` posts only for gate decisions (hold, reject, waive, advance).
- No-op transitions are rejected before posting.

### Data Integrity

- Every post includes `triggered_by` (agent name); no unattributed posts.
- Every post includes a valid P### display_id.
- All timestamps are UTC and consistent with the database.

### Rollout

- Week 1: Internal alpha. Ops team tests on staging. Feedback: "I can see who did what without querying the DB."
- Week 2: Closed beta. Ops refines filters. Discord volume < 5 posts/hr. No missed signals.
- Week 3: GA. Measure feedback over 7 days. Success: zero "who's working on this?" support escalations.

---

## Timeline & Next Steps

| Phase | Owner | Week |
|-------|-------|------|
| User review of spec + decisions | You | This week (04-28 to 05-02) |
| Design review: dashboard activity panel | Design Lead | Week of 05-05 |
| Implementation: Discord listener + web feeder | Dev Lead | Week of 05-12 |
| Alpha test: Ops team on staging | Ops + Dev | Week of 05-19 |
| GA rollout: Production | Dev | Week of 05-26 |

---

## Questions?

- **On the spec:** See `pm-spec.md` sections 4–8 for detailed rules, templates, and edge cases.
- **On the rationale:** See `pm-pushback-notes.md` for why each decision was made and what the trade-offs are.
- **On the implementation:** We'll split into two tracks (Discord listener update + web dashboard build). Design starts post-user-review.

