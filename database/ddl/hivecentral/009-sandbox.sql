-- ============================================================
-- 009-sandbox: Sandbox definition schema for hiveCentral
-- Sandbox types, resource boundary policies, egress rules,
-- and filesystem mount grants.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (r all),
--             agenthive_agency (r all),
--             agenthive_observability (r all)
-- Min PG:     16
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS sandbox;

COMMENT ON SCHEMA sandbox IS
  'Sandbox definitions: execution environment types (container, chroot, wasm, none), '
  'resource boundary policies, egress rules, and mount grants. Referenced by '
  'control_project.project_sandbox_grant for per-project sandbox assignments.';

-- ============================================================
-- sandbox.set_updated_at()
-- ============================================================
CREATE OR REPLACE FUNCTION sandbox.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- sandbox.sandbox_definition — sandbox environment types
-- ============================================================
CREATE TABLE IF NOT EXISTS sandbox.sandbox_definition (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT         UNIQUE NOT NULL,
  kind         TEXT         NOT NULL CHECK (kind IN ('container','chroot','wasm','none')),
  base_image   TEXT,        -- Docker image or chroot base; NULL for wasm/none
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

CREATE INDEX IF NOT EXISTS sandbox_definition_kind
  ON sandbox.sandbox_definition (kind)
  WHERE lifecycle_status = 'active';

CREATE OR REPLACE TRIGGER set_updated_at_sandbox_definition
  BEFORE UPDATE ON sandbox.sandbox_definition
  FOR EACH ROW EXECUTE FUNCTION sandbox.set_updated_at();

-- Seed: standard sandbox kinds
INSERT INTO sandbox.sandbox_definition (name, kind, owner_did, notes)
VALUES
  ('none',      'none',      'did:agenthive:system', 'No isolation — agent runs in host process'),
  ('container', 'container', 'did:agenthive:system', 'Docker container isolation'),
  ('chroot',    'chroot',    'did:agenthive:system', 'chroot-based isolation')
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE sandbox.sandbox_definition IS
  'Registered sandbox execution environment types. kind determines the isolation '
  'mechanism; base_image is the Docker image or chroot base path. '
  'The none kind disables isolation for trusted local agents.';

-- ============================================================
-- sandbox.boundary_policy — resource limits per sandbox
-- ============================================================
CREATE TABLE IF NOT EXISTS sandbox.boundary_policy (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sandbox_def_id  BIGINT       NOT NULL
                               REFERENCES sandbox.sandbox_definition (id) ON DELETE CASCADE,
  resource_kind   TEXT         NOT NULL,   -- 'cpu_millicores','memory_mb','disk_mb','open_files'
  max_quantity    INT          NOT NULL,
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sandbox_def_id, resource_kind)
);

CREATE OR REPLACE TRIGGER set_updated_at_boundary_policy
  BEFORE UPDATE ON sandbox.boundary_policy
  FOR EACH ROW EXECUTE FUNCTION sandbox.set_updated_at();

-- ============================================================
-- sandbox.egress_rule — network egress allow-rules
-- ============================================================
CREATE TABLE IF NOT EXISTS sandbox.egress_rule (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sandbox_def_id  BIGINT       NOT NULL
                               REFERENCES sandbox.sandbox_definition (id) ON DELETE CASCADE,
  protocol        TEXT         NOT NULL,   -- 'tcp','udp','https'
  destination     TEXT         NOT NULL,   -- hostname, IP, or CIDR
  port_range      TEXT,                    -- '443','1024-65535', or NULL = all
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

CREATE OR REPLACE TRIGGER set_updated_at_egress_rule
  BEFORE UPDATE ON sandbox.egress_rule
  FOR EACH ROW EXECUTE FUNCTION sandbox.set_updated_at();

-- ============================================================
-- sandbox.mount_grant — filesystem path grants
-- ============================================================
CREATE TABLE IF NOT EXISTS sandbox.mount_grant (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sandbox_def_id  BIGINT       NOT NULL
                               REFERENCES sandbox.sandbox_definition (id) ON DELETE CASCADE,
  mount_path      TEXT         NOT NULL,
  mode            TEXT         NOT NULL CHECK (mode IN ('ro','rw')),
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

CREATE OR REPLACE TRIGGER set_updated_at_mount_grant
  BEFORE UPDATE ON sandbox.mount_grant
  FOR EACH ROW EXECUTE FUNCTION sandbox.set_updated_at();

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA sandbox TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA sandbox TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA sandbox TO agenthive_agency;
    GRANT SELECT ON ALL TABLES IN SCHEMA sandbox TO agenthive_agency;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA sandbox TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA sandbox TO agenthive_observability;
  END IF;
END $$;

\echo 'sandbox schema applied.'
