# PM Spec: State Feed Redesign (P708)

**Status**: Draft  
**Author**: Product Manager  
**Date**: 2026-04-28  
**Version**: 1.0

---

## 1. Problem Statement

The current state-feed implementation (Discord webhook + web dashboard) serves two surfaces but leaves operators without actionable visibility into what agents are doing to proposals in real time.

**Current UX:**

```
⏫ P705 maturity: ? → active
Operator visibility surface for P674/P675/P689 outputs (web dashboard)
→ Under active lease — agent is iterating on this
```

**Problems:**
- The `?` indicates missing state context — the event payload doesn't include `old_maturity`, so the transition is opaque.
- No agent attribution — "who is doing this?" is invisible.
- No stage label — operators don't know if this is a hotfix (`TRIAGE→FIX`) or RFC (`DRAFT→REVIEW`).
- Volume is high (632 lease_claimed events/day ≈ 26/hr) but most are noise — claiming a proposal is routine work that spams Discord without signal.
- The two surfaces (Discord + dashboard) render identical events but have different affordances — Discord can't show transient state or edit messages; the web can.

**Evidence of impact:**
- Operators report the feed is "not very informative" — they can't determine *who* made a change or *why* without manually querying the DB.
- Support/ops tickets referencing proposal state land with missing context ("it says active but I don't know which agent is working on it").
- No structured noise-filtering: every event posts, creating alert fatigue and making the feed feel like spam rather than a signal channel.

---

## 2. Goals & Success Metrics

| Goal | Metric | Current Baseline | Target | Measurement Window |
|------|--------|-----------------|--------|-------------------|
| Increase feed legibility | Operators can name the agent + stage label from a single Discord post | N/A | 100% of posts | 7 days post-launch |
| Reduce volume without losing signal | Claim/release events suppressed by default (opt-in) while decision/maturity posts remain | ~26 claims/hr | <5 visible posts/hr | 7 days post-launch |
| Enable story detection | A sequence of events on one proposal renders as a coherent narrative, not separate lines | 0 (no grouping) | ≥80% of multi-event sequences within 5min window | 14 days post-launch |
| Zero data loss | All event types captured in the database; no post is unattributed | 100% (already DB-backed) | 100% | Ongoing |

---

## 3. Non-Goals

- **Mobile-optimized Discord rendering.** Posts are for desktop. If mobile UX suffers, escalate as a separate design task.
- **Reordering or filtering events retroactively.** The feed is append-only. Past posts stand as-is.
- **Real-time agent location tracking.** We expose *what* the agent did, not *where* the agent is running.
- **Custom notifications per proposal type or tag.** Use Discord webhook filtering if needed; this spec focuses on the feed structure itself.
- **Support for multi-tenant display.** Today AgentHive is single-tenant (`agenthive` DB). When multi-tenant ships, a follow-up proposal will handle cross-project visibility.

---

## 4. Event Taxonomy & Display Rules

Every event_type renders with a **canonical user-facing template**. The template includes:
- **Agent attribution** (who) — always required; if missing, fall back to "system"
- **Action verb** (did what) — event-specific; shows intent, not just state
- **Proposal reference** (to which) — always P###|STAGE (stage label derived from proposal.type, not hardcoded)
- **Context** (why/implication) — optional; included only if it adds signal

### Event Type Templates

#### `lease_claimed`
**Suppressed by default; opt-in visibility.**

**Template:**  
`agent **{agent_name}** claimed **P{display_id}|{stage_label}** to {role}`

**Renders as:**
```
agent alice claimed P502|REVIEW to review and enhance
agent bob claimed P703|DEVELOP to implement
```

**Rules:**
- `{role}` comes from the lease record's `claimed_for` field (or fallback: infer from current status + maturity).
- If multiple claims on the same proposal within 30s (transfer or parallel claim), show only the final one.
- **Suppression logic:** only post if:
  - The operator has opted into `AGENTHIVE_FEED_SHOW_CLAIMS=true` env var, OR
  - The proposal is in REVIEW stage and gateable (gating review is high-signal), OR
  - The agent is an elevated role (e.g., "senior-reviewer", "architect").

#### `lease_released`
**Suppressed by default; opt-in visibility.** Show only on `gate_review_complete`, `gate_hold`, or `gate_reject`.

**Template:**  
`agent **{agent_name}** released **P{display_id}|{stage_label}** — {reason_label}`

**Renders as:**
```
agent alice released P502|REVIEW — gate review complete ✓
agent bob released P703|DEVELOP — gate hold (blocked by P704)
agent charlie released P601|REVIEW — gate reject: needs design revision
```

**Rules:**
- `{reason_label}` maps from `release_reason` enum:
  - `gate_review_complete` → "gate review complete ✓"
  - `gate_hold` → "gate hold (waiting for...)" — append the first 40 chars of `rationale` if present
  - `gate_reject` → "gate reject: {first 60 chars of rationale}"
  - `work_delivered` → "work delivered"
  - `lease_expired` → "lease expired (timeout)"
  - Other reasons → show as-is, capitalized
- **Suppression logic:** only post if `release_reason` is one of: `gate_review_complete`, `gate_hold`, `gate_reject`, `gate_waive`. Suppress routine releases (`work_delivered`, `lease_expired`).

#### `maturity_changed`
**Always posted. High-signal.**

**Template:**  
`maturity shift on **P{display_id}|{stage_label}**: {old_maturity} → **{new_maturity}**`

**Renders as:**
```
maturity shift on P502|REVIEW: new → active
maturity shift on P703|DEVELOP: active → mature — ready for merge decision
```

**Rules:**
- Reject no-op transitions (new→new, active→active, etc.); do not post.
- Include an implication line if transitioning TO `mature` (e.g., "ready for merge decision").
- Always include the proposal title as a second line (clickable link in Discord).

#### `status_changed`
**Always posted. Medium-signal.**

**Template:**  
`status advance on **P{display_id}|{stage_label}**: {old_status} → **{new_status}**`

**Renders as:**
```
status advance on P502|REVIEW: reviewing → approved for develop
status advance on P703|DEVELOP: developing → merge-ready
```

**Rules:**
- Translate status to human-friendly labels (e.g., `REVIEW` → "reviewing", `DEVELOP` → "developing").
- The `{stage_label}` is the RFC or Hotfix stage *after* the transition (e.g., if moving to DEVELOP, the label is DEVELOP).
- Include the standard implication for the destination stage (from the existing state-feed code's STATE_IMPLICATIONS map).

#### `decision_made`
**Always posted. Highest signal.**

**Template:**  
`agent **{agent_name}** decided **{decision}** on **P{display_id}|{stage_label}**`

**Renders as:**
```
agent alice decided ADVANCE on P502|REVIEW — approved for development
agent bob decided HOLD on P703|DEVELOP — requires design spike first
agent charlie decided REJECT on P601|REVIEW — out of scope for Q2
```

**Rules:**
- `{decision}` enum: `ADVANCE`, `HOLD`, `REJECT`, `WAIVE`.
- Always include a brief reason (first 80 chars of `gate_decision_log.rationale` if present).
- High visual emphasis (bold agent name + decision).

#### `proposal_created`
**Posted for high-priority proposals only (tags include "urgent" or "blocker"); suppress otherwise.**

**Template:**  
`new proposal filed: **P{display_id}** — {title}`

**Renders as:**
```
new proposal filed: P710 — Rebuild state-feed for real-time ops visibility
```

**Rules:**
- Include the creator's name if available (`created_by` audit field).
- Omit if the proposal is created in DRAFT with no tags (routine background work).

#### `review_submitted`
**Suppressed by default unless it's a gate-decision review (not a discussion thread).**

**Template:**  
`review posted on **P{display_id}|{stage_label}** by **{reviewer_name}**: {first 100 chars of content}`

**Renders as:**
```
review posted on P502|REVIEW by alice: "Needs clarification on the dependency model. See AC #3."
```

**Rules:**
- Gate-decision reviews (from `roadmap.gate_decision_log`) always post.
- Inline discussion comments: suppressed (too noisy).
- If the review is a rejection or blocker, include a "⚠️ BLOCKER" prefix.

---

## 5. Stage Label Rules (RFC vs Hotfix)

The label **{stage_label}** in all templates must reflect the proposal's type, NOT a hardcoded string.

**RFC proposals** (type in ["Standard RFC", "Enhancement RFC", ...]):  
→ Display current status as the stage: DRAFT | REVIEW | DEVELOP | MERGE | COMPLETE

**Hotfix proposals** (type = "Hotfix"):  
→ Display current status as: TRIAGE | FIX | DEPLOYED

**Lookup:**
- Query `roadmap.proposal.type` and resolve via `StateNamesRegistry.getView(proposal.type)`.
- Always use the DB-sourced workflow definition; never hardcode stage names.

**If type is unknown or missing:**  
→ Fall back to the numeric `status` column (e.g., "P502|status=2").

---

## 6. Volume & Noise Rules

### Claim/Release Filtering

- **`lease_claimed` events**: Suppressed by default. Operators opt in via `AGENTHIVE_FEED_SHOW_CLAIMS=true` OR the proposal enters a high-signal gate stage.
- **`lease_released` events**: Suppressed unless `release_reason` is one of: `gate_review_complete`, `gate_hold`, `gate_reject`, `gate_waive`.

### Maturity & Status Transitions

- **`maturity_changed` no-op:** Reject `old_maturity == new_maturity`. Do not emit.
- **`status_changed` no-op:** Reject `old_status == new_status`. Do not emit.

### Event Deduplication & Grouping

Within a **5-minute window** on the same proposal:
- If two `maturity_changed` events arrive (e.g., new→active, then active→mature), emit both (not a duplicate).
- If `lease_claimed` + `maturity_changed` arrive, emit only the maturity event (the lease is context, not signal).
- If multiple agents claim the same proposal in parallel, emit only the final claim and suppress the others (report a race condition in logs).

### Summary & High-Level Posts

Optional, post-launch enhancement:
- Once per hour, post a summary: "**Proposal Activity Summary** — 12 proposals in active development, 3 awaiting gate decision, 2 blocked on dependencies."
- This reduces FOMO and gives operators a checkpoint without scrolling 60+ claim posts.

---

## 7. Surface A vs Surface B — Discord vs Web Dashboard

### Identical Rendering

Both surfaces display the **canonical event templates** (section 4). The message content is identical:

```
maturity shift on P502|REVIEW: new → active
Operator visibility surface...
```

### Intentional Differences

**Discord webhook:**
- Append-only, immutable posts (cannot edit retroactively).
- No formatting beyond markdown (bold, code, spoiler).
- Max 2000 char content; truncate if needed.
- Timestamps are implicit (Discord shows "2 hours ago").

**Web dashboard activity panel:**
- Posts are interactive: click P### to expand proposal details, click agent name to see agent health/recent work.
- Real-time updates: new events appear without refresh.
- Filter by proposal, agent, event type (dropdown or sidebar).
- Transient states visible: hover over an agent's name to see their current task, lease expiration countdown.
- Collapse/expand multi-event sequences (e.g., "5 events on P502 in the last 10min").
- Retains 1000 most recent events (Discord webhook is fire-and-forget).

---

## 8. Edge Cases & Terminal States

### Proposal in Terminal State (COMPLETE, DEPLOYED, REJECTED, DISCARDED)

- **Status quo:** once terminal, the proposal's state is immutable. Any post-terminal events are treated as audit trails, not actionable signals.
- **Feed rule:** if a proposal enters a terminal state, post ONE summary line (e.g., "P502 shipped — approved via gate review on 2026-04-28").
- **Lease on terminal proposal:** if an agent is released from a terminal proposal, suppress the release post (it's expected; no signal).

### Gate Timeout Without Decision

If a proposal sits in a gateable stage for >N hours (configurable, default 24h) without a decision, emit a "gate stalled" post:

```
⏳ ALERT: P502|REVIEW has been awaiting decision for 24+ hours
```

Owner: the gate job (cron or scheduled task); include in escalation matrix.

### Parallel Claims (Race Condition)

If two agents claim the same proposal simultaneously (within 2s):
- Post the final claim winner (timestamp tiebreaker: latest wins).
- Log a warning: `[state-feed] Race detected on P###; agents {a1} and {a2} both claimed within 2s`.
- Do not post both claims to Discord (confusing).

### Lease Expiry Without Release Reason

If a lease expires (deadline passes) but no explicit `lease_released` event is logged:
- The state-feed job detects stale leases (via a query on `agent_run.lease_expires_at`).
- Emit a "lease expired" post (lower priority; tag as `[EXPIRY]`).

### Agent Offline or Agent Run Failed

If an agent_run record has `status='failed'` but no corresponding decision or release:
- Post a "work incomplete" alert: `⚠️ agent alice's work on P502 failed — see agent_run logs`.
- Include a link to the agent run dashboard or logs.

---

## 9. Acceptance Criteria

### Event Rendering

- [ ] Every `lease_claimed` post includes agent name + proposal P### + stage label (RFC or Hotfix).
- [ ] Every `maturity_changed` post includes old and new values; no-op transitions are rejected before posting.
- [ ] Every `decision_made` post includes agent name, decision (ADVANCE/HOLD/REJECT), and proposal reference.
- [ ] Every `status_changed` post includes old and new status values, translated to human-friendly labels.
- [ ] Stage labels are derived from `StateNamesRegistry.getView(proposal.type)`, not hardcoded.

### Suppression & Filtering

- [ ] `lease_claimed` events do not post to Discord by default unless opted in or the proposal is in a gateable stage.
- [ ] `lease_released` events post only if `release_reason` is in the high-signal set (gate decisions, holds, rejects).
- [ ] No-op maturity or status transitions are rejected in the query or listener (do not reach POST).
- [ ] Consecutive claims on the same proposal within 30s show only the final claim.

### Data Integrity

- [ ] Every event payload includes `triggered_by` (agent name or "system"); no posts are attributed to unknown agents.
- [ ] No proposal event posts without a valid P### display_id.
- [ ] All timestamps are in UTC and consistent with DB timestamps.

### Web Dashboard

- [ ] Activity panel renders 1000 most recent events without pagination lag.
- [ ] Click on P### in an event expands the proposal modal.
- [ ] Filter dropdown works for event type (lease/maturity/status/decision/review).
- [ ] Collapse/expand control works for multi-event sequences.

### Discord Integration

- [ ] Posts respect 2000-char limit; longer messages are truncated with "..." + a link to the web dashboard for full text.
- [ ] Posts include a clickable P### link (Discord will unfurl to proposal details if the dashboard has OpenGraph tags).
- [ ] High-priority events (decision_made) use visual emphasis (emoji prefix, bold).

---

## 10. Open Questions for the User

1. **Claim volume threshold:** Should we automatically suppress claims if >5 claims on the same proposal arrive in a 1-minute window (e.g., in a rapid team handoff)? Or keep all claims visible as a transfer audit trail?

2. **Hourly summary posts:** Do you want a "10:00 AM — X proposals in active work, Y gates pending" summary post hourly, or is real-time event-only sufficient?

3. **Agent role filtering:** Should we post all claims, or only claims from elevated roles (e.g., gate reviewers, architects)? This could reduce noise while keeping high-signal work visible.

4. **Post ephemeral vs persistent:** Discord's ephemeral messages disappear after a few minutes. Should gate alerts or timeouts use ephemeral posts (cleanup) or persistent (audit trail)?

5. **Proposal tags in the feed:** Should we include tags (e.g., `#urgent`, `#blocker`) in event posts so operators can glance at priority? Requires including tags in the event payload.

6. **Alert escalation on stalls:** If a proposal sits in REVIEW for >24h awaiting decision, who should we @-mention? The gate owner? The ops channel?

---

## 11. Implementation Notes for Dev/Design

### Database Queries

The listener should query:
- `roadmap.proposal_event` (indexed by `created_at DESC`, `event_type`) — source of truth for all events.
- `roadmap.proposal` (join on `id`) — get display_id, type (for stage lookup), title.
- `roadmap.proposal_lifecycle_event` (optional, if using for lifecycle-specific context) — get from/to state, triggered_by, context.
- `roadmap_proposal.proposal_lifecycle_event` or equivalent — if a separate maturity audit table exists.
- `roadmap.workflow_templates` (via StateNamesRegistry) — resolve stage names.

### Event Listener Architecture

Two separate listeners:
1. **Discord webhook poster** (`scripts/state-feed-listener.ts`): filters + renders + POSTs.
2. **Web dashboard feeder** (new; TBD location): same filtering + rendering, but writes to a temporary event buffer or pub/sub for WebSocket delivery to the dashboard.

Both share the filtering/rendering logic (extract to a `StateEventRenderer` util class).

### Configuration

Add to `roadmap.yaml` or `.env`:
```yaml
state_feed:
  show_claims: false  # opt-in
  show_releases: true  # gate decisions always
  debounce_claims_ms: 30000  # 30s window for dedup
  hourly_summary: true  # enable summary posts
```

---

## 12. Success Criteria — Rollout Plan

| Phase | Date | Audience | Success Gate |
|-------|------|----------|-------------|
| Internal alpha | Week of [TBD] | Ops team + 1 PM | "I can see who did what to which proposal" without querying the DB |
| Closed beta | Week of [TBD] | Ops team | Discord posts are legible; <5 visible posts/hr; no missed signals |
| GA rollout | Week of [TBD] | All teams | Feedback: feed is informative, not noisy; <2 support escalations about "who's working on this" |

---

## 13. Appendix: Event Payload Schema (Reference)

**Proposed structure for new `proposal_event` records** (if not already defined):

```json
{
  "id": 12345,
  "proposal_id": 502,
  "event_type": "maturity_changed",
  "triggered_by": "alice",
  "triggered_by_type": "agent",
  "old_maturity": "new",
  "new_maturity": "active",
  "payload": {
    "context": "claimed by alice"
  },
  "created_at": "2026-04-28T14:32:00Z"
}
```

**For `lease_claimed`:**
```json
{
  "event_type": "lease_claimed",
  "triggered_by": "alice",
  "payload": {
    "claimed_for": "review and enhance",
    "lease_expires_at": "2026-04-29T14:32:00Z"
  }
}
```

**For `decision_made`:**
```json
{
  "event_type": "decision_made",
  "triggered_by": "bob",
  "payload": {
    "decision": "ADVANCE",
    "rationale": "All AC met, design approved. Ready for development."
  }
}
```
