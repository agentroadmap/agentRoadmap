-- ============================================================
-- P601: project DDL for hiveCentral
-- Project catalog, tenant database bindings, host assignments,
-- and repository references for the multi-project split (P429).
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (rw on project_db/project_host/project_repo, r on project),
--             agenthive_observability (r everywhere),
--             agenthive_agency (r on project/project_db/project_host)
-- Min PG:     14  (required for CREATE OR REPLACE TRIGGER)
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS control_project;

COMMENT ON SCHEMA control_project IS
  'Project catalog layer for hiveCentral (P429 multi-project split). Each project '
  'row is a logical tenant: it owns one or more databases (project_db), runs on '
  'one or more hosts (project_host), and tracks one or more git repositories '
  '(project_repo). The orchestrator resolves project context at dispatch time. '
  'Tenant DB schemas live in per-project databases, not in hiveCentral.';

-- ============================================================
-- control_project.set_updated_at() — trigger function
-- Uses clock_timestamp() so updated_at advances within a transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION control_project.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- control_project.project — project catalog (tenant registry)
-- ============================================================
CREATE TABLE IF NOT EXISTS control_project.project (
  id               BIGSERIAL    PRIMARY KEY,
  slug             TEXT         UNIQUE NOT NULL,            -- 'agenthive', 'myapp', 'infra-tools'
  display_name     TEXT         NOT NULL,
  description      TEXT,
  status           TEXT         NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','archived','paused')),
  -- Catalog hygiene:
  owner_did        TEXT         NOT NULL,
  lifecycle_status TEXT         NOT NULL DEFAULT 'active'
                               CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at    TIMESTAMPTZ,
  retire_after     TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_status_active
  ON control_project.project (status)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS project_deprecated_at
  ON control_project.project (deprecated_at);

COMMENT ON TABLE control_project.project IS
  'Central project registry. Each row is a logical tenant in the multi-project '
  'architecture (P429). The slug is the stable identifier used as a scope label '
  'in core.runtime_flag, workforce.agent_project, and credential_grant.grantee_id. '
  'status reflects operational state (active/paused/archived) independently of '
  'the catalog lifecycle_status (which tracks whether the row itself is managed).';

COMMENT ON COLUMN control_project.project.slug IS
  'URL-safe short identifier, e.g. ''agenthive'', ''my-app''. Immutable once set. '
  'Used as the scope label in runtime_flag and as grantee_id for credential grants.';

COMMENT ON COLUMN control_project.project.status IS
  'Operational state: active = normal; paused = suspended but recoverable; '
  'archived = read-only historical record. Distinct from lifecycle_status which '
  'governs catalog row deprecation.';

CREATE OR REPLACE TRIGGER set_updated_at_project
  BEFORE UPDATE ON control_project.project
  FOR EACH ROW EXECUTE FUNCTION control_project.set_updated_at();

-- ============================================================
-- control_project.project_db — tenant database bindings
-- ============================================================
CREATE TABLE IF NOT EXISTS control_project.project_db (
  id               BIGSERIAL    PRIMARY KEY,
  project_id       BIGINT       NOT NULL
                               REFERENCES control_project.project (id) ON DELETE RESTRICT,
  db_name          TEXT         NOT NULL,
  host             TEXT         NOT NULL DEFAULT '127.0.0.1',
  port             INT          NOT NULL DEFAULT 5432,
  schema_prefix    TEXT,                                    -- e.g. 'myapp_' for schema-per-project on shared PG
  role             TEXT         NOT NULL DEFAULT 'tenant'
                               CHECK (role IN ('tenant','replica','analytics')),
  is_primary       BOOLEAN      NOT NULL DEFAULT true,
  -- Catalog hygiene:
  owner_did        TEXT         NOT NULL,
  lifecycle_status TEXT         NOT NULL DEFAULT 'active'
                               CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at    TIMESTAMPTZ,
  retire_after     TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- At most one primary tenant DB per project at any time.
CREATE UNIQUE INDEX IF NOT EXISTS project_db_one_primary
  ON control_project.project_db (project_id)
  WHERE role = 'tenant' AND is_primary = true AND lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS project_db_project_active
  ON control_project.project_db (project_id, role)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS project_db_deprecated_at
  ON control_project.project_db (deprecated_at);

COMMENT ON TABLE control_project.project_db IS
  'Tenant database bindings for a project. A project has exactly one active primary '
  'tenant DB (enforced by the partial unique index) and may have zero or more '
  'replica and analytics databases. The orchestrator resolves the primary DB at '
  'startup; replicas are used by read-only workloads. schema_prefix supports '
  'schema-per-project deployments on a shared PostgreSQL instance.';

COMMENT ON COLUMN control_project.project_db.role IS
  'tenant = read/write primary database; replica = streaming replica for read scaling; '
  'analytics = OLAP or read-only copy for reporting workloads.';

COMMENT ON COLUMN control_project.project_db.is_primary IS
  'True for the canonical tenant DB; false for additional databases of the same role. '
  'Partial unique index prevents more than one active primary tenant DB per project.';

COMMENT ON COLUMN control_project.project_db.schema_prefix IS
  'Optional schema name prefix for schema-per-project deployments. '
  'e.g. ''myapp_'' → schemas myapp_public, myapp_workforce, etc.';

CREATE OR REPLACE TRIGGER set_updated_at_project_db
  BEFORE UPDATE ON control_project.project_db
  FOR EACH ROW EXECUTE FUNCTION control_project.set_updated_at();

-- ============================================================
-- control_project.project_host — host assignments
-- ============================================================
-- Simplified hygiene: records which hosts a project runs on.
-- No lifecycle fields needed; UNIQUE(project_id, host) and
-- created_at are sufficient. Rows are hard-deleted when a host
-- is removed from a project.
CREATE TABLE IF NOT EXISTS control_project.project_host (
  id               BIGSERIAL    PRIMARY KEY,
  project_id       BIGINT       NOT NULL
                               REFERENCES control_project.project (id) ON DELETE CASCADE,
  host             TEXT         NOT NULL,                   -- host_name from core.host
  purpose          TEXT         NOT NULL DEFAULT 'compute'
                               CHECK (purpose IN ('compute','storage','gateway')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (project_id, host)
);

CREATE INDEX IF NOT EXISTS project_host_host
  ON control_project.project_host (host);

CREATE INDEX IF NOT EXISTS project_host_purpose
  ON control_project.project_host (project_id, purpose);

COMMENT ON TABLE control_project.project_host IS
  'Host-to-project assignments. Records which physical or logical hosts are '
  'allocated to each project. UNIQUE(project_id, host) prevents duplicate '
  'bindings. purpose distinguishes compute nodes (run agents), storage nodes '
  '(persistent volumes), and gateway nodes (ingress/egress).';

COMMENT ON COLUMN control_project.project_host.host IS
  'Logical host label matching core.host.host_name. Soft FK to keep project_host '
  'bootstrappable before core.host is populated.';

COMMENT ON COLUMN control_project.project_host.purpose IS
  'compute = runs agency or orchestrator processes; storage = provides persistent '
  'volume or file storage; gateway = handles external ingress/egress traffic.';

-- ============================================================
-- control_project.project_repo — git repository references
-- ============================================================
CREATE TABLE IF NOT EXISTS control_project.project_repo (
  id               BIGSERIAL    PRIMARY KEY,
  project_id       BIGINT       NOT NULL
                               REFERENCES control_project.project (id) ON DELETE RESTRICT,
  repo_url         TEXT         NOT NULL,
  remote_name      TEXT         NOT NULL DEFAULT 'origin',
  default_branch   TEXT         NOT NULL DEFAULT 'main',
  -- Catalog hygiene:
  owner_did        TEXT         NOT NULL,
  lifecycle_status TEXT         NOT NULL DEFAULT 'active'
                               CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at    TIMESTAMPTZ,
  retire_after     TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (project_id, remote_name)
);

CREATE INDEX IF NOT EXISTS project_repo_project_active
  ON control_project.project_repo (project_id)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS project_repo_deprecated_at
  ON control_project.project_repo (deprecated_at);

COMMENT ON TABLE control_project.project_repo IS
  'Git repository references for a project. A project may have multiple remotes '
  '(e.g. origin, upstream, mirror) identified by remote_name. '
  'UNIQUE(project_id, remote_name) prevents duplicate remote registrations. '
  'Used by CI workflows and the Git Workflow Master to resolve the canonical '
  'repository for a project context.';

COMMENT ON COLUMN control_project.project_repo.repo_url IS
  'Full remote URL, e.g. https://github.com/org/repo or git@github.com:org/repo.git.';

COMMENT ON COLUMN control_project.project_repo.remote_name IS
  'Git remote name, e.g. ''origin'', ''upstream'', ''mirror''. '
  'Unique per project so each remote can be addressed unambiguously.';

COMMENT ON COLUMN control_project.project_repo.default_branch IS
  'The default branch for this remote, e.g. ''main'', ''master'', ''develop''. '
  'Used by the orchestrator when checking out the repository.';

CREATE OR REPLACE TRIGGER set_updated_at_project_repo
  BEFORE UPDATE ON control_project.project_repo
  FOR EACH ROW EXECUTE FUNCTION control_project.set_updated_at();

-- ============================================================
-- Views
-- ============================================================
CREATE OR REPLACE VIEW control_project.v_active_projects AS
SELECT
  p.id,
  p.slug,
  p.display_name,
  p.description,
  p.status,
  p.owner_did,
  p.created_at
FROM control_project.project p
WHERE p.lifecycle_status = 'active'
  AND p.status <> 'archived';

COMMENT ON VIEW control_project.v_active_projects IS
  'Active, non-archived projects. Primary view for orchestrator project discovery '
  'and runtime_flag scope resolution.';

CREATE OR REPLACE VIEW control_project.v_project_databases AS
SELECT
  p.slug          AS project_slug,
  p.display_name  AS project_name,
  d.db_name,
  d.host,
  d.port,
  d.schema_prefix,
  d.role          AS db_role,
  d.is_primary,
  d.lifecycle_status
FROM control_project.project_db d
JOIN control_project.project p ON p.id = d.project_id
WHERE p.lifecycle_status = 'active'
  AND d.lifecycle_status = 'active';

COMMENT ON VIEW control_project.v_project_databases IS
  'Active project databases with project slug. Used by the orchestrator to build '
  'connection strings at startup and by the provisioning flow to detect DB conflicts.';

CREATE OR REPLACE VIEW control_project.v_project_topology AS
SELECT
  p.slug          AS project_slug,
  p.status        AS project_status,
  ph.host,
  ph.purpose      AS host_purpose,
  d.db_name,
  d.role          AS db_role,
  d.is_primary,
  r.repo_url,
  r.remote_name,
  r.default_branch
FROM control_project.project p
LEFT JOIN control_project.project_host ph ON ph.project_id = p.id
LEFT JOIN control_project.project_db   d  ON d.project_id  = p.id AND d.lifecycle_status = 'active'
LEFT JOIN control_project.project_repo r  ON r.project_id  = p.id AND r.lifecycle_status = 'active'
WHERE p.lifecycle_status = 'active';

COMMENT ON VIEW control_project.v_project_topology IS
  'Full project topology: hosts, databases, and repositories for each active project. '
  'Used by operator dashboards and the DR runbook for topology inspection.';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA control_project TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA control_project TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON control_project.project_db   TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON control_project.project_repo TO agenthive_orchestrator;
    GRANT INSERT, DELETE ON control_project.project_host TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA control_project TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA control_project TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA control_project TO agenthive_observability;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA control_project TO agenthive_agency;
    GRANT SELECT ON control_project.project,
                    control_project.project_db,
                    control_project.project_host,
                    control_project.v_active_projects,
                    control_project.v_project_databases,
                    control_project.v_project_topology TO agenthive_agency;
  END IF;
END $$;

\echo 'control_project schema applied.'
