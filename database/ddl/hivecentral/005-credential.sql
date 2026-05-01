-- ============================================================
-- P596: credential DDL for hiveCentral
-- Secret vault provider registry, named credential catalog,
-- per-grantee access grants, and append-only rotation audit log.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (r on vault_provider/credential, rw on credential_grant),
--             agenthive_observability (r everywhere),
--             agenthive_agency (r on credential/credential_grant — resolved credentials
--               are injected at spawn; secrets never stored in this schema)
-- Min PG:     14  (required for CREATE OR REPLACE TRIGGER)
-- ============================================================
-- SECURITY NOTE: This schema stores metadata about secrets — paths, provider
-- references, rotation schedules — but NEVER the secret values themselves.
-- Actual secret material lives in the configured vault_provider backend.
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS control_credential;

COMMENT ON SCHEMA control_credential IS
  'Credential management layer for hiveCentral: registered vault backend providers, '
  'named secret references (not the secrets themselves), per-grantee access grants, '
  'and append-only rotation log. Secret values are always retrieved at runtime from '
  'the vault backend; this schema holds only metadata and access control.';

-- ============================================================
-- control_credential.set_updated_at() — trigger function
-- Uses clock_timestamp() so updated_at advances within a transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION control_credential.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- control_credential.vault_provider — registered secret backends
-- ============================================================
CREATE TABLE IF NOT EXISTS control_credential.vault_provider (
  id               BIGSERIAL    PRIMARY KEY,
  slug             TEXT         UNIQUE NOT NULL,            -- 'env-default', 'hcp-prod', 'aws-us-east-1'
  provider_type    TEXT         NOT NULL
                               CHECK (provider_type IN ('env','file','hcp_vault','aws_secrets')),
  config           JSONB        NOT NULL DEFAULT '{}',      -- non-secret config: URLs, mount paths, regions
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

CREATE INDEX IF NOT EXISTS vault_provider_type_active
  ON control_credential.vault_provider (provider_type)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS vault_provider_deprecated_at
  ON control_credential.vault_provider (deprecated_at);

COMMENT ON TABLE control_credential.vault_provider IS
  'Registry of secret backend providers. Each row describes how to reach a vault '
  'system; the config JSONB holds non-sensitive parameters (URL, mount path, region). '
  'Credentials for accessing the vault itself are bootstrapped out-of-band and never '
  'stored in this table.';

COMMENT ON COLUMN control_credential.vault_provider.slug IS
  'Short identifier for this provider, e.g. ''env-default'', ''hcp-prod''. '
  'Referenced by control_credential.credential.vault_provider_id.';

COMMENT ON COLUMN control_credential.vault_provider.provider_type IS
  'env = read from process environment; file = read from file on disk; '
  'hcp_vault = HashiCorp Vault (HCP or self-hosted); aws_secrets = AWS Secrets Manager.';

COMMENT ON COLUMN control_credential.vault_provider.config IS
  'Non-secret configuration JSONB, e.g. {"url": "https://vault.example.com", '
  '"mount": "secret", "region": "us-east-1"}. Must NOT contain secret values.';

CREATE OR REPLACE TRIGGER set_updated_at_vault_provider
  BEFORE UPDATE ON control_credential.vault_provider
  FOR EACH ROW EXECUTE FUNCTION control_credential.set_updated_at();

-- ============================================================
-- control_credential.credential — named secret references
-- ============================================================
CREATE TABLE IF NOT EXISTS control_credential.credential (
  id                       BIGSERIAL    PRIMARY KEY,
  credential_name          TEXT         UNIQUE NOT NULL,    -- 'anthropic-api-key', 'postgres-agenthive'
  vault_provider_id        BIGINT       NOT NULL
                                        REFERENCES control_credential.vault_provider (id) ON DELETE RESTRICT,
  vault_path               TEXT         NOT NULL,           -- path / key name within the provider
  credential_type          TEXT         NOT NULL
                                        CHECK (credential_type IN ('api_key','oauth_token','tls_cert','db_password','generic')),
  last_rotated_at          TIMESTAMPTZ,
  rotation_interval_hours  INT,                             -- NULL = manual rotation only
  -- Catalog hygiene:
  owner_did                TEXT         NOT NULL,
  lifecycle_status         TEXT         NOT NULL DEFAULT 'active'
                                        CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at            TIMESTAMPTZ,
  retire_after             TIMESTAMPTZ,
  notes                    TEXT,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credential_provider_active
  ON control_credential.credential (vault_provider_id)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS credential_type_active
  ON control_credential.credential (credential_type)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS credential_rotation_due
  ON control_credential.credential (last_rotated_at, rotation_interval_hours)
  WHERE lifecycle_status = 'active' AND rotation_interval_hours IS NOT NULL;

CREATE INDEX IF NOT EXISTS credential_deprecated_at
  ON control_credential.credential (deprecated_at);

COMMENT ON TABLE control_credential.credential IS
  'Named secret references. Each row points to a location in a vault_provider; '
  'the actual secret value is fetched at runtime and never stored here. '
  'credential_name is the stable handle used in spawn policies and model_route.api_key_env. '
  'rotation_interval_hours drives the scheduled rotation job; NULL means manual only.';

COMMENT ON COLUMN control_credential.credential.vault_path IS
  'Path or key name within the vault provider, e.g. ''secret/data/anthropic/api-key'' '
  'for HCP Vault, or ''ANTHROPIC_API_KEY'' for env provider.';

COMMENT ON COLUMN control_credential.credential.last_rotated_at IS
  'Timestamp of the most recent successful rotation. NULL if never rotated by the '
  'rotation subsystem (manual injection or initial bootstrap).';

COMMENT ON COLUMN control_credential.credential.rotation_interval_hours IS
  'How often to rotate, in hours. NULL = manual rotation only. '
  'The rotation scheduler queries: last_rotated_at + rotation_interval_hours * interval ''1 hour'' < now().';

CREATE OR REPLACE TRIGGER set_updated_at_credential
  BEFORE UPDATE ON control_credential.credential
  FOR EACH ROW EXECUTE FUNCTION control_credential.set_updated_at();

-- ============================================================
-- control_credential.credential_grant — access grants
-- ============================================================
-- Simplified hygiene: no lifecycle fields. Grants are scoped by
-- expires_at; expired grants are treated as revoked. created_at
-- provides the insertion audit trail.
CREATE TABLE IF NOT EXISTS control_credential.credential_grant (
  id             BIGSERIAL    PRIMARY KEY,
  credential_id  BIGINT       NOT NULL
                              REFERENCES control_credential.credential (id) ON DELETE CASCADE,
  grantee_type   TEXT         NOT NULL
                              CHECK (grantee_type IN ('principal','agency','project','model_route')),
  grantee_id     TEXT         NOT NULL,
  granted_by     TEXT         NOT NULL,                     -- DID of the principal that created this grant
  expires_at     TIMESTAMPTZ,                               -- NULL = permanent until explicitly revoked
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (credential_id, grantee_type, grantee_id)
);

CREATE INDEX IF NOT EXISTS credential_grant_grantee
  ON control_credential.credential_grant (grantee_type, grantee_id);

CREATE INDEX IF NOT EXISTS credential_grant_expiry
  ON control_credential.credential_grant (expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE control_credential.credential_grant IS
  'Access control grants: which grantee (principal, agency, project, or model_route) '
  'may fetch the referenced credential from its vault at runtime. '
  'The UNIQUE constraint prevents duplicate grants for the same (credential, grantee). '
  'Grants are not hard-deleted; set expires_at to a past timestamp to revoke, '
  'or DELETE if the credential is being fully removed. Enforcement is in the '
  'credential-fetch path of the agency spawn flow.';

COMMENT ON COLUMN control_credential.credential_grant.grantee_type IS
  'principal = a control_identity.principal by DID; agency = an agency slug; '
  'project = a control_project.project by slug; model_route = a control_model.model_route by name.';

COMMENT ON COLUMN control_credential.credential_grant.grantee_id IS
  'The identifier of the grantee, interpreted according to grantee_type: '
  'DID for principal, slug for agency/project, route_name for model_route.';

COMMENT ON COLUMN control_credential.credential_grant.granted_by IS
  'DID of the principal that authorised this grant. Required for audit.';

-- ============================================================
-- control_credential.rotation_log — append-only rotation audit
-- ============================================================
CREATE TABLE IF NOT EXISTS control_credential.rotation_log (
  id              BIGSERIAL    PRIMARY KEY,
  credential_id   BIGINT       NOT NULL
                               REFERENCES control_credential.credential (id) ON DELETE RESTRICT,
  rotated_by      TEXT         NOT NULL,                    -- DID of actor or 'scheduler' for automated runs
  outcome         TEXT         NOT NULL CHECK (outcome IN ('success','failure')),
  error_message   TEXT,                                     -- populated on outcome = 'failure'
  rotated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rotation_log_credential_time
  ON control_credential.rotation_log (credential_id, rotated_at DESC);

CREATE INDEX IF NOT EXISTS rotation_log_outcome
  ON control_credential.rotation_log (outcome, rotated_at DESC)
  WHERE outcome = 'failure';

COMMENT ON TABLE control_credential.rotation_log IS
  'Append-only log of every credential rotation attempt, successful or not. '
  'On success: control_credential.credential.last_rotated_at is updated by the '
  'rotation job after inserting this row. On failure: error_message captures the '
  'reason for alerting and retry. Rows must never be updated or deleted.';

COMMENT ON COLUMN control_credential.rotation_log.rotated_by IS
  'DID of the principal that triggered rotation, or the literal string ''scheduler'' '
  'for automated interval-based rotations.';

-- Append-only enforcement at the SQL level.
REVOKE UPDATE, DELETE ON control_credential.rotation_log FROM PUBLIC;

CREATE OR REPLACE FUNCTION control_credential.deny_rotation_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'control_credential.rotation_log is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER rotation_log_no_update
  BEFORE UPDATE ON control_credential.rotation_log
  FOR EACH ROW EXECUTE FUNCTION control_credential.deny_rotation_log_mutation();

CREATE OR REPLACE TRIGGER rotation_log_no_delete
  BEFORE DELETE ON control_credential.rotation_log
  FOR EACH ROW EXECUTE FUNCTION control_credential.deny_rotation_log_mutation();

-- ============================================================
-- Views
-- ============================================================
CREATE OR REPLACE VIEW control_credential.v_active_credentials AS
SELECT
  c.id,
  c.credential_name,
  c.credential_type,
  c.vault_path,
  vp.slug            AS provider_slug,
  vp.provider_type,
  c.last_rotated_at,
  c.rotation_interval_hours,
  CASE
    WHEN c.rotation_interval_hours IS NULL THEN NULL
    WHEN c.last_rotated_at IS NULL        THEN true
    WHEN c.last_rotated_at + (c.rotation_interval_hours * interval '1 hour') < now() THEN true
    ELSE false
  END                AS rotation_overdue
FROM control_credential.credential c
JOIN control_credential.vault_provider vp ON vp.id = c.vault_provider_id
WHERE c.lifecycle_status = 'active'
  AND vp.lifecycle_status = 'active';

COMMENT ON VIEW control_credential.v_active_credentials IS
  'Active credentials with vault provider metadata and rotation_overdue flag. '
  'The rotation scheduler queries WHERE rotation_overdue = true.';

CREATE OR REPLACE VIEW control_credential.v_active_grants AS
SELECT
  cg.id,
  c.credential_name,
  c.credential_type,
  cg.grantee_type,
  cg.grantee_id,
  cg.granted_by,
  cg.expires_at,
  (cg.expires_at IS NOT NULL AND cg.expires_at <= now()) AS is_expired,
  cg.created_at
FROM control_credential.credential_grant cg
JOIN control_credential.credential c ON c.id = cg.credential_id
WHERE c.lifecycle_status = 'active';

COMMENT ON VIEW control_credential.v_active_grants IS
  'Credential grants with resolved credential name and is_expired flag. '
  'The fetch path filters WHERE NOT is_expired.';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA control_credential TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA control_credential TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON control_credential.credential_grant TO agenthive_orchestrator;
    GRANT INSERT         ON control_credential.rotation_log     TO agenthive_orchestrator;
    GRANT UPDATE (last_rotated_at, updated_at) ON control_credential.credential TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA control_credential TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA control_credential TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA control_credential TO agenthive_observability;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA control_credential TO agenthive_agency;
    GRANT SELECT ON control_credential.credential,
                    control_credential.credential_grant,
                    control_credential.vault_provider,
                    control_credential.v_active_credentials,
                    control_credential.v_active_grants TO agenthive_agency;
  END IF;
END $$;

\echo 'control_credential schema applied.'
