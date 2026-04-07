
# Data Model Review (Claude)

## Product Development

**Score:** 82 / 100

### Strengths
- Proposal lifecycle — `proposal`, `proposal_state_transitions`, `proposal_valid_transitions`, `proposal_decision`
- DAG dependency queue — `proposal_dependencies` + `v_proposal_queue` with blocker-count ranking
- Workflow engine — `workflow_templates`, `workflow_stages`, `workflow_transitions`, `workflows`, `proposal_type_config`
- Acceptance criteria, reviews, milestones, versioning, discussions, labels, attachments
- Claim/lease model — `proposal_lease` with TTL, `v_active_leases`

### Warnings
- No `proposal_type_config.schema` column — can't validate required fields differ per type (e.g. RFC needs motivation+design, bug-fix doesn't)
- `workflow_stages.maturity_gate` is a bare int — no table defining what each level means or how it's scored

### Gaps
- No `proposal_template` table — agents can't pre-fill a new proposal from a type-specific content scaffold
- No cycle detection guard on `proposal_dependencies` — DAG can become a graph with circular blocks, breaking queue logic
- No `proposal_event` / outbox table — state changes have no durable event for downstream pipeline consumers to subscribe to

## Workforce Management

**Score:** 74 / 100

### Strengths
- Agent registration — `agent_registry` with type, role, skills, status, GitHub handle
- Team structure — `team`, `team_member` with role
- Resource allocation — `resource_allocation` for API keys, worktrees, workspaces, MCP tools
- ACL — `acl` table binds subjects to actions on resources
- GitHub profile sync — `agency_profile` with repo, branch, commit sha, sync status
- Budget — `spending_caps` (daily/monthly limits + auto-freeze), `budget_allowance` (named envelopes)

### Warnings
- `acl` has no expiry — grants are permanent; no time-bounded or project-scoped permission rows
- `workflow_roles.clearance` is a bare int with no FK to acl — role-to-permission binding is implicit, not enforced
- No agent availability / loading profile — can't model capacity, workload, or concurrency limits per agent

### Gaps
- No `agent_capability_map` — skills jsonb on `agent_registry` is opaque; can't query "which agents can handle proposal type X at stage Y"
- No team budget envelope — `budget_allowance.scope='team'` exists but no FK to team; referential integrity is missing

## Efficiency

**Score:** 71 / 100

### Strengths
- Model catalogue — `model_metadata` with cost, context window, capabilities, updated_at
- Model routing — `model_assignment` by proposal type + pipeline stage, priority-ranked
- Agent memory — `agent_memory` with 4 layers, TTL eviction, pgvector HNSW index
- Context tracking — `context_window_log` with generated total_tokens, truncation flag
- Cache accounting — `cache_write_log` with hit count, cost saved, last hit timestamp
- Spend ledger — `spending_log` at 6dp precision, linked to model + budget envelope

### Warnings
- `agent_memory` has no compaction strategy — episodic layer grows unbounded; no merge/summarise hook or max-row-per-agent guard
- `cache_write_log.hit_count` is updated in place — concurrent cache hits will race; should be an append log or use `SELECT ... FOR UPDATE`
- No `run_log` table — `run_id` is a free text key on several tables with no central run record (start time, input, output, status)

### Gaps
- No prompt/context template store — agents can't retrieve versioned system prompt templates or retrieve previously optimised context preambles
- No embedding index registry — body_vector columns on proposal and discussions have no table recording which model produced the embedding or when it was last refreshed

## Utility

**Score:** 68 / 100

### Strengths
- MCP tool catalogue — `mcp_tool_registry` + per-agent `mcp_tool_assignment` with enabled flag
- Agent messaging — `message_ledger` with channel routing, type check, from-agent FK
- Fan-out notifications — notification targeting tui/web/mobile/all surfaces
- User sessions — `user_session` with surface, token, preferences, expiry
- Attachments — `attachment_registry` with content hash, vision summary, uploader FK

### Warnings
- `notification` has no delivery receipt / `acknowledged_at` — no way to know if TUI/Web/Mobile actually consumed the event
- `message_ledger` is append-only with no threading model — no concept of a conversation thread or channel history cursor for TUI/Web replay
- `user_session.preferences` is opaque jsonb — no schema; UI surface can't query "all agents who prefer dark mode" or "agents with compact view"

### Gaps
- No `webhook_subscription` table — external systems (CI, dashboards) can't register to receive proposal events; all integration is polling
- No `scheduled_job` / `cron_log` table — lease expiry reaper, memory TTL purge, agency_profile sync are mentioned in comments but have no scheduler record
- No `audit_log` table separate from `proposal.audit` jsonb — cross-entity audit trail (who changed ACL, who froze a budget) has no queryable home

---

## Overall Observations

Solid foundation, with consistent gaps in the same three areas across all pillars.

**The pattern is clear — every pillar has good entity coverage but is missing the same category of things:**

- **Operational infrastructure** (gaps in Utility and Efficiency): there's no scheduler record, no webhook outbox, no central run log, and no audit trail for non-proposal entities. The system has the data but no way for external consumers or ops tools to reliably subscribe to or replay events.
- **Semantic richness** (gaps in Workforce and Product Dev): skills as opaque jsonb means you can't query capability matching. `proposal_type_config` has no content schema, so you can't enforce that an RFC has motivation and design but a bug report doesn't. The maturity gate is a number without a definition table.
- **Concurrency and integrity edge cases** (warns across Efficiency): the `cache_write_log` hit counter will race under load, the DAG has no cycle guard, and memory has no compaction hook.

**The three most impactful additions to consider next, in order of risk:**

1. The DAG cycle guard (a trigger or constraint — a circular dependency will silently break `v_proposal_queue`)
2. A central `run_log` table to anchor `run_id` across context/cache/spending tables
3. A `scheduled_job` table so the maintenance jobs that comments promise (lease reaper, TTL purge, profile sync) are actually tracked and retryable.

---

## Next Steps: Schema Additions & Reasoning

**Summary:** 9 new tables, 7 alter table changes, 3 new triggers, and 2 new views

### Key Additions (with reasoning)

#### DAG Cycle Guard
- **Trigger:** `fn_check_dag_cycle` (BEFORE INSERT OR UPDATE on `proposal_dependencies`). Walks ancestors of `to_proposal_id` via recursive CTE; raises exception if `from_proposal_id` is found. Prevents circular blocks from corrupting `v_proposal_queue`.

#### Proposal Template
- **Table:** `proposal_template` — Type-specific content scaffolds. FK to `proposal_type_config(type)`. Stores default markdown for each structured field (summary, motivation, design…). `fn_spawn_workflow` can pre-fill proposal fields from matching template on insert.

#### Proposal Event Outbox
- **Table:** `proposal_event` — Transactional outbox. Appended atomically by state-change trigger alongside `proposal_state_transitions`. Columns: event_type, payload jsonb, dispatched_at (null until consumed). Pipeline consumers poll and mark dispatched. Decouples DB writes from downstream fanout.

#### Maturity Level Definition
- **Table:** `maturity_level_def` — Lookup table giving each integer maturity level a name, description, and minimum score required. Replaces bare int4 semantics in `workflow_stages.maturity_gate`. FK from `workflow_stages.maturity_gate` → `maturity_level_def(level)`.

#### Proposal Type Config
- **Alter Table:** `proposal_type_config` — Add `required_fields text[]` and `optional_fields text[]`. Allows per-type content schema enforcement — RFC type requires motivation+design, bug type doesn't. Validated by a trigger on proposal insert/update.

### Workforce Management
- **Table:** `agent_capability` — Structured capability rows replacing opaque skills jsonb. Columns: agent_id, capability (controlled term), proficiency (1-5), verified_by, verified_at. Enables "find agents who can handle proposal type X at stage Y" queries. FK to agent_registry.
- **Table:** `agent_workload` — Current capacity snapshot: active lease count, context load score, availability window. Updated by proposal_lease insert/release triggers. Enables load-aware lease routing — the system can pick the least-loaded capable agent.
- **Alter Table:** `acl` — Add `expires_at timestamptz NULL` and `scope_ref text NULL` (proposal display_id, team name, or workflow name). Allows time-bounded grants and project-scoped permissions. A partial index on expires_at WHERE expires_at IS NOT NULL supports a cleanup job.
- **Alter Table:** `budget_allowance` — Add `team_id int8 NULL REFERENCES roadmap.team(id)`. Currently scope='team' uses scope_ref text with no FK — referential integrity is missing. The FK makes team budget envelopes queryable and cascade-safe.
- **Trigger:** `fn_sync_workload` — AFTER INSERT OR UPDATE on proposal_lease. Upserts agent_workload.active_lease_count for the affected agent. Keeps capacity view current without a scheduled job.

### Efficiency
- **Table:** `run_log` — Central run record anchoring the run_id text key used on spending_log, context_window_log, and cache_write_log. Columns: run_id text PK, agent_identity, proposal_id, model_name, started_at, finished_at, status, input_summary text. Makes cross-table joins on run_id safe and queryable.
- **Table:** `prompt_template` — Versioned system prompt and context preamble store. Columns: name, version, proposal_type (nullable), pipeline_stage (nullable), content text, is_active bool. Agents retrieve the highest-versioned active template matching their type+stage. Unique on (name, version).
- **Table:** `embedding_index_registry` — Tracks which model produced each body_vector column and when it was last refreshed. Columns: table_name, row_id int8, model_name, embedding_dim int4, refreshed_at. Allows stale-embedding detection when a model is upgraded. PK on (table_name, row_id).
- **Restructure:** `cache_write_log` — Replace mutable hit_count and cost_saved_usd columns with a separate append-only `cache_hit_log` table (cache_write_id FK, tokens_read, cost_saved_usd, hit_at). Removes the race condition. Counts and totals become derived aggregates. cache_write_log becomes immutable.
- **Alter Table:** `spending_log`, `context_window_log`, `cache_write_log` — Change run_id text to run_id text REFERENCES roadmap.run_log(run_id) ON DELETE SET NULL. Turns a free-text field into a real FK, enforcing run integrity across all three tables.

### Utility
- **Table:** `scheduled_job` — Scheduler registry and execution log. Columns: job_name, cron_expr, last_run_at, last_status, last_error, next_run_at, is_enabled. Covers lease reaper, memory TTL purge, agency_profile sync, embedding refresh. Makes maintenance jobs observable and retryable.
- **Table:** `webhook_subscription` — External system event subscriptions. Columns: endpoint_url, event_types text[], secret_hash text, is_active bool, last_delivery_at, failure_count int4. Fed from proposal_event outbox. Allows CI systems, dashboards, and external tools to receive proposal events without polling.
- **Table:** `audit_log` — Cross-entity audit trail for non-proposal mutations. Columns: entity_type, entity_id text, action, changed_by, changed_at, before jsonb, after jsonb. Triggered on ACL changes, budget freezes, agent suspension, resource allocation changes. proposal.audit jsonb remains for proposal-specific history; this covers the rest.
- **Table:** `notification_delivery` — Delivery receipt per surface per notification. Child of notification. Columns: notification_id FK, surface, delivered_at, acknowledged_at, failure_reason. Replaces the single is_read bool on notification — a message can be delivered to web but not yet mobile.
- **Alter Table:** `notification` — Drop is_read and read_at (moved to notification_delivery). Add source_event_id int8 NULL REFERENCES roadmap.proposal_event(id) to link notifications back to the event that generated them.
- **View:** `v_undelivered_notifications` — Joins notification with notification_delivery to surface messages where delivered_at IS NULL or failure_reason IS NOT NULL. Used by the push dispatcher and dead-letter monitor.
- **Trigger:** `fn_audit_sensitive_tables` — AFTER INSERT OR UPDATE OR DELETE on acl, spending_caps, agent_registry, resource_allocation. Writes before/after snapshots to audit_log. Uses to_jsonb(OLD) and to_jsonb(NEW) — no per-column enumeration needed.

---

## Notable Implementation Notes

- **`proposal_event` outbox** is probably the highest-leverage addition. Right now, a status change writes to `proposal_state_transitions` and the `audit` jsonb, but nothing downstream can reliably consume it — anything reading the state change table is polling with no cursor. The outbox pattern writes the event atomically in the same transaction as the state change, then a dispatcher marks it consumed. `webhook_subscription` feeds from it too, so external CI pipelines get push delivery instead of polling.
- **`cache_write_log` restructure** is the one change that fixes a correctness bug, not just a gap. Two agents hitting the same cache key concurrently will both read-modify-write `hit_count` and produce a wrong total. Making `cache_hit_log` append-only means the aggregate is always correct and you get a full hit timeline for free.
- **`run_log`** is the connective tissue that makes the three efficiency tables (`spending_log`, `context_window_log`, `cache_write_log`) actually joinable. Right now `run_id` is just text — you can write anything and it references nothing. Turning it into a real FK with a central run record means you can ask "what did this specific agent run cost, how many tokens did it use, and did it hit cache?" in a single join.
- **`agent_capability`** vs `skills jsonb` — the jsonb column is fine for display but useless for routing. The structured table lets the lease system ask "which active agents have `capability = 'python'` with `proficiency >= 3` and `active_lease_count < 2`?" That query is impossible against opaque jsonb.

### Additional Details

- `cache_write_log` restructure — `hit_count`, `cost_saved_usd`, `tokens_read`, and `last_hit_at` are all dropped and replaced by `cache_hit_log`. The migration is non-destructive to `cache_write_log` itself; existing write records survive, they just lose the mutable aggregate columns. If you have data in those columns you want to preserve, snapshot them before applying.
- Notification migration — the `INSERT INTO notification_delivery` block migrates existing is_read/read_at data before the DROP COLUMN. Rows where surface = 'all' are mapped to 'web' as a safe default since the delivery table needs a specific surface. Check your existing data if you have 'all' rows with meaningful read state.
- `fn_validate_proposal_fields` uses `EXECUTE format('SELECT ($1).%I::text', v_field)` to dynamically dereference the field name from required_fields[] without a column-by-column CASE. This is safe against SQL injection because %I quotes the identifier, but the required_fields values themselves should be controlled — only actual column names of proposal should appear there.
- `scheduled_job` seeds 7 jobs with cron expressions that match the maintenance tasks referenced in v2 comments. The webhook_dispatcher runs every minute (`* * * * *`) since outbox latency matters; everything else is hourly or daily.

