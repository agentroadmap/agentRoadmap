# hiveCentral Database Review — P429/P755 Status

⚠️ **ACCURACY CORRECTION:** Previous review contained hallucinated table names. This version reflects actual schema introspection.

## Summary ⏳ PARTIAL

The **hiveCentral** control-plane database is **deployed with DDL** but has **significant gaps**:
- ✅ All 17 schemas created
- ✅ Base table structure in place (40 logical tables)
- ❌ **Partition counting inflated metrics** — system shows 160+ "tables" but ~100 are partition children (_p* partitions + _default parent templates)
- ❌ **Missing tables cited in P787/P788:** No `control_runtime_service`, no `agency_service_definition`, no `workforce.agent_capability`
- ⏳ **Baseline seed data not populated** — blocking P429 multi-project integration tests

### Key Facts (Corrected)
- **Database Name:** `hiveCentral` (live @ 127.0.0.1:5432)
- **Design Doc:** `data-model.md` (950 lines, contains outdated table names)
- **DDL Files:** ~17 files in `database/ddl/hivecentral/` (001-015 + 000-roles)
- **Schemas Created:** 17 (core, agency, control_identity, control_model, control_project, control_credential, workforce, template, tooling, sandbox, dependency, messaging, observability, governance, efficiency, partman, public)
- **Logical Base Tables:** 40 across all schemas (excluding partitions and _default tables)
- **Partition Inflation:** System shows 160+ due to time-series partitioning (_p20260501, _p20260601, _default parent templates)
- **Distribution (Base Tables Only):**
  - `governance` — 3 logical tables (decision_log, event_log, policy_version + 10 partitions each)
  - `observability` — 1 logical table (model_routing_outcome, no time-series partitions yet)
  - `efficiency` — 3 logical tables (cost_ledger_summary, efficiency_metric, route_token_budget + 10 partitions each)
  - `control_model` — 2 logical tables (model, model_route)
  - `control_project` — 5 logical tables (project, project_db, project_host, project_member, project_sandbox_grant, project_worktree)
  - Others: 20 tables across core, agency, credential, identity, messaging, tooling, sandbox, workforce, template

---

## Design Highlights

## Design Highlights & Gaps

### Architectural Patterns Applied ✅
1. **Catalog Hygiene Block** — Every table has `owner_did`, `lifecycle_status`, `deprecated_at`, `retire_after`, `notes`, `created_at`, `updated_at`
2. **Append-Only Immutability** — Audit and observability tables block UPDATE/DELETE via triggers + REVOKE
3. **Time-Series Partitioning** — High-volume tables partitioned monthly via pg_partman (note: inflates table count)

### Actual Tables (Corrected from Schema Introspection)

#### Core Infrastructure
✅ `core.installation` — hiveCentral metadata
✅ `core.host` — compute hosts, max spawns, lifecycle
✅ `core.runtime_flag` — platform-wide feature flags
✅ `core.service_heartbeat` — service health monitoring
✅ `core.os_user` — OS user mappings

#### Identity & Access
✅ `control_identity.audit_action` — immutable audit log
✅ `control_identity.did_document` — W3C DIDs for every principal
⚠️ **MISSING:** `control_identity.principal` — agent/human/service identity registry (referenced in design but not created)
⚠️ **MISSING:** `control_identity.principal_key` — cryptographic credentials per principal

#### Agency & Workforce
✅ `agency.agency` — agent agencies (providers like "Anthropic")
✅ `agency.agency_session` — time-series, partitioned
✅ `agency.liaison_message` — time-series, partitioned
✅ `agency.liaison_message_kind_catalog` — liaison message types
✅ `workforce.agent` — live agent registration
✅ `workforce.agent_skill` — agent capabilities/skills
✅ `workforce.skill` — skill catalog
✅ `workforce.skill_grant_log` — audit trail
⚠️ **MISSING:** `workforce.agent_capability` (design called this out; actual schema uses `agent_skill`)
⚠️ **MISSING:** `workforce.agent_trust` — trust levels + audit trail

#### Model Routing & Dispatch
✅ `control_model.model` — model catalog (Claude, GPT-4, etc.)
✅ `control_model.model_route` — enabled routes (model+provider+host)
✅ `control_model.host_model_policy` — routing policy per host
⚠️ **MISSING:** `control_runtime_service` (P787 requires this but doesn't exist; code currently uses env vars)

#### Project & Cost Management
✅ `control_project.project` — project registry (pointer to tenant DB)
✅ `control_project.project_db` — tenant DB connection metadata
✅ `control_project.project_host` — host assignments
✅ `control_project.project_member` — project team/roles
✅ `control_project.project_sandbox_grant` — sandbox access
✅ `control_project.project_worktree` — worktree assignments

#### Observability & Efficiency
✅ `observability.model_routing_outcome` — dispatch audit trail (no time-series yet)
✅ `efficiency.cost_ledger_summary` — cost rollup per project/agent, time-series
✅ `efficiency.efficiency_metric` — efficiency metrics, time-series
✅ `efficiency.route_token_budget` — token spend tracking
⚠️ **MISSING:** `efficiency.token_budget_ledger` (design cited this; actual table is `route_token_budget`)

#### Governance & Decision Logs
✅ `governance.decision_log` — immutable gate decisions, time-series
✅ `governance.event_log` — event stream, time-series
✅ `governance.policy_version` — versioned policies
⚠️ **MISSING:** `governance.compliance_audit` (design cited this; actual table is `compliance_check` but not found in introspection)

#### Credentials
✅ `control_credential.credential` — credential storage
✅ `control_credential.credential_grant` — credential access grants
✅ `control_credential.rotation_log` — rotation audit trail

#### Messaging
✅ `messaging.a2a_message` — agent-to-agent messages
✅ `messaging.a2a_dlq` — dead-letter queue
✅ `messaging.a2a_message_archive` — message archive

#### Sandbox & Tooling
✅ `sandbox.sandbox_definition` — sandbox environment specs
✅ `sandbox.egress_rule` — egress firewall rules
✅ `sandbox.mount_grant` — volume mount access
✅ `tooling.tool` — tool registry
✅ `tooling.cli_tool` — CLI tool definitions
✅ `tooling.tool_grant` — tool access grants

#### Templates
✅ `template.gate_definition` — gate workflow templates
✅ `template.state_name` — state name registry

---

## P755 (Umbrella B, B1) & P429 Status

### Critical Issues Blocking Integration

**Status:** ⏳ **NOT COMPLETE — P787/P788/P501 blockers remain**

#### 1. Missing `control_runtime_service` Table
- **Impact:** P787 (runtime endpoint resolution) already committed code expecting this table, but it doesn't exist in hiveCentral
- **Status:** Codex flagged this gap; Copilot's review missed it
- **Action Required:** Add to DDL or update P787 to use placeholder until P501 seeding

#### 2. Table Name Drift
- Design doc cited outdated names; actual schema differs (e.g., `route_token_budget` vs `token_budget_ledger`)
- `data-model.md` (950 lines) needs audit and correction before it can serve as source of truth

#### 3. Missing Identity Registry
- `control_identity.principal` (agent/human/service canonical identity) not created
- Required for agent trust/authorization across projects
- Only `did_document` created; principal registry missing

#### 4. Workforce & Agency Gaps
- `workforce.agent_trust` not created (required for per-project agent authorization)
- `agency_service_definition` missing (blocks service capability discovery)
- These are structural blockers for P748+ (role-based assignment)

#### 5. Partition Counting Inflates Metrics
- Reported "160+ tables" but only ~40 logical base tables
- Remaining entries are partition children (_p20260501, _default parents)
- Partition scheme is correct; metrics reporting is misleading
- System is actually **smaller than initially believed** and requires more schema extension for P501

### P755 Classification (Corrected)

**Control-Plane Tables (hiveCentral):** 40 base tables across 17 schemas
- ✅ Correctly isolated from tenant databases
- ✅ Role-based access control in place (agenthive_orchestrator, agenthive_agency, agenthive_observability)
- ⚠️ Incomplete — missing 4-5 tables required by dependent proposals (P787, P748+)

**Tenant-Scoped Tables (per-project DB):** ~140 tables in `agenthive` (first tenant)
- ✅ Schema design exists
- ⏳ P501 must migrate these without mixing with control-plane
- ⏳ New tenant databases not yet provisioned

---

---

## Deployment Checklist

| Step | Status | Notes |
|---|---|---|
| Database creation | ✅ | `CREATE DATABASE hiveCentral;` |
| Roles & permissions | ✅ | 000-roles.sql applied (agenthive_orchestrator, agenthive_agency, agenthive_observability) |
| Schema 001-015 DDL | ⚠️ PARTIAL | 40 base tables deployed; 4-5 required tables missing (control_runtime_service, principal, agent_trust, compliance_check) |
| pg_partman extension | ✅ | Installed; time-series tables partitioned monthly |
| **Baseline seed data** | ❌ | **BLOCKING:** Control-plane seed (agencies, models, routes, hosts, projects) — required by P501 migration |
| **Missing tables** | ❌ | control_runtime_service (P787), principal registry (identity), agent_trust (workforce), compliance_check (governance) |
| Cross-tenant FK validation | ⏳ | Deferred to P501 integration tests |

---

## What Actually Works vs What's Missing

### ✅ Working
- Time-series infrastructure (partman, monthly rotation)
- Role-based access control (RBAC schema)
- Core infrastructure (hosts, flags, heartbeats)
- Model routing core (model, model_route tables)
- Project metadata (project, project_db, project_member tables)
- Message queuing (a2a_message, DLQ)
- Basic governance (decision_log, event_log)

### ❌ Blocking P787/P788/P748+
- `control_runtime_service` table — P787 code expects this; doesn't exist
- `control_identity.principal` — canonical agent identity missing
- `workforce.agent_trust` — agent authorization per project missing
- `governance.compliance_check` — table appears in design but not created

### ⏳ Needs P501 Data Migration
- **Agency seed data** — "Anthropic", "OpenAI", etc. not inserted
- **Model seed data** — Claude, GPT-4, etc. not inserted
- **Host routing policy** — no default routes assigned
- **Project references** — no tenant DB pointers

---

## Root Causes of Accuracy Issues

1. **Design-Implementation Gap**
   - `data-model.md` designed with 12 schemas + 160+ conceptual entities
   - Actual DDL deployed 17 schemas with 40 base tables
   - Many proposed tables (principal, agent_trust, compliance_audit) not yet created

2. **Partition Inflation in Metrics**
   - Time-series tables expanded to ~10 partition children each
   - `pg_partman` creates parent + _default template + monthly children
   - Reporting system counted all as "tables" instead of "logical partitions"

3. **Soft FKs During Transition**
   - Cross-DB references cannot be enforced by PostgreSQL
   - Application layer must validate `project_id` pointers to tenant DBs
   - Actual enforcement deferred to P501 when all tenants online

---
