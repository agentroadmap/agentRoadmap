> **Type:** design note | architecture  
> **MCP-tracked:** P455 (hive CLI redesign, Round 2)  
> **Source-of-truth:** This document  

# P455 Round 2: Resolutions to Open Questions (§11)

## Context

The contract `cli-hive-contract.md` §11 left two open questions for Round 2 implementers. This document resolves both with justification.

---

## 1. Recipes: Static or Dynamic?

**Resolution: Static (bundled in source).**

**Justification:**

- **Simplicity wins:** Recipes are curated, not auto-generated. New recipes require thought, testing, and documentation. They change infrequently (~quarterly). Bundling eliminates a network dependency and makes CLI self-contained.
- **Agent resilience:** AI agents can run recipes offline or when control-plane is degraded. Network latency disappears (recipes load in <1ms). Agents never have to implement fallback logic for "recipes API is down."
- **Bootstrap problem:** Agents call `hive --recipes` at session start to understand the CLI. If that call requires the control-plane (which itself is deployed via recipes), we have a chicken-and-egg problem for initial cluster bootstrap.
- **Auditability:** Recipes are version-controlled and tracked per CLI release. An agent can pin to CLI version 0.5.0 and know exactly which recipes are available without polling.

**Cost:** Recipe updates require a CLI release. Mitigated by:
- Recipes are low-code (3–5 lines per recipe; 8 recipes = ~40 lines total).
- If operators discover a better recipe pattern, they file an issue → PR → release cycle is fast.
- Documentation/tutorials can supplement recipes without waiting for CLI updates.

---

## 2. `hive doctor --remediate`: Auto-fix or Suggest Only?

**Resolution: Suggest only (no auto-fix).**

**Justification:**

- **Safety first:** Some remediations are destructive (`hive proposal release --force`, `hive lease expire`). Auto-execution risks orphaning work or breaking ongoing development. A suggested command is low-friction for operators but preserves agency.
- **Auditability:** Every remediation should be logged in operator audit trails (`operator_action_log`, `proposal_event`). Suggesting a command ensures the operator reviews it before execution. Auto-fix would require async audit logging and makes blame tracing harder.
- **Operator control:** Operators expect to review and approve fixes for system health issues. "Suggested" is the right mental model—agent runs `hive doctor`, reads the suggestion, and decides. If 90% of suggestions are "yes, do it," operators can script a follow-up.
- **Partial failures:** Some remediations have preconditions. E.g., "release orphan lease" only works if the lease holder hasn't already moved on. A suggestion lets the operator verify the precondition before running; auto-fix might fail silently.

**Cost:** One extra manual step per remediation. Mitigated by:
- Suggestions are copy-paste commands (no parsing needed).
- Operators can create a `.sh` script to batch-apply common suggestions.
- Long-term: if a suggestion becomes routine, CLI can add a `--apply` flag (mutating) that requires explicit opt-in.

---

## Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Recipes | Static (bundled) | Simpler, offline-safe, bootstrap-friendly, version-locked |
| Doctor remediate | Suggest only | Safe, auditable, operator-controlled |

