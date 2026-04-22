# P310 Research Report: Instruction File Content Audit

## Overview
Date: 2026-04-20
Agent: hermes-andy (researcher)
Proposal: P310 — Reconcile and deduplicate 5 instruction files

## Files Analyzed

| File | Lines | Bytes | Role |
|------|-------|-------|------|
| AGENTS.md | 82 | 4,614 | Codex/general agent instructions |
| CLAUDE.md | 74 | 5,236 | Claude Code project memory |
| CONVENTIONS.md | 337 | 15,259 | Agent onboarding and conventions |
| agentGuide.md | 107 | 7,024 | Agent operational guide (overseer, governance) |
| .github/copilot-instructions.md | 65 | 3,247 | Copilot schema migration context |

## 1. Content Inventory by Section

### AGENTS.md (82 lines)
```
L1-4    Purpose (repo identity + proposal-driven)
L6-9    Precedence (proposal type → workflow → states → maturity)
L11-19  Proposal Types table (5 types: product, component, feature, issue, hotfix)
L21-29  Standard RFC Workflow states table (5 states: Draft → Complete)
L31-36  Maturity definitions (New, Active, Mature, Obsolete)
L38-41  Instruction Files pointer (lists AGENTS.md, CLAUDE.md, copilot)
L43-53  Working Rules (10 bullet points)
L55-59  Coding Principles (4 bullets)
L61-66  Coding Preferences (5 bullets)
L68-73  Commit Discipline (4 bullets)
L75-77  Repo Context (worktree root, main root, MCP URL)
L80-83  Notes (terminology, staleness, litter warning)
```

### CLAUDE.md (74 lines)
```
L1-4    Core Identity & Philosophy (self-evolving platform)
L6-7    Operational Workflow intro (proposals + MCP)
L9-17   Proposal Types table (IDENTICAL to AGENTS.md)
L19-27  Standard RFC Workflow states (IDENTICAL to AGENTS.md, minor formatting)
L29-34  Maturity definitions (slightly different wording from AGENTS.md)
L36-45  Hotfix Workflow (UNIQUE — not in other files)
L47-51  Agent Responsibilities & Rules (4 bullets)
L53-66  Completed Capabilities table (P050-P148)
L68-73  Technical Environment (project root, hermes worktree, MCP, systemd, SCM)
```

### CONVENTIONS.md (337 lines)
```
L1-3    Title and purpose statement
L5-15   Start Here reading list (references agentGuide.md, roadmap.yaml, DDL, docs)
L17-38  Operating Reality (DB, MCP, code locations, live facts)
L40-56  Where Things Live (repo layout table)
L57-67  Daily Working Rules (7 bullets)
L69-130 Proposal and RFC Workflow Through MCP (proposal-first rule, core tools, lease tools, MCP flow)
L131-248 Database Conventions (DDL rules, DML rules, proposal-gated DB changes, coordinated rollout)
L250-284 Git and Worktree Best Practices (branching, commits, shared-history, conflicts, safety)
L286-298 Validation and Deployment Expectations
L299-319 Quick Checklist for New Agents (before start + before finish)
L321-337 Default Escalation Rule
```

### agentGuide.md (107 lines)
```
L1-27   Overseer: Hermes (Andy) — responsibilities, what NOT to do, orchestrator relationship
L29-42  Model-to-Workflow Position Mapping (phase → model table + fallback chain)
L46-52  Workspace & Environment Isolation (worktree protocol, pathing, ephemeral files)
L55-63  Lease & Claim Protocol (MCP claim, renewal, conflict handling)
L66-74  Financial Governance & Budget Control (budget estimation, threshold, efficiency)
L77-83  Anomaly & Loop Detection (inertia loops, DAG loops, reporting)
L86-96  Escalation Matrix table (4 issue types → primary/secondary escalation)
L100-103 Definitions (maturity model, zero-trust, staging)
L106   Closing quote
```

### .github/copilot-instructions.md (65 lines)
```
L1-4    Context (schema migration task intro)
L5-12   Data Model Source (DDL/DML file references)
L14-22  Critical Breaking Changes table (v1 → v2)
L24-28  4 Pillar Modules
L30-36  Architecture (config, worktree, MCP, env)
L38-43  Key Files to Rewrite (5 file paths)
L45-50  Important Column Changes
L52-54  DDL Already Applied warning
L56-58  Testing (220 tests, 2 known failures)
L60-65  Coding Standards (5 bullets)
```

## 2. Overlap Matrix (exact or near-identical content)

| Content Block | AGENTS.md | CLAUDE.md | CONVENTIONS.md | agentGuide.md | copilot |
|---------------|-----------|-----------|----------------|---------------|---------|
| Proposal Types table | EXACT | EXACT | — | — | — |
| RFC Workflow states table | EXACT | EXACT | — | — | — |
| Maturity definitions | v1 | v2 (slightly different) | — | — | — |
| Hotfix Workflow | — | UNIQUE | — | — | — |
| Working Rules / Daily Rules | 10 bullets | — | 7 bullets (subset) | — | — |
| Coding Principles | 4 bullets | — | — | — | — |
| Coding Preferences | 5 bullets | — | — | — | — |
| Commit Discipline | 4 bullets | — | Git section (250-284) | — | — |
| MCP tool list | — | — | UNIQUE (tables) | — | — |
| DB conventions | — | — | UNIQUE (131-248) | — | — |
| Overseer role | — | — | — | UNIQUE (L1-27) | — |
| Financial governance | — | — | — | UNIQUE (L66-74) | — |
| Escalation matrix | — | — | L321-337 (simpler) | L86-96 (formal table) | — |
| Model-to-phase mapping | — | — | — | UNIQUE (L29-42) | — |
| Anomaly/loop detection | — | — | — | UNIQUE (L77-83) | — |
| Workspace isolation | — | L68-73 (CWD) | L250-284 (Git) | L46-52 (HARDCODED PATH) | L30-36 |
| Schema migration context | — | — | — | — | UNIQUE |
| Repo layout | — | — | L40-56 | — | — |
| Completed capabilities | — | UNIQUE | — | — | — |

## 3. Contradictions Found

### C1: Worktree Path Convention (CRITICAL)
- **agentGuide.md L49**: "create and use a dedicated Git worktree located at `/data/code/worktree-{agent_name}`" (HARDCODED)
- **CLAUDE.md L69**: "Project Root: CWD" (flexible)
- **CONVENTIONS.md L69**: "Current worktree root: CWD" (flexible)
- **AGENTS.md L75**: "Current worktree root: CWD" (flexible)
- **copilot L32**: "Current worktree root: CWD" (flexible)

**Verdict**: agentGuide.md is wrong. 4 files agree on CWD convention. agentGuide.md's hardcoded path contradicts.

### C2: Maturity Definitions (MINOR)
- **AGENTS.md L31-36**: Clean, concise definitions. "New: Just entered the state..."
- **CLAUDE.md L29-34**: Different wording. "New: Proposal just advanced to a new state, waiting for dependency to complete or being claim/lease to be actively worked on be it research enhance debate or coding" — run-on sentence.

**Verdict**: AGENTS.md version is cleaner. CLAUDE.md version has more detail but is poorly written.

### C3: Escalation Rules (DUPLICATE-SPLIT)
- **CONVENTIONS.md L321-337**: "Default Escalation Rule" — 4 bullet conditions, then "leave the next agent a better surface" guidance.
- **agentGuide.md L86-96**: Formal "Escalation Matrix" table with 4 issue types, primary/secondary columns, "The Gary Rule."

**Verdict**: agentGuide.md's table is more structured. CONVENTIONS.md's is action-oriented. They should merge.

### C4: Working Rules (OVERLAP-SPLIT)
- **AGENTS.md L43-53**: 10 bullets (proposal workflow, surgical changes, testing)
- **CONVENTIONS.md L57-67**: 7 bullets (similar themes, different wording, fewer items)
- **agentGuide.md L100-103**: 3 bullets (maturity, zero-trust, staging) — completely different

**Verdict**: AGENTS.md has the most comprehensive set. CONVENTIONS.md overlaps ~60%. agentGuide.md adds unique governance concepts.

### C5: Lease/Claim Protocol (DUPLICATE)
- **agentGuide.md L55-63**: Lease & Claim Protocol (claiming, TTL, renewal, conflict)
- **CONVENTIONS.md L69-130**: Expected MCP flow (discover, acquire lease, maturity, transition, AC/deps/review)

**Verdict**: CONVENTIONS.md version is more complete and integrated with MCP tool list. agentGuide.md is higher-level but adds conflict handling detail.

## 4. Unique Content Per File (must be preserved)

### AGENTS.md unique content
- Coding Principles (L55-59): "Think before coding", "Simplicity first", "Surgical changes", "Goal-driven"
- Coding Preferences (L61-66): Smallest change, existing patterns, state assumptions, push back, verify
- Commit Discipline (L68-73): Scoped commits, avoid mega-commits, stay in worktree
- Instruction Files pointer (L38-41): Lists which file is for which tool
- Notes section (L80-83): Terminology warning, staleness guidance, litter warning

### CLAUDE.md unique content
- Hotfix Workflow (L36-45): Triage → Fixing → Done, terminal states, escalation escape
- Agent Responsibilities & Rules (L47-51): Leasing model, RFC standard, issue reporting, cubic context
- Completed Capabilities table (L53-66): P050-P148 capability matrix
- Technical Environment (L68-73): Systemd services list, SCM policy

### CONVENTIONS.md unique content
- Reading list (L5-15): Ordered file references
- Operating Reality table (L17-38): Live DB/MCP/code locations
- Repo layout table (L40-56): Full directory structure
- MCP tool tables (L84-113): Core tools, RFC tools, lease tools with descriptions
- Expected MCP flow (L114-130): 5-step workflow with notes
- DDL/DML conventions (L31-248): Comprehensive DB rules (schema-qualify, rollout, migration)
- Coordinated rollout pattern (L198-222): 5-step compatibility-first deployment
- Validation expectations (L286-298): Precision over confidence theater
- Quick checklist (L299-319): Before start + before finish

### agentGuide.md unique content
- Overseer role definition (L1-27): Hermes/Andy responsibilities, orchestrator relationship
- Model-to-Workflow Position Mapping (L29-42): Phase → model table, fallback chain
- Financial Governance (L66-74): Budget estimation, 80% threshold, circuit breaker
- Anomaly & Loop Detection (L77-83): Inertia loops, DAG loops, reporting
- Escalation Matrix table (L86-96): Formal 4-row table with Gary Rule
- Definitions (L100-103): Maturity model colors, zero-trust, staging

### copilot-instructions.md unique content
- Schema migration context (L1-4): v2 migration task framing
- Breaking changes table (L14-22): v1 → v2 column mapping
- 4 Pillar Modules (L24-28): Product/Workforce/Efficiency/Utility
- Key files to rewrite (L38-43): 5 specific file paths
- Column changes (L45-50): Specific schema changes
- Testing notes (L56-58): 220 tests, 2 known failures
- Coding standards (L60-65): TypeScript, Postgres-native, pooling, compatibility

## 5. Content Ownership Matrix (Proposed Target State)

| Content Block | Target File | Rationale |
|---------------|-------------|-----------|
| Proposal Types table | CONVENTIONS.md | Canonical single copy |
| RFC Workflow states | CONVENTIONS.md | Canonical single copy |
| Maturity definitions | CONVENTIONS.md | Clean AGENTS.md version |
| Hotfix Workflow | CLAUDE.md (thin shim) | Unique to Claude use case |
| Working Rules | CONVENTIONS.md | Merge best of AGENTS.md + CONVENTIONS.md |
| Coding Principles | CONVENTIONS.md | From AGENTS.md, universally applicable |
| Coding Preferences | CONVENTIONS.md | From AGENTS.md, universally applicable |
| Commit Discipline | CONVENTIONS.md (Git section) | Merge into existing Git section |
| Instruction Files pointer | CONVENTIONS.md | Meta-reference, belongs in canonical |
| MCP tool tables | CONVENTIONS.md | Already there, keep |
| DB conventions | CONVENTIONS.md | Already there, keep |
| Overseer role | CONVENTIONS.md | From agentGuide.md |
| Model-to-phase mapping | CONVENTIONS.md | From agentGuide.md |
| Financial governance | CONVENTIONS.md | From agentGuide.md |
| Anomaly/loop detection | CONVENTIONS.md | From agentGuide.md |
| Escalation matrix | CONVENTIONS.md | Merge agentGuide.md table + CONVENTIONS.md bullets |
| Workspace isolation | CONVENTIONS.md | CWD convention (fix agentGuide.md) |
| Completed capabilities | CLAUDE.md (thin shim) | Historical context for Claude sessions |
| Technical environment | CONVENTIONS.md | Merge systemd services into Operating Reality |
| Schema migration context | docs/reference/schema-migration-guide.md | Move from copilot-instructions.md |
| Coding standards (copilot) | CONVENTIONS.md | Merge into existing coding rules |
| Repo layout | CONVENTIONS.md | Already there, keep |
| Quick checklist | CONVENTIONS.md | Already there, keep |
| Validation expectations | CONVENTIONS.md | Already there, keep |
| Coordinated rollout | CONVENTIONS.md | Already there, keep |

## 6. Implementation Order (Verified)

1. **Add precedence section to CONVENTIONS.md** — declare it the canonical source
2. **Merge agentGuide.md → CONVENTIONS.md**: overseer role, model mapping, financial governance, loop detection, escalation matrix (fix worktree path)
3. **Merge AGENTS.md → CONVENTIONS.md**: proposal types, workflow, maturity, coding principles, coding preferences, commit discipline, instruction files pointer
4. **Merge CLAUDE.md unique → CONVENTIONS.md**: agent responsibilities (lease/RFC/issue/cubic rules), technical environment (systemd services)
5. **Merge copilot coding standards → CONVENTIONS.md**: TypeScript, Postgres-native, compatibility rules
6. **Rewrite AGENTS.md as thin shim** (~30 lines): pointer to CONVENTIONS.md, Codex-specific notes
7. **Rewrite CLAUDE.md as thin shim** (~40 lines): pointer to CONVENTIONS.md, hotfix workflow, capabilities pointer, Claude-specific model constraints
8. **Move copilot-instructions.md** → `docs/reference/schema-migration-guide.md`, leave thin redirect
9. **Retire agentGuide.md** → replaced with pointer to CONVENTIONS.md
10. **Verify**: no contradictions remain, all cross-references updated

## 7. Estimated Target Sizes

| File | Current Lines | Target Lines | Change |
|------|---------------|--------------|--------|
| CONVENTIONS.md | 337 | ~450 | +113 (absorbs content) |
| AGENTS.md | 82 | ~30 | -52 (thin shim) |
| CLAUDE.md | 74 | ~40 | -34 (thin shim) |
| agentGuide.md | 107 | ~10 | -97 (pointer only) |
| copilot-instructions.md | 65 | ~15 | -50 (thin redirect) |
