-- ============================================================
-- P593: identity DDL for hiveCentral
-- Principals, DID documents, public keys, and audit actions.
-- Every authenticated actor in the system (human, service, agent,
-- operator) has a principal row and a resolvable DID.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (rw on principal/principal_key, r on did_document),
--             agenthive_observability (r everywhere),
--             agenthive_agency (r on principal/did_document/principal_key),
--             agenthive_a2a (r on principal)
-- Min PG:     14  (required for CREATE OR REPLACE TRIGGER)
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS control_identity;

COMMENT ON SCHEMA control_identity IS
  'Identity layer for hiveCentral: principal registry, DID document storage, '
  'per-principal public key catalog, and append-only audit action log. '
  'Every authenticated actor system-wide (human, service, agent, operator) '
  'resolves to a row in control_identity.principal.';

-- ============================================================
-- control_identity.set_updated_at() — trigger function
-- Uses clock_timestamp() so updated_at advances within a transaction.
-- ============================================================
CREATE OR REPLACE FUNCTION control_identity.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- control_identity.principal — every authenticated actor
-- ============================================================
CREATE TABLE IF NOT EXISTS control_identity.principal (
  id               BIGSERIAL    PRIMARY KEY,
  did              TEXT         UNIQUE NOT NULL,
  display_name     TEXT,
  principal_type   TEXT         NOT NULL
                               CHECK (principal_type IN ('human','service','agent','operator')),
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

CREATE INDEX IF NOT EXISTS principal_did_active
  ON control_identity.principal (did)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS principal_type_active
  ON control_identity.principal (principal_type)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS principal_deprecated_at
  ON control_identity.principal (deprecated_at);

COMMENT ON TABLE control_identity.principal IS
  'Central registry of every authenticated actor: humans, service workers, AI agents, '
  'and operators. The did column is the globally unique Decentralised Identifier used '
  'to reference this principal across all schemas. Rows are never hard-deleted — '
  'use lifecycle_status = ''retired'' with deprecated_at set.';

COMMENT ON COLUMN control_identity.principal.did IS
  'Decentralised Identifier (e.g. did:hive:abc123). Globally unique, immutable once set.';

COMMENT ON COLUMN control_identity.principal.principal_type IS
  'human = operator/user; service = daemon/worker; agent = AI agent persona; '
  'operator = privileged platform administrator.';

CREATE OR REPLACE TRIGGER set_updated_at_principal
  BEFORE UPDATE ON control_identity.principal
  FOR EACH ROW EXECUTE FUNCTION control_identity.set_updated_at();

-- ============================================================
-- control_identity.did_document — versioned DID document store
-- ============================================================
-- owner_did hygiene field is omitted: ownership is conveyed by
-- principal_id (the subject of the document).
CREATE TABLE IF NOT EXISTS control_identity.did_document (
  id               BIGSERIAL    PRIMARY KEY,
  principal_id     BIGINT       NOT NULL
                               REFERENCES control_identity.principal (id) ON DELETE CASCADE,
  document         JSONB        NOT NULL,
  version          INT          NOT NULL DEFAULT 1,
  -- Catalog hygiene (owner_did replaced by principal_id):
  lifecycle_status TEXT         NOT NULL DEFAULT 'active'
                               CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at    TIMESTAMPTZ,
  retire_after     TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Only one active document version per principal at any time.
CREATE UNIQUE INDEX IF NOT EXISTS did_document_active_per_principal
  ON control_identity.did_document (principal_id)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS did_document_principal_version
  ON control_identity.did_document (principal_id, version DESC);

CREATE INDEX IF NOT EXISTS did_document_deprecated_at
  ON control_identity.did_document (deprecated_at);

COMMENT ON TABLE control_identity.did_document IS
  'Versioned DID document for each principal. A partial unique index ensures at '
  'most one active document per principal at any time. Previous versions are kept '
  'as deprecated rows for auditability. The document column follows the W3C DID '
  'Core spec (JSONB); resolvers must pick the row WHERE lifecycle_status = ''active''.';

COMMENT ON COLUMN control_identity.did_document.version IS
  'Monotonically increasing version counter within the principal. Increment on each '
  'rotation; prior version row should be deprecated before inserting the new one.';

CREATE OR REPLACE TRIGGER set_updated_at_did_document
  BEFORE UPDATE ON control_identity.did_document
  FOR EACH ROW EXECUTE FUNCTION control_identity.set_updated_at();

-- ============================================================
-- control_identity.principal_key — public key catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS control_identity.principal_key (
  id               BIGSERIAL    PRIMARY KEY,
  principal_id     BIGINT       NOT NULL
                               REFERENCES control_identity.principal (id) ON DELETE CASCADE,
  key_id           TEXT         NOT NULL,
  key_type         TEXT         NOT NULL,                   -- 'Ed25519VerificationKey2020', 'JsonWebKey2020', etc.
  public_key       TEXT         NOT NULL,                   -- Base58 / JWK / PEM depending on key_type
  purpose          TEXT         NOT NULL
                               CHECK (purpose IN ('auth','signing','encryption')),
  -- Catalog hygiene:
  owner_did        TEXT         NOT NULL,
  lifecycle_status TEXT         NOT NULL DEFAULT 'active'
                               CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at    TIMESTAMPTZ,
  retire_after     TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (principal_id, key_id)
);

CREATE INDEX IF NOT EXISTS principal_key_principal_active
  ON control_identity.principal_key (principal_id, purpose)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS principal_key_deprecated_at
  ON control_identity.principal_key (deprecated_at);

COMMENT ON TABLE control_identity.principal_key IS
  'Public key material for a principal, indexed by key_id (fragment identifier from DID). '
  'purpose distinguishes auth keys (used in challenge-response) from signing keys '
  '(used to sign payloads) and encryption keys (used for JWE). Key rotation: deprecate '
  'the old row and insert a new one; the DID document version must be bumped in sync.';

COMMENT ON COLUMN control_identity.principal_key.key_id IS
  'Key fragment identifier as it appears in the DID document, e.g. ''key-1''. '
  'Unique per principal.';

COMMENT ON COLUMN control_identity.principal_key.key_type IS
  'Cryptographic suite identifier, e.g. Ed25519VerificationKey2020, JsonWebKey2020, '
  'EcdsaSecp256k1VerificationKey2019.';

COMMENT ON COLUMN control_identity.principal_key.purpose IS
  'auth = challenge-response authentication; signing = payload/assertion signing; '
  'encryption = JWE key agreement.';

CREATE OR REPLACE TRIGGER set_updated_at_principal_key
  BEFORE UPDATE ON control_identity.principal_key
  FOR EACH ROW EXECUTE FUNCTION control_identity.set_updated_at();

-- ============================================================
-- control_identity.audit_action — append-only audit log
-- ============================================================
-- Hygiene-field exemption: no owner_did, no lifecycle_status.
-- Rationale: audit rows are immutable evidence; lifecycle management
-- would undermine their evidentiary value. created_at is the only
-- time column required.
CREATE TABLE IF NOT EXISTS control_identity.audit_action (
  id               BIGSERIAL    PRIMARY KEY,
  principal_id     BIGINT
                               REFERENCES control_identity.principal (id) ON DELETE RESTRICT,
  action           TEXT         NOT NULL,
  resource_type    TEXT,
  resource_id      TEXT,
  outcome          TEXT         NOT NULL CHECK (outcome IN ('allow','deny','error')),
  metadata         JSONB,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_action_principal_time
  ON control_identity.audit_action (principal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_action_resource
  ON control_identity.audit_action (resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_action_outcome
  ON control_identity.audit_action (outcome, created_at DESC)
  WHERE outcome IN ('deny','error');

COMMENT ON TABLE control_identity.audit_action IS
  'Append-only audit log of every access control decision. Rows must never be updated '
  'or deleted — they are the evidentiary record for compliance and forensics. '
  'principal_id may be NULL for unauthenticated (anonymous) attempts.';

COMMENT ON COLUMN control_identity.audit_action.action IS
  'Verb describing what was attempted, e.g. ''credential.read'', ''agent.spawn'', '
  '''flag.update''.';

COMMENT ON COLUMN control_identity.audit_action.outcome IS
  'allow = access granted; deny = rejected by policy; error = evaluation failed.';

COMMENT ON COLUMN control_identity.audit_action.metadata IS
  'Freeform JSONB for caller context: IP address, request_id, policy rule matched, etc.';

-- Append-only enforcement at the SQL level.
REVOKE UPDATE, DELETE ON control_identity.audit_action FROM PUBLIC;

CREATE OR REPLACE FUNCTION control_identity.deny_audit_action_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'control_identity.audit_action is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER audit_action_no_update
  BEFORE UPDATE ON control_identity.audit_action
  FOR EACH ROW EXECUTE FUNCTION control_identity.deny_audit_action_mutation();

CREATE OR REPLACE TRIGGER audit_action_no_delete
  BEFORE DELETE ON control_identity.audit_action
  FOR EACH ROW EXECUTE FUNCTION control_identity.deny_audit_action_mutation();

-- ============================================================
-- Views
-- ============================================================
CREATE OR REPLACE VIEW control_identity.v_active_principals AS
SELECT
  p.id,
  p.did,
  p.display_name,
  p.principal_type,
  p.owner_did,
  p.created_at
FROM control_identity.principal p
WHERE p.lifecycle_status = 'active';

COMMENT ON VIEW control_identity.v_active_principals IS
  'Active principals only. Used by dispatch and auth layers for identity resolution.';

CREATE OR REPLACE VIEW control_identity.v_principal_keys AS
SELECT
  p.did,
  p.principal_type,
  k.key_id,
  k.key_type,
  k.public_key,
  k.purpose,
  k.lifecycle_status AS key_status
FROM control_identity.principal p
JOIN control_identity.principal_key k ON k.principal_id = p.id
WHERE p.lifecycle_status = 'active';

COMMENT ON VIEW control_identity.v_principal_keys IS
  'Active principal public keys joined to their DID. Filter by purpose for the '
  'appropriate cryptographic operation.';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA control_identity TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA control_identity TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON control_identity.principal     TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON control_identity.principal_key TO agenthive_orchestrator;
    GRANT INSERT         ON control_identity.audit_action  TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA control_identity TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA control_identity TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA control_identity TO agenthive_observability;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA control_identity TO agenthive_agency;
    GRANT SELECT ON control_identity.principal,
                    control_identity.did_document,
                    control_identity.principal_key,
                    control_identity.v_active_principals,
                    control_identity.v_principal_keys TO agenthive_agency;
    GRANT INSERT ON control_identity.audit_action TO agenthive_agency;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA control_identity TO agenthive_agency;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_a2a') THEN
    GRANT USAGE ON SCHEMA control_identity TO agenthive_a2a;
    GRANT SELECT ON control_identity.principal,
                    control_identity.v_active_principals TO agenthive_a2a;
    GRANT INSERT ON control_identity.audit_action TO agenthive_a2a;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA control_identity TO agenthive_a2a;
  END IF;
END $$;

\echo 'control_identity schema applied.'
