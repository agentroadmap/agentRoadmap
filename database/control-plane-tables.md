# Control-Plane Table Classification Register

**Umbrella B / P755 — First deliverable**  
Updated: 2026-05-01  
Owner: platform team

This register classifies every table in the AgentHive database by boundary type,
identifying which tables belong to the control plane (shared, cross-project) versus
tenant-scoped (per-project), compatibility shims, or candidates for drop.

The target topology (P429) extracts a `hiveCentral` control-plane DB and recasts
`agenthive` as the first project-tenant DB. Tables marked **control-plane** will
migrate to `hiveCentral`; tables marked **tenant-scoped** stay in tenant DBs.

---

## Classification Legend

| Class | Meaning |
| :--- | :--- |
| **control-plane** | Shared platform state — lives in `hiveCentral` after P429 |
| **tenant-scoped** | Per-project data — lives in each tenant DB |
| **compatibility** | Bridge / shim kept for backward compat; has a cutover plan |
| **legacy/drop** | No active callers; safe to drop after P429 audit |

---

## Schema: `roadmap` (control-plane schema)

| Table | Class | Owning Proposal | Notes |
| :--- | :--- | :--- | :--- |
| `acl` | control-plane | P501 | Cross-project access control |
| `agency` | control-plane | P200 | Agent agency registry |
| `agency_liaison_session` | tenant-scoped | P200 | Per-project liaison sessions |
| `agent_error_catalog` | control-plane | — | Platform-wide error catalog |
| `agent_error_log` | tenant-scoped | — | Per-run error log |
| `agent_execution_span` | tenant-scoped | — | Execution telemetry |
| `agent_lifecycle_log` | tenant-scoped | — | Agent start/stop events |
| `agent_role_profile` | control-plane | P748 | Queue-role profiles keyed by workflow stage |
| `agent_role_profile_legacy` | legacy/drop | P748 | Renamed during P748 migration; drop after data verified |
| `app_config` | control-plane | P449 | Platform-level config (MCP URL, etc.) |
| `assistance_request` | tenant-scoped | — | Per-project assistance requests |
| `attachment_registry` | tenant-scoped | — | File attachments per proposal |
| `audit_log` | control-plane | P477 | Platform-wide operator audit log |
| `channel_identities` | control-plane | — | Messaging channel identities |
| `channel_subscription` | tenant-scoped | — | Per-agent channel subscriptions |
| `cli_builder_fallback_audit` | tenant-scoped | — | CLI fallback audit trail |
| `control_runtime_service` | control-plane | P787 | Runtime endpoint registry (MCP, daemon URLs) |
| `cubic_phase_roles` | control-plane | — | Cubic phase → role mapping |
| `cubic_state` | tenant-scoped | — | Per-cubic state machine |
| `cubics` | tenant-scoped | — | Cubic work units |
| `decision_explainability` | tenant-scoped | — | Gate decision explanations |
| `decision_queue` | tenant-scoped | — | Pending gate decisions |
| `dispatch_route_audit` | tenant-scoped | — | Model dispatch audit |
| `document_versions` | tenant-scoped | — | Document version history |
| `documents` | tenant-scoped | — | Proposal-linked documents |
| `e2e_run_log` | tenant-scoped | — | E2E test run logs |
| `e2e_section` | tenant-scoped | — | E2E test sections |
| `embedding_index_registry` | control-plane | — | Embedding index metadata |
| `error_catalog` | control-plane | — | Duplicate of agent_error_catalog; review for merge |
| `escalation_log` | tenant-scoped | — | Escalation events |
| `extracted_patterns` | control-plane | — | ML-extracted code patterns |
| `fallback_playbook` | control-plane | — | Fallback routing playbooks |
| `feature_flag` | control-plane | — | Feature flags |
| `feature_flag_audit` | control-plane | — | Feature flag change log |
| `gate_task_templates` | control-plane | — | Reusable gate task templates |
| `host_model_policy` | control-plane | P431 | Host-level route provider policy |
| `host_model_route_throttle` | control-plane | P431 | Per-host route throttle config |
| `knowledge_entries` | tenant-scoped | — | Per-project knowledge base |
| `liaison_message` | tenant-scoped | — | Liaison protocol messages |
| `liaison_message_kind_catalog` | control-plane | — | Message kind definitions |
| `liaison_poke_attempt` | tenant-scoped | — | Liaison poke tracking |
| `maturity` | control-plane | P774 | Maturity level definitions (reference) |
| `mcp_registry` | control-plane | P449 | MCP server registry |
| `mcp_tool_assignment` | tenant-scoped | — | Per-project MCP tool assignments |
| `mcp_tool_registry` | control-plane | P486 | MCP tool definitions |
| `mcp_tool_schema` | control-plane | P486 | MCP tool input schemas |
| `mentions` | tenant-scoped | — | @mention tracking |
| `message_ledger` | tenant-scoped | — | Channel message ledger |
| `migration_history` | control-plane | — | Applied migration tracking |
| `model_assignment` | tenant-scoped | — | Per-project model assignments |
| `model_metadata` | control-plane | P797 | Model capability catalog |
| `model_routes` | control-plane | P797 | Enabled routes per model+provider |
| `model_routing_outcome` | tenant-scoped | — | Dispatch outcome telemetry |
| `notification` | tenant-scoped | — | Per-agent notifications |
| `notification_delivery` | tenant-scoped | — | Notification delivery log |
| `notification_queue` | tenant-scoped | — | Pending notifications |
| `notification_route` | control-plane | — | Notification routing rules |
| `operator_audit_log` | control-plane | P477 | Operator action audit |
| `operator_token` | control-plane | P477 | Operator auth tokens |
| `project` | control-plane | P429 | Project registry (pointer to tenant DB) |
| `project_budget_cap` | tenant-scoped | — | Per-project budget caps |
| `project_capability_scope` | tenant-scoped | — | Per-project capability scoping |
| `project_memory` | tenant-scoped | — | Project-scoped memory store |
| `project_repair_queue` | tenant-scoped | — | Repair queue per project |
| `project_route_allowlist` | control-plane | — | Legacy; superseded by project_route_policy |
| `project_route_policy` | control-plane | P767 | Per-project route allowlist + token caps (Umbrella D) |
| `prompt_template` | control-plane | — | Shared prompt templates |
| `proposal_lifecycle_event` | tenant-scoped | — | Proposal lifecycle audit |
| `protocol_replies` | tenant-scoped | — | Protocol message replies |
| `protocol_threads` | tenant-scoped | — | Protocol message threads |
| `provider_health` | control-plane | — | Route provider health status |
| `reference_domain` | control-plane | — | Reference data domains |
| `reference_term` | control-plane | — | Reference terms (canonical vocab) |
| `reference_terms` | compatibility | — | Duplicate of reference_term; review for merge/drop |
| `research_cache` | tenant-scoped | — | Per-project research cache |
| `resource_allocation` | tenant-scoped | — | Resource allocation per run |
| `run_log` | tenant-scoped | — | Per-agent run log |
| `scheduled_job` | control-plane | — | Cron/scheduled job registry |
| `schema_drift_seen` | control-plane | — | Schema drift detection log |
| `schema_info` | control-plane | — | Schema version metadata |
| `spawn_briefing` | tenant-scoped | — | Agent spawn briefings |
| `spawn_briefing_config` | control-plane | — | Spawn briefing templates |
| `spawn_error_strike` | tenant-scoped | — | Spawn error backoff tracking |
| `spawn_summary` | tenant-scoped | — | Spawn outcome summaries |
| `spawn_tool_call_counter` | tenant-scoped | — | Per-spawn tool call counts |
| `tool_agent_config` | control-plane | — | Tool agent configuration |
| `trace_span` | tenant-scoped | — | Distributed trace spans |
| `transition_queue` | tenant-scoped | — | Proposal transition work queue |
| `ui_preferences` | tenant-scoped | — | Per-user UI preferences |
| `user_session` | tenant-scoped | — | Active user sessions |
| `webhook_subscription` | control-plane | — | Webhook endpoint subscriptions |
| `workflow_roles` | control-plane | — | Workflow role definitions |
| `workflow_stage_definition` | control-plane | P775 | Canonical stage definitions per workflow (stage registry) |
| `workflow_stages` | compatibility | P775 | Legacy stage references; migrate callers to workflow_stage_definition |
| `workflow_templates` | control-plane | P775 | Workflow template registry |
| `workflow_transitions` | control-plane | — | Allowed workflow state transitions |
| `workflows` | control-plane | — | Workflow definitions |
| `worktree_merge_log` | tenant-scoped | — | Git worktree merge audit |

---

## Schema: `roadmap_proposal`

| Table | Class | Owning Proposal | Notes |
| :--- | :--- | :--- | :--- |
| `frontier_audit_log` | tenant-scoped | — | Frontier model use audit |
| `gate_decision_log` | tenant-scoped | P744 | Gate decisions; triggers status advance |
| `gate_role` | control-plane | P744 | Gate role definitions |
| `gate_role_history` | control-plane | P744 | Gate role change history |
| `gate_stage_role` | control-plane | P744 | Stage → gate role mapping |
| `post_gate_change_requirement` | control-plane | P744 | Post-gate change rules |
| `proposal` | tenant-scoped | — | **VIEW** over proposal table; DML targets underlying table |
| `proposal_acceptance_criteria` | tenant-scoped | — | ACs per proposal |
| `proposal_decision` | tenant-scoped | — | Binding decisions per proposal |
| `proposal_dependencies` | tenant-scoped | — | Proposal dependency graph |
| `proposal_discussions` | tenant-scoped | — | Discussion notes |
| `proposal_event` | tenant-scoped | — | Proposal domain events |
| `proposal_labels` | tenant-scoped | — | Labels/tags |
| `proposal_lease` | tenant-scoped | — | Agent leases on proposals |
| `proposal_maturity_transitions` | tenant-scoped | — | Maturity change log |
| `proposal_milestone` | tenant-scoped | — | Proposal milestones |
| `proposal_projection_cache` | tenant-scoped | — | Cached projection data |
| `proposal_reviews` | tenant-scoped | — | Gate reviews |
| `proposal_state_transitions` | tenant-scoped | — | State transition log |
| `proposal_template` | control-plane | — | Proposal creation templates |
| `proposal_type_config` | control-plane | — | Proposal type → workflow mapping |
| `proposal_valid_transitions` | control-plane | — | Valid status transitions per type |
| `proposal_version` | tenant-scoped | — | Proposal version snapshots |
| `proposal_versions` | compatibility | — | Duplicate of proposal_version; review for merge/drop |
| `transition_queue` | tenant-scoped | — | Duplicate of roadmap.transition_queue; review |

---

## Schema: `roadmap_workforce`

| Table | Class | Owning Proposal | Notes |
| :--- | :--- | :--- | :--- |
| `agency_profile` | control-plane | P200 | Agency capability profiles |
| `agent_capability` | control-plane | — | Agent capability declarations |
| `agent_conflicts` | tenant-scoped | — | Agent conflict tracking |
| `agent_health` | tenant-scoped | — | Agent health metrics |
| `agent_heartbeat_log` | tenant-scoped | — | Agent heartbeat log |
| `agent_registry` | control-plane | — | Active agent registrations |
| `agent_runs` | tenant-scoped | — | Per-agent run records |
| `agent_trust` | control-plane | — | Agent trust levels |
| `agent_trust_audit` | control-plane | — | Trust change audit |
| `agent_workload` | tenant-scoped | — | Agent workload tracking |
| `authority_chain` | control-plane | — | Agent authority chain definitions |
| `projects` | compatibility | P429 | Mirror of roadmap.project; consolidate to roadmap.project |
| `provider_registry` | control-plane | — | Route provider registry |
| `squad_dispatch` | tenant-scoped | — | Squad-level dispatch records |
| `team` | control-plane | — | Agent team definitions |
| `team_member` | control-plane | — | Team membership |
| `transition_lease` | tenant-scoped | — | Transition operation leases |

---

## Schema: `metrics`

| Table | Class | Owning Proposal | Notes |
| :--- | :--- | :--- | :--- |
| `token_efficiency` | tenant-scoped | — | Per-project token efficiency metrics |

---

## Candidates for Immediate Action

### Drop candidates (legacy/no callers)
- `roadmap.agent_role_profile_legacy` — renamed by P748; verify no callers then drop
- `roadmap.reference_terms` — apparent duplicate of `reference_term`; merge or drop
- `roadmap_proposal.proposal_versions` — apparent duplicate of `proposal_version`; merge or drop
- `roadmap_proposal.transition_queue` — duplicate of `roadmap.transition_queue`

### Merge candidates
- `roadmap.error_catalog` + `roadmap.agent_error_catalog` — same concept, two tables
- `roadmap_workforce.projects` → `roadmap.project` (P429 consolidation)

### Cutover needed
- `roadmap.workflow_stages` → callers should use `roadmap.workflow_stage_definition` (P775)
- `roadmap.project_route_allowlist` → superseded by `roadmap.project_route_policy` (P767)

---

## Change Log

| Date | Change | Proposal |
| :--- | :--- | :--- |
| 2026-05-01 | Initial classification register created | P755 |
