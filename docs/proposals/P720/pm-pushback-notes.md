# P708 State Feed — PM Pushback & Decisions Log

**For:** Dev lead, Design lead, Ops  
**From:** Product Manager  
**Date:** 2026-04-28

---

## Context

I've written the event taxonomy and filtering rules for the state-feed redesign (see `/tmp/p708-feed/pm-spec.md`). Before we commit to design and implementation, I want to flag the trade-offs and get alignment on some opinionated choices.

---

## Key Decisions & Rationale

### 1. Claim Events Suppressed by Default (Not Optional)

**Decision:** `lease_claimed` events do NOT post to Discord unless:
- Operator opts in via env var, OR
- The proposal is in a gateable stage (high-signal gating activity), OR
- The agent is an elevated role

**Rationale:**
- 632 claims/day ÷ 26 hours = **26 posts/hr** from claims alone. If all other events total ~10/hr, claims are 72% of the volume.
- Most claims are routine: "alice picked up P502, worked on it, released it." This is work happening as expected — not a signal that operators care about in real time.
- Gating activity is different: if a reviewer *claims* a proposal in REVIEW stage, that means the gate review just started — operators care.
- **Trade-off:** we lose a full audit trail in Discord (you'd have to query the DB to see who claimed when). But the DB has full history; Discord is for *signal*, not audit.

**Risk:** operators who *do* care about claim granularity will complain. Mitigation: we ship with the env var opt-in (default false), and if operators request it, we enable it in their deployment.

---

### 2. Maturity vs Status Posts

**Decision:** Both `maturity_changed` and `status_changed` always post; they are NOT deduplicated into a single "transition" post.

**Rationale:**
- A proposal can change maturity without changing status (e.g., maturity: new→active while staying in REVIEW status).
- A proposal can change status without changing maturity (e.g., status: DRAFT→REVIEW while staying maturity: new).
- Operators need to see both timelines. Combining them would hide important context.
- Example: if a proposal moves from new→active AND status changes DRAFT→REVIEW at the same time, we post two separate events. This is clearer than a combined "status advance + maturity shift" line.

**Trade-off:** 2 posts instead of 1. Acceptable, since these are not the primary volume driver (only ~30 maturity + ~20 status/day).

---

### 3. Stage Label Derivation: Registry vs Hardcode

**Decision:** All stage labels are resolved via `StateNamesRegistry.getView(proposal.type)`, NOT hardcoded.

**Rationale:**
- AgentHive supports multiple workflow types (RFC, Hotfix, potentially others in future).
- The canonical state names live in `roadmap.workflow_templates` SMDL definitions, not in the feed code.
- If a stage name changes in the DB (e.g., REVIEW → REVIEWER_GATE for clarity), the feed automatically uses the new name. Zero code change.
- This is how the rest of the codebase already works (see `state-names.ts`); we're being consistent.

**Trade-off:** the listener now has a hard dependency on `StateNamesRegistry` being loaded. If the registry fails to load, the listener can fall back to numeric stage IDs (e.g., "P502|status=2"), but posts won't be as legible.

---

### 4. Suppressing Routine Lease Releases

**Decision:** Only post `lease_released` events if the reason is one of: `gate_review_complete`, `gate_hold`, `gate_reject`, `gate_waive`.

**Suppressed reasons:** `work_delivered`, `lease_expired`, `gap_resolved`, etc.

**Rationale:**
- An agent releasing a proposal after delivering work is expected behavior — not a signal. The *next* event (maturity shift, status advance) tells the real story.
- If a lease expires (timeout), that's a system failure worth logging, but not an operator-facing event unless it becomes a chronic problem.
- Gate decisions are high-signal: "bob decided to HOLD" is critical info. The release is just the mechanism.

**Trade-off:** we hide some audit detail from Discord. Again: full audit is in the DB.

---

### 5. Gate Stall Detection (Post-Launch Feature)

**Decision:** Defer to v2. If a proposal sits in a gateable stage >24h without a decision, we'll post an alert. But this requires a scheduled job (cron or cadence job), not just event-driven listening.

**Rationale:**
- This is a behavioral rule (stalled gates = bad), not an event-driven fact. We need a background job to check for stalls.
- Adding it to v1 adds complexity. Ship the event-driven feed first, measure, then add stall detection if operators ask for it.

**Owner:** post-launch proposal, likely P708.2 or similar.

---

## Decisions Pending User Input

The spec has these as open questions (section 10 of pm-spec). I need answers before design starts:

1. **Claim dedup window:** Should we collapse multiple claims on the same proposal within 1 minute? Or keep them all visible?
   - Claim collapsing = simpler feed, better for noisy proposals with multiple hands-off.
   - Keeping all claims = better audit trail, but potentially 5 claims on one proposal in a 2-minute window looks chaotic.

2. **Hourly summary posts:** Yes or no?
   - Yes = operators get a digest ("12 active, 3 waiting for gate"); helps with FOMO and situational awareness.
   - No = real-time only; cleaner feed, but requires operators to scroll to understand the state of all proposals.

3. **Agent role filtering:** Should we *only* post claims from elevated agents (gate reviewers, architects)?
   - Yes = dramatic volume reduction, only high-signal claims posted.
   - No = all agents visible, full transparency, but more noise from junior dev handoffs.

4. **Proposal tags in posts:** Should P### include tags (e.g., `P502#urgent`)?
   - Yes = operators see priority at a glance.
   - No = cleaner posts, operators click through if they need details.

5. **Escalation targets for gate stalls:** If a proposal stalls in REVIEW for 24h, who gets @-mentioned?
   - By default, I'd suggest @here or @ops-team, but depends on your org structure. What's your preference?

---

## What I'm Confident About

- **Event taxonomy is sound.** The templates capture WHO, WHAT, WHICH, and WHY in a consistent format.
- **Filtering rules reduce noise without losing signal.** We're suppressing expected routine events (claims, routine releases) while keeping high-signal ones (decisions, maturity shifts, gate holds).
- **Stage label derivation is the right approach.** This keeps the feed aligned with the canonical workflow definitions.
- **Discord + Web Dashboard surfaces are complementary.** Discord is for notifications; the web dashboard is for deep inspection and context.

---

## What Needs User Validation

1. **Do operators actually find claims informative?** Or is the bulk of the value in decisions + status/maturity changes?
   - If claims are useless, we suppress them entirely (no opt-in, delete the feature).
   - If claims are valuable, we keep the opt-in and consider making them default on for high-signal stages.

2. **Is 24h the right stall threshold?** Could be 6h (urgent), 12h (standard), or 48h (relaxed). Depends on your SLA for gate decisions.

3. **Is the 5-minute dedup window too aggressive?** Could cause actual parallel work to be hidden. Maybe 10s is safer.

---

## Next Steps

1. **User review** (this week): Confirm the 5 pending questions above.
2. **Design review** (next week): UI Designer builds the dashboard activity panel; Ops picks Discord color scheme / emoji theme.
3. **Implementation** (week after): Dev splits into two tracks:
   - Track A: Update `scripts/state-feed-listener.ts` to use new filtering logic.
   - Track B: Build the web dashboard activity panel + WebSocket feeder.
4. **Alpha test** (week 4): Ops team uses the feed on a staging environment; collect feedback on noise/signal ratio.
5. **GA** (week 5): Deploy to production; measure metrics (volume, feedback) over 7 days.

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Operators hate suppressed claims | Medium | Medium | We kept the opt-in flag; can flip it on if needed. Also, alpha test should surface this early. |
| Stage names don't resolve (registry load fails) | Low | High | Fallback to numeric stage IDs (P502\|status=2). Document in runbook. |
| Volume is still too high | Medium | Low | We can add a "top N events per hour" rate limit without losing functionality. |
| Dedup window is too aggressive (real parallel work hidden) | Low | Medium | Alpha test will show if proposals with multiple simultaneous claims get confusing. Adjust window if needed. |

---

## Success Look-Like

- Operators report: "I can see who's working on what and why they stopped without querying the DB."
- Discord feed is legible: 3–5 posts/hr on average, each one actionable.
- Web dashboard activity panel feels responsive and useful (operators use it to track proposals, not just the board).
- Zero "who's working on this?" support escalations.

