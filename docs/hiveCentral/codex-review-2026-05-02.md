# Codex Review — hiveCentral Data Model

Date: 2026-05-02

## Summary

The `data-model.md` direction is sound: hiveCentral should become the singleton control-plane database for platform-wide identity, agencies, model routing, projects, policies, cost, and observability, while tenant DBs hold project-local proposal/message state.

The main gap is not the logical model; it is the transition contract. Current code and migrations still write many control-plane concepts into `roadmap.*` in the existing `agenthive` DB. New work must be explicit about whether it is:

1. A compatibility bridge in `agenthive.roadmap`.
2. Canonical hiveCentral DDL under `database/ddl/hivecentral/`.
3. Runtime code that can read both during cutover.

Without that distinction, new proposals will keep adding control-plane tables to the tenant DB and make P429 harder.

## Critical Findings

### 1. Runtime endpoint registry needs a canonical hiveCentral home

P787 currently adds `roadmap.control_runtime_service` as a transition-compatible bridge. That satisfies today’s code shape, but it conflicts with the hiveCentral design if treated as canonical.

Recommended Claude follow-up:

- Add a hiveCentral core table for runtime services, likely `core.control_runtime_service` or fold it into `core.runtime_flag` only if typed service URLs are supported cleanly.
- Include `service_key`, `url`, `host_id`, `lifecycle_status`, timestamps, and `pg_notify('runtime_endpoint_changed')`.
- State explicitly that `database/migrations/053-p787-control-runtime-service.sql` is a temporary compatibility migration for the current single-DB phase.

### 2. Naming drift: roadmap/current tables vs hiveCentral schemas

The design uses schema names like `core`, `agency`, `control_model`, `control_credential`, while existing code uses `roadmap.*`, `roadmap_workforce.*`, and `model_metadata/model_routes`.

Recommended Claude follow-up:

- Add a mapping table from current schema/table to target hiveCentral schema/table.
- Mark each mapping as `move`, `rename`, `split`, `tenant-stays`, or `bridge-only`.
- Use this mapping to drive P501/P757/P759 rather than relying on prose.

### 3. P787 query shape must match migration shape

The current P787 implementation initially queried `endpoint_url`, while the migration creates `url`. I corrected the runtime query locally to `SELECT url`.

Recommended Claude follow-up:

- Standardize on `url` unless hiveCentral DDL picks a different canonical name.
- If the canonical hiveCentral table uses `endpoint_url`, then update the bridge migration and tests together.

### 4. Agency route policy design conflicts with newer normalized model

Older D-series proposals describe `agency_route_policy` with text arrays of allowed/forbidden route providers. The hiveCentral model describes `agency_route_policy` as normalized rows with `agency_id`, `route_id`, `scope`, `project_id`, and `allowed`.

Recommended Claude follow-up:

- Update P768 to the normalized hiveCentral model before implementation.
- Avoid adding new text-array policy tables unless explicitly marked as compatibility views.
- Provide a compatibility view if existing code expects `allowed_route_providers`/`forbidden_route_providers`.

### 5. Workflow naming is still inconsistent

The doc uses `workflow_template`, `state_name`, and `gate_definition`. Recent P706/P780 work uses `roadmap.workflow_stages` and unified RFC/hotfix stage vocabulary.

Recommended Claude follow-up:

- Decide whether canonical hiveCentral table is `state_name` or `workflow_stage`.
- If `state_name` remains, document how it maps to current `roadmap.workflow_stages`.
- Keep the invariant: no code hardcodes workflow stage lists; render and route from DB rows ordered by ordinal/stage_order.

## Proposed Transition Rules

Use these rules for new proposals until P429/P501 land:

- Canonical control-plane DDL belongs in `database/ddl/hivecentral/`.
- Compatibility migrations in `database/migrations/` must say which hiveCentral table they bridge to.
- Runtime readers should prefer env override, then hiveCentral/control DB, then compatibility table only where explicitly needed.
- Tenant DB additions must not introduce platform-wide registries unless marked temporary.
- Every bridge table needs a sunset proposal or a mapping row in the control-plane table register.

## Immediate Proposal Guidance

### P787

Keep the current bridge implementation if needed for CI and local runtime, but add canonical hiveCentral DDL for runtime services before calling the architecture complete.

### P768/P767/P770-P773

Rebase the route-policy proposals on normalized `model_route`, `agency_route_policy`, `project_route_policy`, and `route_token_budget` tables from hiveCentral. Do not implement array-based provider allowlists as canonical tables.

### P788

When wiring `hive-cli`, target the control-plane reader abstraction, not raw `roadmap.*` queries, where possible. CLI domains should survive the move from `agenthive.roadmap` to hiveCentral schemas.

### P789

Still valid and independent. Migration numbering hygiene matters more now because bridge migrations and hiveCentral DDL are both active.

## Bottom Line

Claude’s data model is directionally correct, but implementation proposals need a stricter bridge-vs-canonical distinction. The highest-risk mistake is continuing to add permanent control-plane tables to the current tenant DB while simultaneously designing hiveCentral as the control-plane source of truth.
