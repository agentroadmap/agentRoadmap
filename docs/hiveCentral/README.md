# hiveCentral Migration & Umbrella Architecture

This folder contains the comprehensive audit, architecture documents, and governance references for the hiveCentral control-plane migration and simplified umbrella orchestration refactor.

## 📋 Quick Navigation

### **Audit & Assessment**
- **PIPELINE_AUDIT_251.md** — Comprehensive 251-proposal pipeline audit
  - Full dependency graph
  - 5-week sequencing plan
  - Risk register + success criteria
  - Category-by-category roadmap

- **AUDIT_SUMMARY.txt** — Executive summary
  - High-level metrics
  - Visual timelines
  - Owner assignments (Codex, Claude, QA)

- **QUICK_REFERENCE.md** — Daily lookup guide
  - Fast category navigation
  - Red flags
  - Key questions

- **AUDIT_STATUS.md** — Tracking template
  - Weekly metrics
  - Phase gates
  - Success criteria

### **Architecture & Design**
- **control-plane-ddl-sketch.md** — hiveCentral schema design
  - Identity, model, credential, project tables
  - Control-plane vs tenant separation
  - DDL for new DB model

- **control-plane-multi-project-architecture.md** — Multi-project topology
  - Project isolation
  - Tenant DB scoping
  - ACL & data access patterns

### **Governance & References**
- **CONVENTIONS.md** — Canonical source for all AgentHive conventions
  - Workflow definitions
  - MCP integration
  - DB topology
  - Git & governance policies

- **TEAM_MEMORY.md** — Session context & decision history
  - Prior work & assumptions
  - Agent coordination notes
  - Historical decisions

---

## 🎯 For Codex (Architecture Review)

Start with:
1. **QUICK_REFERENCE.md** (2 min read) — Understand categories
2. **PIPELINE_AUDIT_251.md** § Foundation Layer (10 min) — Which proposals to review
3. **QUICK_REFERENCE.md** § Red Flags — What needs rework

Then review your checklist:
- [ ] P744–P747, P706 finalization (merge foundation)
- [ ] Identify which proposals become obsolete post-P745
- [ ] Generate rework checklist for control-plane + dispatch

---

## 🗄️ For Claude (Database Model)

Start with:
1. **AUDIT_SUMMARY.txt** § Schema Misalignment (5 min) — Impact scope
2. **control-plane-ddl-sketch.md** (15 min) — Current schema design
3. **PIPELINE_AUDIT_251.md** § Control-Plane / Tenant-DB (10 min) — Which proposals depend on what

Then design:
- [ ] hiveCentral control-plane schema (identity, model, credential, project)
- [ ] Tenant-DB schema (project-scoped tables)
- [ ] Schema impact graph (which proposals reference which tables)
- [ ] Migration playbook (old → new table mappings)

---

## 📊 Pipeline Snapshot

| Category | Count | Status | Wait-For |
|----------|-------|--------|----------|
| **Foundation** | 7 | DEVELOP/new | Must merge by EOW1 |
| **Control-Plane** | 12 | DRAFT | Claude schema design |
| **Tenant-DB** | 6 | DRAFT | Claude schema design |
| **Dispatch/Routing** | 31 | Mixed | Foundation merge |
| **Feature Layer** | 30+ | DRAFT | Schemas locked |
| **Obsolete** | 98 | DRAFT/obsolete | Cleanup Week 5 |

**Total In-Pipeline:** 251 proposals

---

## ⏱️ 5-Week Execution Plan

| Week | Focus | Owner | Status |
|------|-------|-------|--------|
| **W1** | Foundation lock (P744–P747 merge) | Codex | ⏳ TODO |
| **W2** | Schema coordination (Codex–Claude handoff) | Claude | ⏳ TODO |
| **W3** | Parallel adaptation (25 proposals) | Codex | ⏳ TODO |
| **W4** | D-workstream + feature scoping | Both | ⏳ TODO |
| **W5** | Feature implementation + cleanup | Both | ⏳ TODO |

---

## 🚨 Critical Path

1. **Foundation must merge by EOW1** → unblocks 25+ downstream proposals
2. **Schema coordination must complete by EOW2** → enables adaptation work
3. **Control-plane + Tenant-DB proposals must adapt by EOW3** → unblocks features
4. **Feature layer can scope during W2–W3** → implement post-W3

---

## 📞 Coordination

- **Daily sync:** Codex + Claude + Coordinator (you)
- **Weekly checkpoint:** Review progress against sequencing plan
- **Risk escalation:** Any blocking issues flagged immediately

---

**Last Updated:** 2026-05-02 05:32 UTC
**Status:** Ready for Codex + Claude review
