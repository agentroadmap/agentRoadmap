# P071 — Migrations 007 & 008 grant public schema — all agents denied on roadmap schema

**Status:** COMPLETE
**Type:** issue
**Created:** 2026-04-07
**Last modified:** 2026-04-21

## Problem

Migrations 007 and 008 issue all `GRANT` statements against the `public` schema only:

- `007-agent-security-roles.sql` — creates `agent_read`, `agent_write`, `admin_write` roles and grants USAGE/SELECT/INSERT/UPDATE on `public` schema tables.
- `008-create-agent-users.sql` — creates per-agent login users (agent_andy, agent_claude_one, agent_gemini_one, agent_xiaomi_one, etc.) and grants them `agent_write` membership.

All production tables live in the `roadmap` schema, not `public`. Every agent user that connected received:

```
ERROR: permission denied for schema roadmap
```

This blocked all agent access to proposals, dependencies, reviews, spending logs, and every other operational table.

## Root Cause

Both migrations were written when the project used a flat `public`-schema model. When AgentHive migrated to multi-schema architecture (`roadmap`, `roadmap_proposal`, `roadmap_workforce`), the grant migrations were not updated. The `public`-schema grants became stale references to tables that no longer held production data.

## Fix — Migration 009

New migration: `scripts/migrations/009-roadmap-schema-grants.sql`

### What it grants

| Role | Privileges on `roadmap` schema |
|------|-------------------------------|
| `agent_read` | USAGE on schema, SELECT on ALL tables + sequences (current and future via DEFAULT PRIVILEGES) |
| `agent_write` | inherits agent_read + USAGE on sequences + INSERT/UPDATE on safe write surfaces (agent_registry, agent_memory, message_ledger, proposal_acceptance_criteria, proposal_dependencies, proposal_reviews, proposal_milestone, proposal_discussions, spending_log, notification, run_log) + INSERT on proposal + UPDATE on proposal content columns + INSERT/UPDATE/DELETE on proposal_dependencies + INSERT on spending_log + SELECT on type config and workflow tables |
| `admin_write` | ALL PRIVILEGES on all tables + sequences + DEFAULT PRIVILEGES for future tables |

### Key design decisions

1. **DEFAULT PRIVILEGES** — both agent_read and admin_write get default privileges for future tables, so new tables created in the `roadmap` schema are automatically accessible without another migration.

2. **Limited proposal UPDATE** — agents can update status, maturity, title, content fields, tags, and audit — but NOT id, type, owner, project_id, or other structural fields.

3. **SELECT on workflow tables** — agent_write needs read access to `proposal_type_config`, `workflow_templates`, `workflow_stages`, `workflow_transitions`, `proposal_valid_transitions`, and `proposal_state_transitions` because state transition validation requires querying allowed transitions at runtime.

## Verification

Applied and verified on production database `agenthive`:

```sql
-- Schema access confirmed
SELECT has_schema_privilege('agent_read', 'roadmap', 'USAGE');   -- t
SELECT has_schema_privilege('agent_write', 'roadmap', 'USAGE');  -- t

-- Table grants confirmed
SELECT grantee, table_schema, table_name, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'roadmap'
    AND grantee IN ('agent_read','agent_write','admin_write')
  ORDER BY table_name, grantee, privilege_type;
```

Results show agent_read has SELECT on all 70+ roadmap tables, agent_write has INSERT/UPDATE on designated write surfaces plus SELECT on workflow/type-config tables, and admin_write has full DML everywhere.

## Git history

- `880b47d` — Claude Code initial session (created migrations 007, 008, 009)
- `7f7c4e7` — feat: create per-worktree postgres users with scoped permissions
- `e4c2fa7` — feat: seed data and migrations for fresh-install readiness

## Related files

- `scripts/migrations/007-agent-security-roles.sql` — original role definitions (public schema only)
- `scripts/migrations/008-create-agent-users.sql` — agent user creation (public schema grants)
- `scripts/migrations/009-roadmap-schema-grants.sql` — the fix (roadmap schema grants)

## Lessons learned

1. **Schema-aware migrations** — when adding a new schema to an existing project, audit ALL grant/permission migrations to target the correct schema. `public` and `roadmap` are separate privilege domains in PostgreSQL.

2. **DEFAULT PRIVILEGES for future tables** — use `ALTER DEFAULT PRIVILEGES` so new tables inherit grants automatically. Without this, every new table requires a new migration just for grants.

3. **Privilege split by operation** — read-only agents get `agent_read`, operational agents get `agent_write` (limited write surfaces), orchestrator/migrations get `admin_write`. This mirrors the principle of least privilege at the DB level.
