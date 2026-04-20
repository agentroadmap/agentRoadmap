# P310 Research Analysis: Instruction File Reconciliation

## Proposal Correction

P310 originally stated "Three instruction files" — actually **5** exist.
P310 originally stated "agentGuide.md does not exist" — it **does exist** (7240 bytes, at project root).

Both corrections validated against filesystem.

---

## Complete File Inventory

| File | Size | Last Modified | Primary Audience | Scope |
|------|------|---------------|------------------|-------|
| AGENTS.md | 4,614B | Apr 17 11:51 | Codex, general agents | Proposal types, workflow, coding rules, commit discipline |
| CLAUDE.md | 5,236B | Apr 18 05:09 | Claude Code | Project memory, workflow, hotfix, agent rules, capabilities table |
| copilot-instructions.md | 3,247B | Apr 17 11:51 | GitHub Copilot | V2 schema migration, DDL/DML rules, specific files |
| CONVENTIONS.md | 15,259B | — | All agents (onboarding) | Daily rules, MCP flow, DB conventions, Git best practices, checklists |
| agentGuide.md | 7,240B | Apr 17 11:51 | All agents | Overseer role, workspace isolation, lease protocol, financial governance, escalation |

Additionally:
- README.md — human-facing project overview (not agent instruction)
- folderStructure.md — directory layout reference (cross-referenced by CONVENTIONS)

---

## Content Overlap Matrix

### Proposal Types & RFC Workflow (duplicated verbatim)

| Content | AGENTS.md | CLAUDE.md | CONVENTIONS.md | agentGuide.md |
|---------|-----------|-----------|----------------|---------------|
| Proposal type table (5 types) | Lines 15-21 | Lines 9-17 | Lines 128-129 (minimal) | — |
| RFC state table (5 states) | Lines 23-31 | Lines 19-27 | — | — |
| Maturity definitions | Lines 33-38 | Lines 29-34 | Lines 119-122 | Line 101 |
| Working rules | Lines 43-53 | Lines 47-51 | Lines 57-67 | — |

**Finding:** AGENTS.md and CLAUDE.md contain identical proposal type tables and nearly identical RFC workflow tables. CLAUDE.md adds the Hotfix workflow (lines 36-45) which exists nowhere else.

### MCP Protocol

| Content | AGENTS.md | CLAUDE.md | CONVENTIONS.md | agentGuide.md |
|---------|-----------|-----------|----------------|---------------|
| Claim/lease mention | Line 48 | Line 48 | Lines 110-112 | Lines 56-62 |
| MCP tool list | — | — | Lines 86-113 | — |
| Lease protocol detail | Minimal | Minimal | 3 lines | 8 lines (TTL, renewal, conflict) |
| Expected MCP flow | — | — | Lines 114-124 | — |

**Finding:** CONVENTIONS.md has the most complete MCP reference. agentGuide.md adds detail on lease TTL/renewal/conflict.

### Escalation

| Content | AGENTS.md | CLAUDE.md | CONVENTIONS.md | agentGuide.md |
|---------|-----------|-----------|----------------|---------------|
| Escalation rules | Lines 50-52 | Lines 49-51 | Lines 321-336 | Lines 86-97 |
| Escalation matrix | — | — | — | Table with 4 issue types |

**Finding:** agentGuide.md has the only structured escalation matrix. CONVENTIONS.md has the "when to escalate" rules.

### Unique Content (exists in only ONE file)

| Content | File |
|---------|------|
| Hotfix workflow (Triage→Fixing→Done, terminal states, escalation to issue) | CLAUDE.md only |
| Completed capabilities table (P050-P148) | CLAUDE.md only |
| V2 schema migration rules, DDL/DML conventions | copilot-instructions.md only |
| Overseer (Hermes/Andy) role definition | agentGuide.md only |
| Financial governance / budget control | agentGuide.md only |
| Anomaly & loop detection | agentGuide.md only |
| Model-to-workflow phase mapping | agentGuide.md only |
| Database deployment handoff protocol | CONVENTIONS.md only |
| Coordinated rollout pattern | CONVENTIONS.md only |
| Proposal-first rule of thumb | CONVENTIONS.md only |

---

## Conflicting Content

### 1. Worktree path convention
- **CLAUDE.md (line 70):** "sibling worktree resolved from the CWD, not a hardcoded absolute path"
- **agentGuide.md (line 49):** "create and use a dedicated Git worktree located at `/data/code/worktree-{agent_name}`"
- These contradict each other.

### 2. File precedence
- **CONVENTIONS.md** says: read README.md, agentGuide.md, roadmap.yaml first
- **CLAUDE.md** says: "CLAUDE.md (Claude Code)" is "repo-wide"
- **AGENTS.md** says: "AGENTS.md is the repo-wide instruction file for Codex"
- No file says what to do when they conflict.

### 3. Agent guide reference
- **CONVENTIONS.md** references `agentGuide.md` — which exists but has different content emphasis
- **CLAUDE.md** contains no reference to CONVENTIONS.md or agentGuide.md
- **AGENTS.md** contains no reference to CONVENTIONS.md or agentGuide.md

### 4. Scope inflation
- **copilot-instructions.md** is titled "v2 Schema Migration" — a specific task, not general instructions. It has drifted from "Copilot agent instructions" to "schema migration reference."

---

## Content Drift & Staleness

| Issue | Severity |
|-------|----------|
| CLAUDE.md capabilities table says "as of 2026-04-11" — stale by 9 days | Low |
| agentGuide.md Model-to-Workflow table references `claude-opus-4-6`, `o3` — may not match live model_routes | Medium |
| agentGuide.md refers to `scripts/orchestrator.ts` — orchestrator may have moved | Medium |
| copilot-instructions.md assumes migration is in-progress — parts may be done | Medium |
| CLAUDE.md hardcodes `/data/code/AgentHive` and `/data/code/worktree/hermes-andy` as project/Hermes paths | Low (Claude-specific) |

---

## Precedence Problem (core issue)

When multiple files say different things, no agent knows which wins. The current state is:

1. Agent spawns → sees AGENTS.md (if Codex), CLAUDE.md (if Claude), or copilot-instructions.md (if Copilot)
2. Agent may or may not read CONVENTIONS.md or agentGuide.md
3. No file establishes a precedence chain
4. Content differs subtly between files (e.g., maturity definitions have different wording)

---

## Design Recommendation

### Architecture: Single Source of Truth + Per-Tool Minimal Shims

```
CONVENTIONS.md          ← THE canonical source (already the most complete)
    │                     All project-wide rules, MCP flow, DB conventions, Git
    │
    ├── AGENTS.md         ← Thin shim: tool-specific quirks + link to CONVENTIONS
    ├── CLAUDE.md         ← Claude-specific memory + link to CONVENTIONS
    ├── agentGuide.md     ← Merge overseer/governance content INTO CONVENTIONS, then retire
    └── copilot-instructions.md ← Move to docs/reference/schema-migration-guide.md
```

**Key principles:**
1. CONVENTIONS.md is the single source of truth for all shared content
2. Tool-specific files (AGENTS.md, CLAUDE.md) contain ONLY what is unique to that tool
3. Shared content (proposal types, workflow, maturity, MCP flow) lives in ONE place
4. Tool files link to CONVENTIONS.md and add tool-specific context (model constraints, CLI quirks)
5. agentGuide.md unique content (overseer role, financial governance, escalation matrix) merges into CONVENTIONS.md § new sections
6. copilot-instructions.md becomes a docs reference, not an agent instruction file

### What each tool file becomes

**AGENTS.md** (target: ~30 lines):
```
See CONVENTIONS.md for canonical project rules.
[Tool-specific: Codex configuration, sandbox notes, commit hook behavior]
```

**CLAUDE.md** (target: ~40 lines):
```
See CONVENTIONS.md for canonical project rules.
[Tool-specific: Claude memory notes, model constraints for this host]
[Completed capabilities table — compact, pointer to docs]
```

**CONVENTIONS.md** (absorbs from agentGuide.md):
- + Overseer role section (from agentGuide §0)
- + Financial governance section (from agentGuide §3)
- + Loop detection section (from agentGuide §4)
- + Escalation matrix table (from agentGuide §5)
- + Model-to-workflow mapping (from agentGuide §0)
- Fix: worktree path convention (use CWD, not hardcoded path)
- Add: precedence section in §2 ("Current Operating Reality")

### Content that moves to docs/

- copilot-instructions.md → `docs/reference/schema-migration-guide.md`
- Completed capabilities table → `docs/capabilities.md` (CLAUDE.md gets a one-liner pointer)
- Model-to-workflow mapping → `docs/architecture/model-routing.md` (if not already in agenthive-mcp skill)

---

## Implementation Tasks (bite-sized)

### Task 1: Add precedence section to CONVENTIONS.md §2
**Files:** `CONVENTIONS.md`
**What:** Add a "File Precedence" subsection declaring CONVENTIONS.md as the canonical source, listing which files take priority when conflicts arise.

### Task 2: Merge agentGuide.md §0 (Overseer) into CONVENTIONS.md
**Files:** `CONVENTIONS.md`
**What:** Add "Overseer Role" section to CONVENTIONS.md with Hermes/Andy responsibilities, what Hermes does NOT do, orchestrator relationship.

### Task 3: Merge agentGuide.md §3 (Financial Governance) into CONVENTIONS.md
**Files:** `CONVENTIONS.md`
**What:** Add "Financial Governance" section with budget estimation, threshold monitoring, efficiency rules.

### Task 4: Merge agentGuide.md §4 (Loop Detection) into CONVENTIONS.md
**Files:** `CONVENTIONS.md`
**What:** Add "Anomaly & Loop Detection" section with inertia loops, DAG loops, reporting.

### Task 5: Merge agentGuide.md §5 (Escalation Matrix) into CONVENTIONS.md
**Files:** `CONVENTIONS.md`
**What:** Add structured escalation matrix table from agentGuide.md into CONVENTIONS.md §10 (Default Escalation Rule), merging with existing escalation content.

### Task 6: Merge agentGuide.md §0 (Model-to-Workflow) into CONVENTIONS.md or docs
**Files:** `CONVENTIONS.md` or `docs/architecture/model-routing.md`
**What:** Move model-phase mapping table. Verify against live model_routes before keeping.

### Task 7: Fix worktree path convention in CONVENTIONS.md
**Files:** `CONVENTIONS.md`
**What:** §4 "Daily Working Rules" line 59: change from hardcoded `/data/code/worktree/<agent-name>` to CWD-based convention matching CLAUDE.md.

### Task 8: Update CONVENTIONS.md cross-references
**Files:** `CONVENTIONS.md`
**What:** Remove agentGuide.md from §1 "Start Here" reading list (after merge). Keep README.md, roadmap.yaml, data-model-guide.md.

### Task 9: Rewrite AGENTS.md as thin shim
**Files:** `AGENTS.md`
**What:** Keep only: precedence pointer to CONVENTIONS.md, Codex-specific quirks (if any), proposal types/workflow as compact reference (or pointer).

### Task 10: Rewrite CLAUDE.md as thin shim
**Files:** `CLAUDE.md`
**What:** Keep only: precedence pointer to CONVENTIONS.md, Claude-specific memory notes, hotfix workflow (unique content), compact capabilities pointer.

### Task 11: Move copilot-instructions.md to docs/reference/
**Files:** `.github/copilot-instructions.md` → `docs/reference/schema-migration-guide.md`
**What:** Move file, update any references. Consider whether `.github/copilot-instructions.md` needs to stay as a redirect for Copilot's auto-discovery.

### Task 12: Retire agentGuide.md
**Files:** `agentGuide.md`
**What:** After all merges verified, either delete or replace with pointer to CONVENTIONS.md.

### Task 13: Remove stale content from CLAUDE.md
**Files:** `CLAUDE.md`
**What:** Remove hardcoded `/data/code/AgentHive` and `/data/code/worktree/hermes-andy` paths. Use CWD-based conventions. Update "as of 2026-04-11" date or remove.

---

## Acceptance Criteria

1. All proposal-type definitions, RFC workflow states, and maturity levels exist in exactly ONE canonical file (CONVENTIONS.md).
2. AGENTS.md and CLAUDE.md each contain a clear pointer to CONVENTIONS.md as the precedence winner.
3. agentGuide.md unique content (overseer, governance, escalation) is merged into CONVENTIONS.md.
4. copilot-instructions.md is moved to docs/reference/ and no longer serves as an agent instruction file.
5. Worktree path convention is consistent across all files (CWD-based, not hardcoded).
6. No agent-facing instruction file contains content that contradicts another.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Removing agentGuide.md breaks CONVENTIONS.md cross-reference | CONVENTIONS says "read agentGuide.md" | Update CONVENTIONS.md to remove the cross-reference after merge |
| Copilot stops getting instructions if copilot-instructions.md moves | Copilot won't find its instructions | .github/copilot-instructions.md may need to stay as symlink or redirect |
| Claude Code expects CLAUDE.md as-is | Claude tool auto-loads CLAUDE.md | Keep CLAUDE.md as valid file; just make it thinner + pointer |
| Codex expects AGENTS.md as-is | Codex auto-loads AGENTS.md | Keep AGENTS.md as valid file; just make it thinner + pointer |
| agentGuide.md model-to-workflow table references unavailable models | Misleading agent spawning | Verify against live model_routes before keeping; drop if stale |
