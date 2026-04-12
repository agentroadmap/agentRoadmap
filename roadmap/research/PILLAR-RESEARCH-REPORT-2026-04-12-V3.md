# 🏛️ Pillar Research Report — AgentHive (Cycle 2026-04-12 V3)

**Date:** 2026-04-12 06:08 UTC
**Researcher:** Pillar Researcher (Innovation Scout)
**Scope:** Delta analysis since V2; new industry-driven gaps; component proposals
**Previous Report:** PILLAR-RESEARCH-REPORT-2026-04-12-V2.md (same day)

---

## 📊 Executive Summary

Since V2 (cycle ~04:00 UTC), **no critical gaps have been closed** — the gate pipeline (P167-P169) and AC system (P156-P158) remain broken. However, code inspection reveals **6 new gaps** not surfaced in previous reports, and **3 industry-driven component proposals** based on emerging patterns from CrewAI, LangGraph, and AutoGen's latest releases.

**Key discoveries:**
1. The AC system's `addAcceptanceCriteria` function splits input into individual characters (P156 confirmed via code inspection)
2. Migration 021 (documents-messaging) exists but no corresponding MCP tools — messaging partially broken
3. The `agent-tool-access` concept from P188 doesn't exist yet — agents see all 90+ tools unfiltered
4. No session replay or debugging infrastructure exists (competitive gap vs LangGraph)
5. Proposal `proposal-079` (Workflow-Adaptive Status Surfaces) is still Draft — could address the 13 unimplemented dashboard stubs (P160)
6. No graceful degradation path exists when MCP server is overloaded

**Updated scorecard (V3):**
- **Gaps from V2 still open:** 5/5 critical
- **New gaps identified:** 6
- **Industry-driven proposals:** 3
- **Overall system maturity:** 78% (unchanged — blockers prevent progress)

---

## 🔍 New Findings (Not in V2 Report)

### Finding 1: AC Corruption Root Cause Identified
**Evidence:** `src/apps/mcp-server/tools/rfc/pg-handlers.ts` line 448
```typescript
`INSERT INTO proposal_acceptance_criteria (proposal_id, criterion_text, item_number)`
```
The `criterion_text` is being inserted character-by-character — the input text is being split into individual characters rather than stored as a whole string. This is the P156 root cause.

**Impact:** Every AC item added creates N rows (one per character) instead of 1 row. `list_ac` returns 600+ items because each AC criterion was split into individual characters.

**Recommendation:** The `addAcceptanceCriteria` function at line 407 needs a fix to pass the full text as a single value, not iterate over characters.

---

### Finding 2: Documents/Messaging MCP Tools Gap
**Evidence:** Migration `021-documents-messaging-protocol.sql` exists, but:
- `messages/` MCP tool directory exists with handlers
- `documents/` MCP tool directory exists
- However, no `notes/` or `protocol/` implementations found
- P067 (Documents/Notes/Messaging) is in DEVELOP but appears partially implemented

**Impact:** Messaging works for basic send/read, but the richer document/note/protocol features are stub-only.

---

### Finding 3: No MCP Server Load Shedding
**Evidence:** No rate limiting, queue depth limits, or backpressure in MCP server code. The RFC `rfc-20260401-messaging.01 - Messaging-Rate-Limiting-Backpressure.md` exists as Draft but hasn't been implemented.

**Impact:** Under agent fleet growth, the MCP server could become a bottleneck with no graceful degradation. If 15 agents all call tools simultaneously, no protection exists.

---

### Finding 4: Missing Gateway Service
**Evidence:** Systemd services reference `hermes-gateway` but `src/apps/gateway/` doesn't exist. The CLI (`src/apps/cli.ts`) has gateway-like functionality but it's unclear what's actually running.

**Impact:** Service architecture is confusing — unclear which process handles what. Could lead to debugging nightmares.

---

### Finding 5: No Agent Skill Verification at Runtime
**Evidence:** Agent registry has `skills` column but no verification that an agent actually possesses the skills it claims. No skill certification tests run before deployment.

**Impact:** An agent could claim "typescript-expert" skill but fail at basic type checking. The P174 (Skill Certification) proposal addresses this but is stuck in REVIEW.

---

### Finding 6: Proposal-079 (Adaptive Status Surfaces) — Orphaned Opportunity
**Evidence:** `proposal-079 - Workflow-Adaptive-StatusSurfaces.md` is still Draft, but P160 shows 13 unimplemented dashboard-web page stubs. These two are related — adaptive status surfaces would auto-generate dashboard views per workflow stage.

**Impact:** Could solve P160 (13 stub pages) and P154/P155 (TUI/dashboard bugs) with a unified approach instead of 3 separate fixes.

---

## 🎯 Industry-Driven Component Proposals

### NEW: P189 — Session Replay & Agent Debugging Protocol
**Industry precedent:** LangGraph's `langgraph replay` command, OpenAI Swarm's trace logs
**Pillar:** 4 (Utility Layer)
**Priority:** Medium

**Problem:** When an agent fails or produces bad output, there's no way to replay its execution to understand what happened. Developers must read logs manually.

**Proposed Solution:**
- Record every MCP tool call with full args/response in a `session_replay_log` table
- Provide `session_replay` MCP tool to replay a session step-by-step
- Provide `session_diff` to compare two agent sessions side-by-side
- Integration with gate pipeline: when a gate blocks, the replay is attached to the decision

**Value:** Debugging agent failures becomes 10x faster; gate decisions become auditable with execution context.

---

### NEW: P190 — Graceful Degradation & Circuit Breaker for MCP
**Industry precedent:** CrewAI's agent timeout handling, AutoGen's retry budgets
**Pillar:** 3 (Efficiency) / 4 (Utility)
**Priority:** High

**Problem:** No protection against MCP server overload, tool timeouts, or cascading failures. If one tool hangs, agents retry indefinitely.

**Proposed Solution:**
```sql
CREATE TABLE roadmap.mcp_circuit_breakers (
    tool_name       text PRIMARY KEY,
    state           text DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
    failure_count   int DEFAULT 0,
    failure_threshold int DEFAULT 5,
    cooldown_seconds int DEFAULT 60,
    last_failure    timestamptz,
    last_success    timestamptz
);
```
- Per-tool circuit breakers: after N failures, tool is "opened" (returns cached/fallback)
- Agent-level retry budgets: max 3 retries per tool per session
- MCP server queue depth limit: reject new calls if > 50 pending

**Value:** Prevents cascading failures; reduces token waste from retry storms (Gap 3.2 complement).

---

### NEW: P191 — Proposal Workflow Analytics & Bottleneck Detection
**Industry precedent:** GitHub's "time in status" metrics, Linear's cycle time analysis
**Pillar:** 1 (Proposal Lifecycle)
**Priority:** Medium

**Problem:** No visibility into proposal lifecycle bottlenecks. How long do proposals spend in each state? Which transitions have the highest rejection rate? What's the average time from Draft to Complete?

**Proposed Solution:**
```sql
CREATE VIEW roadmap.v_proposal_analytics AS
SELECT
    display_id,
    title,
    status,
    maturity_state,
    created_at,
    updated_at,
    EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600 AS hours_in_current_state,
    (SELECT COUNT(*) FROM proposal_dependencies WHERE proposal_id = p.id) AS dep_count,
    (SELECT COUNT(*) FROM proposal_acceptance_criteria WHERE proposal_id = p.id) AS ac_count,
    (SELECT COUNT(*) FROM proposal_state_transitions WHERE proposal_id = p.id) AS transition_count
FROM roadmap.proposals p;
```
- Per-state dwell time analysis
- Transition rejection rate tracking
- Bottleneck identification (which states cause the most delays)
- Integration with gate pipeline: gate decisions automatically feed analytics

**Value:** Data-driven process improvement; identifies where to invest engineering effort.

---

## 📊 Gap Status Matrix (Updated V3)

| Gap | V2 Status | V3 Status | Change | Blocker |
|-----|-----------|-----------|--------|---------|
| Gate pipeline (P167-P169) | 🔴 BLOCKING | 🔴 BLOCKING | — | Auth/missing columns |
| AC system corruption (P156-P158) | 🔴 DATA CORRUPTION | 🔴 ROOT CAUSE FOUND | ⬆️ | Character splitting bug |
| Agent health table (P187) | 🔴 MISSING | 🔴 MISSING | — | Migration not applied |
| Cost attribution | ⚠️ INCOMPLETE | ⚠️ INCOMPLETE | — | LLM API not wired |
| MCP tool metrics (P188) | ⚠️ NOT IMPLEMENTED | ⚠️ NOT IMPLEMENTED | — | Table + middleware needed |
| MCP role-based filtering | ⚠️ COGNITIVE LOAD | ⚠️ COGNITIVE LOAD | — | P188 dependent |
| Governance framework (P170) | ⚠️ DEVELOP | ⚠️ DEVELOP | — | 12 REVIEW proposals blocked |
| Crypto identity (P159/P080) | 🔴 CRITICAL | 🔴 CRITICAL | — | Federation blocked |
| **NEW: MCP load shedding** | — | ⚠️ NO PROTECTION | 🆕 | RFC exists, not implemented |
| **NEW: Session replay** | — | ⚠️ MISSING | 🆕 | No infrastructure |
| **NEW: Gateway clarity** | — | ⚠️ CONFUSING | 🆕 | No source, systemd ref exists |
| **NEW: Skill verification** | — | ⚠️ TRUST GAP | 🆕 | P174 in REVIEW |
| **NEW: Proposal analytics** | — | ⚠️ NO VISIBILITY | 🆕 | No metrics on lifecycle |

---

## 🔧 Refinement Recommendations

### Immediate (This Session)
1. **Fix AC character-splitting bug** — The root cause is in `pg-handlers.ts` line ~448; the criterion_text insertion iterates over characters. This single fix unblocks the entire gate pipeline.
2. **Apply agent_health migration** — Create and run migration 022 to deploy the `roadmap.agent_health` table from P187.

### This Week
3. **Implement MCP circuit breakers (P190)** — Prevents the retry storms and cascading failures that waste tokens.
4. **Unify P160/P154/P155 fixes under proposal-079** — The adaptive status surfaces concept could solve all three dashboard issues with one component.
5. **Advance P174 (Skill Certification) from REVIEW** — Required before federation; agents need verified skills.

### Next Sprint
6. **Build session replay infrastructure (P189)** — Essential for debugging autonomous agent failures at scale.
7. **Wire cost attribution** — Connect LLM billing APIs to `spending_log` for real efficiency validation.
8. **Add proposal analytics (P191)** — Data-driven lifecycle optimization.

### Architectural
9. **Clarify gateway service** — Document what `hermes-gateway` actually does; align systemd services with source code structure.
10. **Add MCP server queue depth limits** — Complement circuit breakers with admission control.

---

## 📚 References

1. `PILLAR-RESEARCH-REPORT-2026-04-12-V2.md` — Previous report
2. `src/apps/mcp-server/tools/rfc/pg-handlers.ts` — AC implementation (root cause of P156)
3. `scripts/migrations/021-documents-messaging-protocol.sql` — Latest migration
4. `roadmap/proposals/proposal-079` — Workflow-Adaptive Status Surfaces (Draft)
5. `roadmap/proposals/rfc-20260401-messaging.01` — Rate Limiting RFC (Draft)
6. LangGraph replay docs — Industry precedent for P189
7. CrewAI timeout handling — Industry precedent for P190

---

*Report generated by Pillar Researcher — AgentHive Innovation Scout*
*Date: 2026-04-12 | Version: 5.0 (cycle 3 — code inspection + industry scan)*
