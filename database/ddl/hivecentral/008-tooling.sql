-- ============================================================
-- 008-tooling: Tool catalog schema for hiveCentral
-- MCP tools, CLI tools, and per-principal access grants.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (rw tool_grant, r all),
--             agenthive_agency (r all),
--             agenthive_observability (r all)
-- Min PG:     16
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS tooling;

COMMENT ON SCHEMA tooling IS
  'Tool catalog: registered MCP tools, CLI tools, and per-principal access grants. '
  'Agencies resolve their permitted toolset from this schema at spawn time.';

-- ============================================================
-- tooling.set_updated_at()
-- ============================================================
CREATE OR REPLACE FUNCTION tooling.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- tooling.tool — base tool catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS tooling.tool (
  id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT         UNIQUE NOT NULL,
  kind             TEXT         NOT NULL CHECK (kind IN ('mcp','cli','builtin')),
  description      TEXT,
  -- Catalog hygiene:
  owner_did        TEXT,
  lifecycle_status TEXT         NOT NULL DEFAULT 'active'
                               CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at    TIMESTAMPTZ,
  retire_after     TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_kind_active
  ON tooling.tool (kind)
  WHERE lifecycle_status = 'active';

CREATE OR REPLACE TRIGGER set_updated_at_tool
  BEFORE UPDATE ON tooling.tool
  FOR EACH ROW EXECUTE FUNCTION tooling.set_updated_at();

-- ============================================================
-- tooling.mcp_tool — MCP-specific tool metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS tooling.mcp_tool (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool_id      BIGINT       UNIQUE NOT NULL
                            REFERENCES tooling.tool (id) ON DELETE CASCADE,
  server_name  TEXT         NOT NULL,
  tool_name    TEXT         NOT NULL,
  server_url   TEXT,
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

CREATE OR REPLACE TRIGGER set_updated_at_mcp_tool
  BEFORE UPDATE ON tooling.mcp_tool
  FOR EACH ROW EXECUTE FUNCTION tooling.set_updated_at();

-- ============================================================
-- tooling.cli_tool — CLI-specific tool metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS tooling.cli_tool (
  id            BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool_id       BIGINT       UNIQUE NOT NULL
                             REFERENCES tooling.tool (id) ON DELETE CASCADE,
  binary_path   TEXT         NOT NULL,
  default_args  TEXT[],
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

CREATE OR REPLACE TRIGGER set_updated_at_cli_tool
  BEFORE UPDATE ON tooling.cli_tool
  FOR EACH ROW EXECUTE FUNCTION tooling.set_updated_at();

-- ============================================================
-- tooling.tool_grant — per-principal tool access grants
-- ============================================================
CREATE TABLE IF NOT EXISTS tooling.tool_grant (
  id            BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool_id       BIGINT       NOT NULL
                             REFERENCES tooling.tool (id) ON DELETE CASCADE,
  principal_id  BIGINT       NOT NULL
                             REFERENCES control_identity.principal (id) ON DELETE CASCADE,
  scope         TEXT         NOT NULL CHECK (scope IN ('global','tenant')),
  project_id    BIGINT       NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS tool_grant_unique
  ON tooling.tool_grant (tool_id, principal_id, scope, (COALESCE(project_id, 0)));

CREATE INDEX IF NOT EXISTS tool_grant_principal
  ON tooling.tool_grant (principal_id);

CREATE OR REPLACE TRIGGER set_updated_at_tool_grant
  BEFORE UPDATE ON tooling.tool_grant
  FOR EACH ROW EXECUTE FUNCTION tooling.set_updated_at();

COMMENT ON TABLE tooling.tool_grant IS
  'Access grants controlling which principals may use which tools. '
  'scope=global grants apply across all projects; scope=tenant grants are project-scoped. '
  'Resolved at spawn time by the agency toolset loader.';

-- ============================================================
-- Views
-- ============================================================
CREATE OR REPLACE VIEW tooling.v_active_tools AS
SELECT
  t.id,
  t.name,
  t.kind,
  t.description,
  mt.server_name,
  mt.tool_name,
  mt.server_url,
  ct.binary_path,
  ct.default_args
FROM tooling.tool t
LEFT JOIN tooling.mcp_tool mt ON mt.tool_id = t.id
LEFT JOIN tooling.cli_tool ct ON ct.tool_id = t.id
WHERE t.lifecycle_status = 'active';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA tooling TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA tooling TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON tooling.tool_grant TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA tooling TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA tooling TO agenthive_agency;
    GRANT SELECT ON ALL TABLES IN SCHEMA tooling TO agenthive_agency;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA tooling TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA tooling TO agenthive_observability;
  END IF;
END $$;

\echo 'tooling schema applied.'
