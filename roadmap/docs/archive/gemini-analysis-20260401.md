✦ Based on a comprehensive review of the codebase, including the current implementations in src/mcp/ and the architectural specifications in roadmap/mcp/MCP-TOOL-SPEC.md and roadmap/manifest.json, the project is currently in an incomplete transitional state. You are migrating from a local-file-first architecture to
  a Postgres-backed state engine, but the MCP layer has not fully caught up.

  Here is the gap analysis, highlighting the most critical priority items for your team:

  1. Architectural Duality (The "Split-Brain" Problem)
  The Gap: src/mcp/server.ts currently registers both the legacy file-based tools (e.g., registerProposalTools) and the new Postgres-backed tools (e.g., registerSdbProposalTools). This creates an "identity crisis" for agents—they are presented with duplicate tool functionalities, one of which persists to the new
  DB while the other mutates local files.
  Priority Action: 
   * Deprecate File-Based Tools: Phase out the direct file-manipulation MCP tools. Agents should exclusively use the Sdb tools to mutate the Postgres state. 
   * Implement sync_run: To keep the Markdown files updated for human readability, ensure that Postgres workflow actions trigger the sync_run export tool (as defined in the spec) to write changes back to the filesystem.

  2. MCP Tool Naming Misalignment
  The Gap: Your MCP-TOOL-SPEC.md strictly mandates short, domain-prefixed tool names (e.g., prop_create, agent_register, chan_list). However, the implementations in src/mcp/tools/proposals/sdb-index.ts and src/mcp/tools/agents/sdb-index.ts still use legacy verbose naming conventions (e.g., proposal_create,
  proposal_list).
  Priority Action:
   * Rename Postgres Tools: Update the names of all registered Postgres tools in sdb-index.ts files to match the exact specifications in MCP-TOOL-SPEC.md. This is critical before finalizing the new agent instructions, as it breaks the expected tool contract.

  3. Missing Postgres Domains in the MCP Server
  The Gap: According to the old generated bindings, the Postgres module had workflow helpers for spending, security, and memory. However, those domains were completely missing from the MCP server tool registrations (src/mcp/server.ts).
  Priority Action:
   * Implement Missing Handlers: Create src/mcp/tools/spending/sdb-index.ts, security/sdb-index.ts, and memory/sdb-index.ts.
   * Register Domains: Wire these new handlers into createMcpServer() so agents can utilize the spend_*, acl_*, and mem_* tools.

  4. Incomplete Proposal Domain Implementation
  The Gap: The proposal domain is the core of the system. The specification lists 14 tools (including version history, rollback, and granular acceptance criteria management). The current Postgres implementation (src/mcp/tools/proposals/sdb-index.ts) only registers 4 tools: proposal_list, proposal_get, proposal_create,
  and proposal_complete.
  Priority Action:
   * Flesh out prop_* tools: Implement the missing operations, specifically:
       * prop_update (for editing fields)
       * prop_transition (for moving through the RFC state machine)
       * prop_ac_add, prop_ac_check, prop_ac_remove (critical for the Verification loop)
       * prop_decision (for logging ADRs)

  5. Broken Autonomy Loop (Discovery -> Claim -> Verify)
  The Gap: As noted in your historical gap analysis (roadmap/docs/archive/gap-analysis.md), the "autonomy loop" relies on agents discovering ready work, taking out a lease, and proving arrival. While the Postgres tables exist (workforce_pulse, agent_memory), the MCP tools to interact with them (agent_pulse,
  agent_heartbeat) are either misconfigured or not fully integrated into the agent's expected loop.
  Priority Action:
   * Fix Agent Registration/Leasing: Ensure agent_register and the task-claiming mechanism correctly map an agent's identity to an active proposal in Postgres, updating their workforce_pulse to prevent another agent from picking up the same task.

  Summary for the Team
  To unblock the workforce and realize the V2 vision, the team should immediately focus on aligning the Postgres MCP handlers with MCP-TOOL-SPEC.md (renaming tools) and implementing the missing 10 Proposal tools so that agents can actually work through a task's lifecycle via the database rather than legacy local
  files.
