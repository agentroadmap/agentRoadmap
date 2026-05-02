-- ============================================================
-- 003-agency: Agency registry for hiveCentral
-- Canonical home for AI agents (agencies), their provider,
-- sessions, liaison messages, and route policies.
-- Replaces roadmap_workforce.provider_registry.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (rw agency/route_policy, r provider/catalog),
--             agenthive_agency (r all, rw agency_session/liaison_message),
--             agenthive_observability (r all)
-- Min PG:     16  (declarative partitioning + pg_partman 5.x)
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS agency;

COMMENT ON SCHEMA agency IS
  'AI agency registry: provider catalog, running agency instances, session telemetry, '
  'liaison message bus, and per-agency route policies. Replaces the legacy '
  'roadmap_workforce.provider_registry table.';

-- ============================================================
-- agency.set_updated_at() — per-schema trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION agency.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- agency.agency_provider — known AI provider catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS agency.agency_provider (
  id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT         UNIQUE NOT NULL,   -- 'claude', 'codex', 'hermes', 'copilot'
  homepage_url     TEXT,
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

CREATE OR REPLACE TRIGGER set_updated_at_agency_provider
  BEFORE UPDATE ON agency.agency_provider
  FOR EACH ROW EXECUTE FUNCTION agency.set_updated_at();

-- Seed: canonical providers
INSERT INTO agency.agency_provider (name, homepage_url, owner_did)
VALUES
  ('claude',  'https://claude.ai',            'did:agenthive:system'),
  ('codex',   'https://openai.com/codex',     'did:agenthive:system'),
  ('hermes',  NULL,                            'did:agenthive:system'),
  ('copilot', 'https://github.com/copilot',   'did:agenthive:system')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- agency.agency — registered agency instances
-- ============================================================
-- Trigger enforces: scope='tenant' requires project_id IS NOT NULL
--                   scope='global' requires project_id IS NULL
CREATE OR REPLACE FUNCTION agency.check_agency_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scope = 'tenant' AND NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'TenantScopeViolation: agency scope=tenant requires project_id';
  END IF;
  IF NEW.scope = 'global' AND NEW.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'TenantScopeViolation: agency scope=global requires project_id IS NULL';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS agency.agency (
  id                  BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id         BIGINT       NOT NULL
                                   REFERENCES agency.agency_provider (id) ON DELETE RESTRICT,
  name                TEXT         NOT NULL,
  slug                TEXT         UNIQUE NOT NULL,
  scope               TEXT         NOT NULL DEFAULT 'global'
                                   CHECK (scope IN ('global','tenant')),
  project_id          BIGINT       NULL
                                   REFERENCES control_project.project (id) ON DELETE SET NULL,
  status              TEXT         NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active','throttled','dormant','offline','retired')),
  last_seen_at        TIMESTAMPTZ,
  concurrent_slot_cap INT,
  spawn_fail_count    INT          NOT NULL DEFAULT 0,
  -- Catalog hygiene:
  owner_did           TEXT,
  lifecycle_status    TEXT         NOT NULL DEFAULT 'active'
                                   CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at       TIMESTAMPTZ,
  retire_after        TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_slug ON agency.agency (slug);
CREATE INDEX IF NOT EXISTS agency_status_scope ON agency.agency (status, scope);
CREATE INDEX IF NOT EXISTS agency_project_id ON agency.agency (project_id)
  WHERE project_id IS NOT NULL;

CREATE OR REPLACE TRIGGER agency_scope_check
  BEFORE INSERT OR UPDATE ON agency.agency
  FOR EACH ROW EXECUTE FUNCTION agency.check_agency_scope();

CREATE OR REPLACE TRIGGER set_updated_at_agency
  BEFORE UPDATE ON agency.agency
  FOR EACH ROW EXECUTE FUNCTION agency.set_updated_at();

COMMENT ON TABLE agency.agency IS
  'Registered AI agency instances. scope=global agencies are shared across all projects; '
  'scope=tenant agencies are bound to a single project. The scope/project_id invariant is '
  'enforced by the agency_scope_check trigger. slug is the stable identifier used in '
  'routing, dispatch logs, and liaison messages.';

-- ============================================================
-- agency.agency_session — per-agency session telemetry (append-only, partitioned)
-- ============================================================
CREATE TABLE IF NOT EXISTS agency.agency_session (
  id              BIGINT       GENERATED ALWAYS AS IDENTITY,
  agency_id       BIGINT       NOT NULL
                               REFERENCES agency.agency (id) ON DELETE RESTRICT,
  project_id      BIGINT       NULL,
  started_at      TIMESTAMPTZ  NOT NULL,
  ended_at        TIMESTAMPTZ,
  slot_count_peak INT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS agency_session_agency_created
  ON agency.agency_session (agency_id, created_at DESC);

REVOKE UPDATE, DELETE ON agency.agency_session FROM PUBLIC;

CREATE OR REPLACE FUNCTION agency.deny_session_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agency.agency_session is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER agency_session_no_update
  BEFORE UPDATE ON agency.agency_session
  FOR EACH ROW EXECUTE FUNCTION agency.deny_session_mutation();

CREATE OR REPLACE TRIGGER agency_session_no_delete
  BEFORE DELETE ON agency.agency_session
  FOR EACH ROW EXECUTE FUNCTION agency.deny_session_mutation();

-- Register with pg_partman: monthly partitions, 90-day retention
SELECT partman.create_parent(
  p_parent_table   => 'agency.agency_session',
  p_control        => 'created_at',
  p_interval       => '1 month',
  p_start_partition => date_trunc('month', now())::text
);
UPDATE partman.part_config
  SET retention = '90 days', retention_keep_table = false
  WHERE parent_table = 'agency.agency_session';

COMMENT ON TABLE agency.agency_session IS
  'Append-only session telemetry for agency instances. Partitioned monthly; 90-day retention. '
  'Rows record session boundaries and peak concurrency for cost and capacity reporting.';

-- ============================================================
-- agency.liaison_message_kind_catalog — message kind registry
-- ============================================================
CREATE TABLE IF NOT EXISTS agency.liaison_message_kind_catalog (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT         UNIQUE NOT NULL,
  direction    TEXT         NOT NULL CHECK (direction IN ('inbound','outbound')),
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

CREATE OR REPLACE TRIGGER set_updated_at_liaison_kind
  BEFORE UPDATE ON agency.liaison_message_kind_catalog
  FOR EACH ROW EXECUTE FUNCTION agency.set_updated_at();

-- Seed: common liaison message kinds
INSERT INTO agency.liaison_message_kind_catalog (name, direction, owner_did)
VALUES
  ('spawn_request',     'outbound', 'did:agenthive:system'),
  ('spawn_ack',         'inbound',  'did:agenthive:system'),
  ('heartbeat',         'inbound',  'did:agenthive:system'),
  ('status_update',     'inbound',  'did:agenthive:system'),
  ('gate_decision',     'inbound',  'did:agenthive:system'),
  ('shutdown_request',  'outbound', 'did:agenthive:system'),
  ('shutdown_ack',      'inbound',  'did:agenthive:system')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- agency.liaison_message — inbound/outbound message log (append-only, partitioned)
-- ============================================================
CREATE TABLE IF NOT EXISTS agency.liaison_message (
  id          BIGINT       GENERATED ALWAYS AS IDENTITY,
  agency_id   BIGINT       NOT NULL
                           REFERENCES agency.agency (id) ON DELETE RESTRICT,
  kind_id     BIGINT       NOT NULL
                           REFERENCES agency.liaison_message_kind_catalog (id) ON DELETE RESTRICT,
  project_id  BIGINT       NULL,
  payload     JSONB        NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS liaison_message_agency_created
  ON agency.liaison_message (agency_id, created_at DESC);

REVOKE UPDATE, DELETE ON agency.liaison_message FROM PUBLIC;

CREATE OR REPLACE FUNCTION agency.deny_liaison_message_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agency.liaison_message is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER liaison_message_no_update
  BEFORE UPDATE ON agency.liaison_message
  FOR EACH ROW EXECUTE FUNCTION agency.deny_liaison_message_mutation();

CREATE OR REPLACE TRIGGER liaison_message_no_delete
  BEFORE DELETE ON agency.liaison_message
  FOR EACH ROW EXECUTE FUNCTION agency.deny_liaison_message_mutation();

SELECT partman.create_parent(
  p_parent_table   => 'agency.liaison_message',
  p_control        => 'created_at',
  p_interval       => '1 month',
  p_start_partition => date_trunc('month', now())::text
);
UPDATE partman.part_config
  SET retention = '14 days', retention_keep_table = false
  WHERE parent_table = 'agency.liaison_message';

COMMENT ON TABLE agency.liaison_message IS
  'Append-only log of all liaison messages exchanged with agencies. Partitioned monthly; '
  '14-day retention. payload JSONB is opaque at the schema layer — validation is in the '
  'liaison service.';

-- ============================================================
-- agency.agency_route_policy — per-agency model route allowlist/denylist
-- ============================================================
-- scope/project_id invariant enforced by check constraint
CREATE TABLE IF NOT EXISTS agency.agency_route_policy (
  id          BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agency_id   BIGINT       NOT NULL
                           REFERENCES agency.agency (id) ON DELETE CASCADE,
  route_id    BIGINT       NOT NULL
                           REFERENCES control_model.model_route (id) ON DELETE CASCADE,
  scope       TEXT         NOT NULL DEFAULT 'global'
                           CHECK (scope IN ('global','tenant')),
  project_id  BIGINT       NULL,
  allowed     BOOL         NOT NULL DEFAULT true,
  -- Catalog hygiene:
  owner_did   TEXT,
  lifecycle_status TEXT    NOT NULL DEFAULT 'active'
                           CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_route_policy_unique
  ON agency.agency_route_policy (agency_id, route_id, scope, (COALESCE(project_id, 0)));

CREATE INDEX IF NOT EXISTS agency_route_policy_agency_route
  ON agency.agency_route_policy (agency_id, route_id);

CREATE OR REPLACE TRIGGER set_updated_at_agency_route_policy
  BEFORE UPDATE ON agency.agency_route_policy
  FOR EACH ROW EXECUTE FUNCTION agency.set_updated_at();

COMMENT ON TABLE agency.agency_route_policy IS
  'Per-agency route policies controlling which model_routes an agency may use. '
  'scope=global policies apply across all projects; scope=tenant policies apply to '
  'a single project. allowed=false is a hard deny. Used by the route picker (P747 D2).';

-- ============================================================
-- Views
-- ============================================================
CREATE OR REPLACE VIEW agency.v_active_agencies AS
SELECT
  a.id,
  a.slug,
  a.name,
  a.scope,
  a.project_id,
  a.status,
  a.last_seen_at,
  a.concurrent_slot_cap,
  a.spawn_fail_count,
  p.name AS provider_name,
  p.homepage_url
FROM agency.agency a
JOIN agency.agency_provider p ON p.id = a.provider_id
WHERE a.lifecycle_status = 'active'
  AND a.status != 'retired';

COMMENT ON VIEW agency.v_active_agencies IS
  'Active agency instances with provider metadata. Excludes retired and deprecated agencies.';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA agency TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA agency TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON agency.agency              TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON agency.agency_route_policy TO agenthive_orchestrator;
    GRANT INSERT          ON agency.liaison_message    TO agenthive_orchestrator;
    GRANT INSERT          ON agency.agency_session     TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA agency TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA agency TO agenthive_agency;
    GRANT SELECT ON ALL TABLES IN SCHEMA agency TO agenthive_agency;
    GRANT INSERT ON agency.liaison_message TO agenthive_agency;
    GRANT INSERT ON agency.agency_session  TO agenthive_agency;
    GRANT UPDATE (status, last_seen_at, spawn_fail_count, updated_at)
      ON agency.agency TO agenthive_agency;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA agency TO agenthive_agency;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA agency TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA agency TO agenthive_observability;
  END IF;
END $$;

\echo 'agency schema applied.'
