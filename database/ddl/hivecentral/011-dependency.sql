-- ============================================================
-- 011-dependency: Cross-project dependency schema for hiveCentral
-- Soft dependency links between projects with resolution tracking
-- and pg_notify on resolution.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (rw all),
--             agenthive_agency (r all),
--             agenthive_observability (r all)
-- Min PG:     16
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS dependency;

COMMENT ON SCHEMA dependency IS
  'Cross-project dependency tracking. Soft FKs (reference_id + reference_type) allow '
  'dependencies to span tenant DBs. Resolution trigger fires pg_notify so the orchestrator '
  'can unblock downstream work without polling.';

-- ============================================================
-- dependency.set_updated_at()
-- ============================================================
CREATE OR REPLACE FUNCTION dependency.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- dependency.dependency_kind_catalog — registered dependency kinds
-- ============================================================
CREATE TABLE IF NOT EXISTS dependency.dependency_kind_catalog (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT         UNIQUE NOT NULL,
  description  TEXT,
  is_blocking  BOOL         NOT NULL DEFAULT true,
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER set_updated_at_dependency_kind_catalog
  BEFORE UPDATE ON dependency.dependency_kind_catalog
  FOR EACH ROW EXECUTE FUNCTION dependency.set_updated_at();

-- Seed: common dependency kinds
INSERT INTO dependency.dependency_kind_catalog (name, description, is_blocking, owner_did)
VALUES
  ('schema_migration',  'Downstream requires upstream DB migration to be applied',   true,  'did:agenthive:system'),
  ('api_contract',      'Downstream requires upstream API contract to be published',  true,  'did:agenthive:system'),
  ('data_seed',         'Downstream requires upstream seed data to be present',       true,  'did:agenthive:system'),
  ('soft_reference',    'Informational dependency — does not block advance',          false, 'did:agenthive:system')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE dependency.dependency_kind_catalog IS
  'Registered dependency kinds. is_blocking=true means the orchestrator will not advance '
  'the from_project past its current gate until resolved_at IS NOT NULL.';

-- ============================================================
-- dependency.cross_project_dependency — inter-project dependency links
-- ============================================================
-- Resolution trigger: when resolved_at transitions NULL → non-NULL, fire pg_notify
CREATE OR REPLACE FUNCTION dependency.notify_dependency_resolved()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN
    PERFORM pg_notify(
      'dependency_resolved',
      json_build_object(
        'dependency_id',    NEW.id,
        'from_project_id',  NEW.from_project_id,
        'to_project_id',    NEW.to_project_id,
        'reference_id',     NEW.reference_id,
        'reference_type',   NEW.reference_type,
        'resolved_at',      NEW.resolved_at
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS dependency.cross_project_dependency (
  id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_project_id  BIGINT       NOT NULL
                                REFERENCES control_project.project (id) ON DELETE CASCADE,
  to_project_id    BIGINT       NOT NULL
                                REFERENCES control_project.project (id) ON DELETE CASCADE,
  kind_id          BIGINT       NOT NULL
                                REFERENCES dependency.dependency_kind_catalog (id) ON DELETE RESTRICT,
  reference_id     TEXT         NOT NULL,
  reference_type   TEXT         NOT NULL,   -- e.g. 'proposal','migration','api_version'
  resolved_at      TIMESTAMPTZ,
  notes            TEXT,
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cross_project_dependency_unique
    UNIQUE (from_project_id, to_project_id, reference_id)
);

CREATE INDEX IF NOT EXISTS cross_project_dependency_from_project
  ON dependency.cross_project_dependency (from_project_id);
CREATE INDEX IF NOT EXISTS cross_project_dependency_to_project
  ON dependency.cross_project_dependency (to_project_id);
CREATE INDEX IF NOT EXISTS cross_project_dependency_unresolved
  ON dependency.cross_project_dependency (from_project_id, kind_id)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE TRIGGER dependency_resolved_notify
  AFTER UPDATE ON dependency.cross_project_dependency
  FOR EACH ROW EXECUTE FUNCTION dependency.notify_dependency_resolved();

CREATE OR REPLACE TRIGGER set_updated_at_cross_project_dependency
  BEFORE UPDATE ON dependency.cross_project_dependency
  FOR EACH ROW EXECUTE FUNCTION dependency.set_updated_at();

COMMENT ON TABLE dependency.cross_project_dependency IS
  'Cross-project dependency links. reference_id + reference_type form a soft FK that may '
  'point into any tenant DB (proposal, migration version, API contract). When resolved_at '
  'is set, an AFTER UPDATE trigger fires pg_notify(dependency_resolved) so the orchestrator '
  'can unblock downstream projects without polling. is_blocking semantics come from the '
  'referenced dependency_kind_catalog row.';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA dependency TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA dependency TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON dependency.cross_project_dependency TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON dependency.dependency_kind_catalog  TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA dependency TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA dependency TO agenthive_agency;
    GRANT SELECT ON ALL TABLES IN SCHEMA dependency TO agenthive_agency;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA dependency TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA dependency TO agenthive_observability;
  END IF;
END $$;

\echo 'dependency schema applied.'
