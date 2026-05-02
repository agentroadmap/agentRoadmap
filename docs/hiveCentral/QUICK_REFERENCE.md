# QUICK REFERENCE: 251-Proposal Pipeline Audit

## By the Numbers

| Metric | Count | Status |
|--------|-------|--------|
| **Total Proposals** | 422 | System-wide |
| **Non-Terminal (Active)** | 251 | In pipeline |
| **Foundation (Architecture)** | 7 | 🔴 NOT MERGED (blocker) |
| **Control-Plane** | 12 | ⏸️ Waiting for P745 schema |
| **Tenant-DB** | 6 | ⏸️ Waiting for P745 schema |
| **Dispatch/Routing** | 31 | ⏸️ Waiting for P744 merge |
| **Feature Layer** | 30+ | 🟢 Can scope; delay impl |
| **Obsolete** | 98 | ⚠️ Cleanup opportunity |

## Foundation Layer: The 7 Critical Proposals

**These must merge by EOW1 to unblock everything else.**

| ID | Title | Status | Blocker |
|----|-------|--------|---------|
| **P744** | Umbrella A — Centralized Orchestrator | DEVELOP | YES |
| **P745** | Umbrella B — hiveCentral vNext Schema | DRAFT | 🔴 YES (!!!) |
| **P746** | Umbrella C — Agency Offline Detection | DEVELOP | YES |
| **P747** | Umbrella D — Model Routing Restriction | DRAFT | YES |
| **P706** | Unify state vocabulary | DEVELOP | YES |
| **P798** | Multi-platform subscription model | DEVELOP | MEDIUM |
| **P688** | Architecture type test (mark obsolete) | DEVELOP | NO |

**Critical Path:** P744 → merge → A-workstream (7 proposals)  
**Critical Path:** P745 → merge → Provisioning (6 proposals) + Control-plane (12 proposals)

## Blocked Proposal Categories

### Control-Plane (12 proposals) — Blocked by P745 + P820

```
P820 (Control-plane schema) ← BLOCKED BY P745 (hiveCentral schema)
  ↓
  P788, P705, P659, P591, P589, P586, P561, P507, P421, P405
  (All operator surfaces, governance, HA designs)
```

### Tenant-DB (6 proposals) — Blocked by P745 + P758

```
P758 (Tenant provisioning) ← BLOCKED BY P745 (tenant schema)
  ↓
  P759 (getPool rewire) ← HIGH RISK, 3-week implementation
  ↓
  P760, P764, P768, P767 (schemas, policies, config)
```

### Dispatch/Routing (31 proposals) — Blocked by P744–P747

```
A-Workstream: P748–P754 (7 proposals)
  ↓ BLOCKED BY P744
  
B-Workstream: P758–P760 (6 proposals)
  ↓ BLOCKED BY P745 + P758
  
C-Workstream: P761–P766 (6 proposals)
  ↓ BLOCKED BY P746 + P761
  
D-Workstream: P767–P773 (7 proposals)
  ↓ BLOCKED BY P747 + P770–P771
```

### Feature Layer (30+ proposals) — Can scope, delay implementation

| Category | Proposals | Blocked By |
|----------|-----------|-----------|
| Pricing | P249, P248, P246, P236 | P745 (model_metadata) |
| Board/Workflow | P776, P777, P775, P774, P802 | P706 (vocabulary) |
| Governance | P780, P779, P778, P606, P181–P188 | P605 (merged), P706 |

## 5-Week Sequencing at a Glance

```
WEEK 1: Foundation Lock (P744–P747, P706 MERGE)
   └─ Unlock: 25+ downstream proposals
   
WEEK 2: Schema Coordination (Codex–Claude handoff)
   └─ Claude reviews P745 + P820; design tenant schema
   
WEEK 3: Parallel Adaptation (A/B/C workstreams: 25 proposals)
   └─ Ready for REVIEW by EOW3
   
WEEK 4: D-Workstream + Feature Scoping (7 + 30+ proposals)
   └─ Feature RFCs; D-workstream REVIEW
   
WEEK 5: Feature Implementation + Cleanup (30+ + 98 proposals)
   └─ Feature DEVELOP/REVIEW; obsolete → CANCELED
```

## Owner Assignments

### Codex (Primary)
- Week 1: Finalize + merge P744–P747, P706
- Weeks 2–3: Implement A/B/C workstreams (25 proposals)
- Week 4: Implement D-workstream (7 proposals)
- Week 5: Feature implementation + obsolete cleanup

### Claude (Secondary)
- Week 2: Review + design schemas (P745, P820, tenant-DB)
- Week 4: Feature layer coordination
- Week 5: Support P759 Phase 2 validation

## Red Flags & Risks

🔴 **CRITICAL:**
- P745 (hiveCentral schema) is DRAFT → 12 proposals blocked
- P744 not merged → 31 dispatch/routing proposals blocked
- No timeline for foundation lock → pipeline stalled

🟡 **HIGH:**
- P759 (getPool rewire) is high-risk → requires staged rollout
- 98 obsolete proposals → safety review needed before cleanup

🟢 **MANAGEABLE:**
- Feature layer can scope in parallel; delay implementation until P745 locked

## What to Look For (Codex)

1. **P745 finalization:** Does schema split actually separate control-plane vs tenant correctly?
2. **P744 simplification:** What complexity is removed vs old pipeline?
3. **Obsolete identification:** Which proposals become unnecessary post-P745?
4. **P759 safety:** Can getPool rewire be phased to minimize risk?

## What to Look For (Claude)

1. **P745 schema completeness:** Are all control-plane + tenant tables defined?
2. **Migration path:** How do operator tables move from `agenthive` → `hiveCentral`?
3. **Tenant isolation:** How are per-project tables isolated/scoped?
4. **Model metadata:** What changes needed for pricing (P249)?

## Files in This Audit

1. **PIPELINE_AUDIT_251.md** — Full strategic assessment (17.5 KB)
   - Detailed categorization of all 251 proposals
   - Dependency graph for top 50
   - 5-week sequencing plan with milestones
   - Recommendations for Codex + Claude

2. **AUDIT_SUMMARY.txt** — Executive summary (18.5 KB)
   - High-level overview + visual sequencing
   - Success criteria + risk register
   - Quick reference for status tracking

3. **QUICK_REFERENCE.md** — This file
   - Fast lookup by category
   - Owner assignments
   - Red flags + what to monitor

## Usage

- **Planning meetings:** Use PIPELINE_AUDIT_251.md (full detail)
- **Weekly standups:** Use AUDIT_SUMMARY.txt (visual overview)
- **Quick lookup:** Use QUICK_REFERENCE.md (this file)

## Next Action

👉 **Codex:** Initiate Week 1 foundation sprint  
👉 **Schedule:** Codex–Claude sync for Week 2 schema handoff  
👉 **Track:** Weekly progress vs sequencing plan  

---

**Generated:** 2026-05-02  
**Status:** Active audit (update weekly)  
**Distribution:** Codex, Claude, Architecture Team
