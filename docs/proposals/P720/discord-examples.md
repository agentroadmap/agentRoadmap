# Discord Event Format — Rendered Examples

This file shows exact Discord Markdown strings for each event type, rendered as they appear in chat.

---

## Single Events (Line-by-line)

### proposal_created

```
📝 jane-smith created P710 | **RFC Draft**
→ Proposal: Timeline review & reconciliation
```

**HTML render:**
```
📝 jane-smith created P710 | RFC Draft (in bold)
→ Proposal: Timeline review & reconciliation
```

### lease_claimed

```
🔒 codex-two claimed P674 | **REVIEW** (enhance)
→ Expected duration: 2–3 days. [View in Dashboard]
```

**Notes:**
- Short form: `🔒 agent claimed P###|STAGE (role)`
- Omit duration for most leases; include if explicitly logged
- Dashboard link is optional (convenience)

### lease_released (normal completion)

```
🔓 codex-two released P674 | REVIEW
→ Work completed. [View maturity update in Dashboard]
```

### lease_released (timeout — operator alert)

```
⏱️ ⚠️ LEASE TIMEOUT: codex-two held P674 | REVIEW for 6h30m
→ May need escalation. Releasing to operator queue. [View in Dashboard]
```

**Severity:** Notable (amber), stands out in feed

### lease_released (proposal rejected during lease)

```
❌ codex-two released P674 | REVIEW
→ Reason: Proposal rejected by gating agent (incoherent scope). Status: obsolete.
```

**Severity:** Critical (red), signals scope killed

### status_changed (stage progression — common case)

```
🚀 P705 advanced | **REVIEW → DEVELOP**
→ Gating approved. Ready for development. [View in Dashboard]
```

**Note:** This event is usually paired with `decision_made`. May collapse if both fire within 10s.

### status_changed (completion — critical milestone)

```
🏁 P673 completed | **DEVELOP → COMPLETE**
→ Feature delivered and stable. [View completion details]
```

**Severity:** Critical (green), high visibility

### maturity_changed (→active)

```
⚡ codex-two marked P705 | REVIEW as **ACTIVE**
→ Under lease; agent iterating. [View in Dashboard]
```

**Severity:** Info (purple), routine progression within lease

### maturity_changed (→mature — gate signal)

```
✅ codex-two marked P675 | **DEVELOP** as **MATURE**
→ Ready for gating review. [View in Dashboard]
```

**Severity:** Notable (green), signals review gate should fire

### maturity_changed (→obsolete — scope killed)

```
⚠️ skeptic-alpha marked P612 | DRAFT as **OBSOLETE**
→ Reason: Duplicate of P464. Merging scope into primary proposal.
```

**Severity:** Notable (amber), timeline impact

### decision_made (advance — gate approval)

```
✔️ **skeptic-alpha APPROVED** P705 | **REVIEW → DEVELOP**
→ Gating notes: AC met. No architectural blockers. Ready to build.
   [View gating decision details]
```

**Severity:** Critical (green), high visibility

### decision_made (hold — waiting signal)

```
⏸️ **skeptic-alpha PUT ON HOLD** P711 | **DRAFT**
→ Reason: Awaiting dependency P710 to reach mature.
   Estimated unblock: end of day. [View in Dashboard]
```

**Severity:** Critical (amber), requires communication

### decision_made (reject — scope killed)

```
🚫 **skeptic-alpha REJECTED** P612 | **DRAFT**
→ Reason: Duplicate of P464 (resource allocation). Merge scope into primary.
   Marked: OBSOLETE. [View gating decision + discussion]
```

**Severity:** Critical (red), timeline impact + action required

### review_submitted

```
💬 jane-smith submitted review on P674 | REVIEW
→ Feedback: 3 items (2 blocking, 1 optional). [View review comments]
```

**Severity:** Info (gray), part of review cycle

---

## Batched Events (Efficiency at Scale)

### Lease claims batch (same agent, 30s window)

**Render:**
```
🔒 codex-two claimed 3 proposals | REVIEW / DEVELOP / DRAFT

    • P674 | REVIEW (enhance)
    • P675 | DEVELOP (review gating)
    • P710 | DRAFT (POC feedback)

[View all in Dashboard]
```

### Maturity + Gate decision (same proposal, 10s window)

**Render:**
```
✅ P675 | DEVELOP → MATURE (2m ago) + ✔️ Gate approved → MERGE (1m ago)

codex-two marked mature; skeptic-alpha approved.
Ready to merge. [View in Dashboard]
```

### Activity spike batch (4+ events in 2 min)

**Render:**
```
⚡ **Morning Activity Spike** (8:42–8:44 AM)

6 events:
  🔒 3 lease claims (codex-two, worker-15097, claude-joe)
  ✅ 2 maturity transitions (→MATURE)
  📝 1 new proposal (jane-smith)

[View full timeline in Dashboard]
```

**Notes:**
- Header shows time window
- Summary counts by event type
- Click expands to full individual timeline

---

## Overflow & Pagination Strategy

**When to batch:**
- Single event: send immediately
- 2–3 related events (same agent, same proposal, ≤30s): batch in single message
- 4+ events in 5 min window: summary header with expandable detail link
- ≥10 events in 10 min: summary header only, link to full feed

**Discord message character budget:**
- Hard limit: 4000 chars
- Soft limit: ~2000 chars (readability on mobile)
- Strategy: if batched message exceeds 2000, send summary header + link to dashboard

---

## Design Notes for Implementation

### Discord Webhook Payload

```json
{
  "content": "📝 jane-smith created P710 | **RFC Draft**\n→ Proposal: Timeline review & reconciliation",
  "username": "AgentHive Activity Feed",
  "avatar_url": "https://example.com/logo.png"
}
```

**Notes:**
- Avoid Discord embeds (see main design doc for rationale)
- Use markdown: `**bold**`, `_italic_`, `` `code` ``
- Max 1 content field (no separate title/description)
- Webhook user identity is fixed; cannot use per-agent avatars (Discord API limit)

### Link Format

**Dashboard proposal detail:**
```markdown
[View in Dashboard](https://dashboard.agenthive.local/proposals/P705)
```

**Event detail (if history page exists):**
```markdown
[View gating decision details](https://dashboard.agenthive.local/proposals/P705#gate-decision-2026-04-28)
```

### Time Formatting

- ≤15 min: `Xm ago` (e.g. `6m ago`)
- 15–60 min: `Xm ago` (e.g. `42m ago`)
- 1–24 hours: `X:XXam/pm` (e.g. `8:42 AM`)
- ≥24 hours: Don't show in live feed; archive to history

**No "ago" suffix for timestamps older than 1 hour** — prevents visual clutter:
```
Recent (use "ago"):    🔒 6m ago, ✅ 2m ago, 📝 30s ago
Older (use time):      🏁 8:42 AM, ✔️ 3:15 PM, 📝 Yesterday
```

---

## Color Codes for Embed Sidebar (if adopted in future)

**Not currently used** (plain text only), but provided for future embed migration:

| Severity | Color | Hex | Example |
|----------|-------|-----|---------|
| Critical | Red | `#EF4444` | Rejections, completions, approvals |
| Notable | Amber | `#F59E0B` | Holds, timeouts, obsolete |
| Info | Purple | `#8B5CF6` | Leases, maturity changes (non-mature) |
| Info (light) | Blue | `#3B82F6` | New proposals |

---

## Examples in Context — Full Discord Channel Simulation

```
[8:42:15 AM] 📝 jane-smith created P710 | **RFC Draft**
            → Proposal: Timeline review & reconciliation

[8:42:47 AM] 🔒 codex-two claimed 3 proposals | REVIEW / DEVELOP / DRAFT
            
            • P674 | REVIEW (enhance)
            • P675 | DEVELOP (review gating)
            • P710 | DRAFT (POC feedback)
            
            [View all in Dashboard]

[8:44:33 AM] ✅ P675 | DEVELOP → MATURE (2m ago)
            
            codex-two marked mature; ready for gating review.
            [View in Dashboard]

[8:45:12 AM] ✔️ **skeptic-alpha APPROVED** P705 | **REVIEW → DEVELOP**
            → Gating notes: AC met. No architectural blockers. Ready to build.
            [View gating decision details]

[8:47:29 AM] ⏱️ ⚠️ LEASE TIMEOUT: codex-two held P674 | REVIEW for 2h15m
            → May need escalation. Releasing to operator queue. [View in Dashboard]

[8:50:01 AM] 💬 jane-smith submitted review on P720 | DRAFT
            → Feedback: 3 items (2 blocking, 1 optional). [View review comments]

[9:05:14 AM] ⚡ **Activity Spike** (9:00–9:05 AM)
            
            7 events:
              🔒 4 lease claims
              ✅ 2 maturity updates (→MATURE)
              📝 1 new proposal
            
            [View full timeline in Dashboard]
```

---

**Prepared by:** UI Designer  
**Reference:** `/tmp/p708-feed/ui-design.md` (main design document)  
**Status:** Examples ready for dev + QA
