-- ============================================================
-- 010b-project-ext: Extensions to control_project schema
-- Worktrees, members, budget policy, capacity config,
-- route policy, and sandbox grants.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (r all, rw capacity_config/route_policy),
--             agenthive_agency (r project_worktree/sandbox_grant),
--             agenthive_observability (r all)
-- Depends on: 010-project.sql, 009-sandbox.sql (deferred FK to sandbox.sandbox_definition)
-- Min PG:     16
-- ============================================================

\set ON_ERROR_STOP on

-- Schema already created by 010-project.sql; no CREATE SCHEMA here.

-- ============================================================
-- control_project.project_worktree — per-project git worktrees
-- ============================================================
CREATE TABLE IF NOT EXISTS control_project.project_worktree (
  id          BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  BIGINT       NOT NULL
                           REFERENCES control_project.project (id) ON DELETE CASCADE,
  root_path   TEXT         NOT NULL,
  host_id     BIGINT       REFERENCES core.host (host_id) ON DELETE SET NULL,
  is_default  BOOL         NOT NULL DEFAULT false,
  -- Catalog hygiene:
  owner_did   TEXT,
  lifecycle_status TEXT    NOT NULL DEFAULT 'active'
                           CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at TIMESTAMPTZ,
  retire_after  TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_worktree_one_default
    UNIQUE (project_id) DEFERRABLE INITIALLY DEFERRED
    -- partial unique enforced by application; only one is_default per project
);
-- NOTE: UNIQUE (project_id) WHERE is_default is not directly portable in
-- PostgreSQL DDL syntax without a separate partial unique index:
CREATE UNIQUE INDEX IF NOT EXISTS project_worktree_default_idx
  ON control_project.project_worktree (project_id)
  WHERE is_default = true;

ALTER TABLE control_project.project_worktree
  DROP CONSTRAINT IF EXISTS project_worktree_one_default;

CREATE OR REPLACE TRIGGER set_updated_at_project_worktree
  BEFORE UPDATE ON control_project.project_worktree
  FOR EACH ROW EXECUTE FUNCTION control_project.set_updated_at();

COMMENT ON TABLE control_project.project_worktree IS
  'Git worktrees associated with a project. At most one is_default row per project '
  '(enforced by partial unique index). host_id references the core.host where the '
  'worktree lives; NULL means host unknown or multi-host.';

-- ============================================================
-- control_project.project_member — project membership
-- ============================================================
CREATE TABLE IF NOT EXISTS control_project.project_member (
  id            BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id    BIGINT       NOT NULL
                             REFERENCES control_project.project (id) ON DELETE CASCADE,
  principal_id  BIGINT       NOT NULL
                             REFERENCES control_identity.principal (id) ON DELETE CASCADE,
  role          TEXT         NOT NULL,
  -- Catalog hygiene:
  owner_did     TEXT,
  lifecycle_status TEXT      NOT NULL DEFAULT 'active'
                             CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at   TIMESTAMPTZ,
  retire_after    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, principal_id)
);

CREATE INDEX IF NOT EXISTS project_member_principal
  ON control_project.project_member (principal_id);

CREATE OR REPLACE TRIGGER set_updated_at_project_member
  BEFORE UPDATE ON control_project.project_member
  FOR EACH ROW EXECUTE FUNCTION control_project.set_updated_at();

-- ============================================================
-- control_project.project_budget_policy — per-project spending cap
-- ============================================================
CREATE TABLE IF NOT EXISTS control_project.project_budget_policy (
  id                    BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id            BIGINT       UNIQUE NOT NULL
                                     REFERENCES control_project.project (id) ON DELETE CASCADE,
  monthly_usd_cap       NUMERIC(12,4),
  alert_threshold_pct   SMALLINT     DEFAULT 80
                                     CHECK (alert_threshold_pct BETWEEN 1 AND 100),
  enforce_hard_cap      BOOL         NOT NULL DEFAULT false,
  -- Catalog hygiene:
  owner_did     TEXT,
  lifecycle_status TEXT      NOT NULL DEFAULT 'active'
                             CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at   TIMESTAMPTZ,
  retire_after    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER set_updated_at_project_budget_policy
  BEFORE UPDATE ON control_project.project_budget_policy
  FOR EACH ROW EXECUTE FUNCTION control_project.set_updated_at();

COMMENT ON TABLE control_project.project_budget_policy IS
  'Per-project spending cap. One row per project (enforced by UNIQUE project_id). '
  'enforce_hard_cap=true causes dispatch to fail when monthly_usd_cap is exceeded. '
  'alert_threshold_pct triggers a notification event before the hard cap.';

-- ============================================================
-- control_project.project_capacity_config — queue depth limits (P744)
-- ============================================================
CREATE TABLE IF NOT EXISTS control_project.project_capacity_config (
  id                        BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id                BIGINT       UNIQUE NOT NULL
                                         REFERENCES control_project.project (id) ON DELETE CASCADE,
  max_concurrent_dispatches INT          NOT NULL DEFAULT 10,
  max_queue_depth           INT          NOT NULL DEFAULT 200,
  -- Catalog hygiene:
  owner_did     TEXT,
  lifecycle_status TEXT      NOT NULL DEFAULT 'active'
                             CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at   TIMESTAMPTZ,
  retire_after    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER set_updated_at_project_capacity_config
  BEFORE UPDATE ON control_project.project_capacity_config
  FOR EACH ROW EXECUTE FUNCTION control_project.set_updated_at();

COMMENT ON TABLE control_project.project_capacity_config IS
  'Queue model capacity limits per project (P744). max_concurrent_dispatches caps '
  'simultaneous active dispatches; max_queue_depth caps the total backlog across '
  'all virtual queues for this project. One row per project.';

-- ============================================================
-- control_project.project_route_policy — project-level route limits (P747 D1)
-- ============================================================
CREATE TABLE IF NOT EXISTS control_project.project_route_policy (
  id                BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id        BIGINT       NOT NULL
                                 REFERENCES control_project.project (id) ON DELETE CASCADE,
  route_id          BIGINT       NOT NULL
                                 REFERENCES control_model.model_route (id) ON DELETE CASCADE,
  max_hourly_tokens BIGINT,
  max_daily_usd     NUMERIC(10,4),
  -- Catalog hygiene:
  owner_did     TEXT,
  lifecycle_status TEXT      NOT NULL DEFAULT 'active'
                             CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at   TIMESTAMPTZ,
  retire_after    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, route_id)
);

CREATE INDEX IF NOT EXISTS project_route_policy_project_route
  ON control_project.project_route_policy (project_id, route_id);

CREATE OR REPLACE TRIGGER set_updated_at_project_route_policy
  BEFORE UPDATE ON control_project.project_route_policy
  FOR EACH ROW EXECUTE FUNCTION control_project.set_updated_at();

COMMENT ON TABLE control_project.project_route_policy IS
  'Project-level token and spend limits per model route (P747 D1). Checked by the '
  'route picker before allowing a dispatch to use the route. One row per '
  '(project_id, route_id) pair.';

-- ============================================================
-- control_project.project_sandbox_grant — sandbox assignments
-- FK to sandbox.sandbox_definition is DEFERRABLE because 009-sandbox
-- must be applied in the same transaction or earlier.
-- ============================================================
CREATE TABLE IF NOT EXISTS control_project.project_sandbox_grant (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id      BIGINT       NOT NULL
                               REFERENCES control_project.project (id) ON DELETE CASCADE,
  sandbox_def_id  BIGINT       NOT NULL,
  -- Catalog hygiene:
  owner_did     TEXT,
  lifecycle_status TEXT      NOT NULL DEFAULT 'active'
                             CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at   TIMESTAMPTZ,
  retire_after    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, sandbox_def_id)
);

CREATE OR REPLACE TRIGGER set_updated_at_project_sandbox_grant
  BEFORE UPDATE ON control_project.project_sandbox_grant
  FOR EACH ROW EXECUTE FUNCTION control_project.set_updated_at();

-- Add FK to sandbox.sandbox_definition now that 009-sandbox has been applied
ALTER TABLE control_project.project_sandbox_grant
  ADD CONSTRAINT fk_sandbox_def
  FOREIGN KEY (sandbox_def_id)
  REFERENCES sandbox.sandbox_definition (id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON TABLE control_project.project_sandbox_grant IS
  'Assigns permitted sandbox environments to a project. Multiple rows allowed per '
  'project; the agency spawn flow selects the appropriate sandbox from this grant list. '
  'FK to sandbox.sandbox_definition is deferred to allow the sandbox schema to be '
  'applied in the same DDL session.';

-- ============================================================
-- Grants (extend existing control_project grants)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT SELECT ON
      control_project.project_worktree,
      control_project.project_member,
      control_project.project_budget_policy,
      control_project.project_capacity_config,
      control_project.project_route_policy,
      control_project.project_sandbox_grant
    TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON
      control_project.project_capacity_config,
      control_project.project_route_policy,
      control_project.project_budget_policy
    TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA control_project TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT SELECT ON
      control_project.project_worktree,
      control_project.project_sandbox_grant
    TO agenthive_agency;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT SELECT ON
      control_project.project_worktree,
      control_project.project_member,
      control_project.project_budget_policy,
      control_project.project_capacity_config,
      control_project.project_route_policy,
      control_project.project_sandbox_grant
    TO agenthive_observability;
  END IF;
END $$;

\echo 'control_project extension tables applied.'
