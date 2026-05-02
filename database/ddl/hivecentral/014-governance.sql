-- ============================================================
-- 014-governance: Policy versioning, audit decision log,
-- compliance checks, and event-sourcing spine for hiveCentral.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (rw policy_version, r all),
--             agenthive_agency (r all, w decision_log/compliance_check/event_log),
--             agenthive_observability (r all)
-- Depends on: pgcrypto (for sha256 in decision_log hash chain)
-- Min PG:     16
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS governance;

COMMENT ON SCHEMA governance IS
  'Governance layer: immutable policy versions, hash-chained decision log, compliance check '
  'records, and a permanent event-sourcing spine. pgcrypto is required for the sha256 '
  'hash chain in decision_log.';

-- ============================================================
-- governance.set_updated_at()
-- ============================================================
CREATE OR REPLACE FUNCTION governance.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- governance.policy_version — versioned policy documents
-- Rows are immutable once published_at IS NOT NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION governance.deny_published_policy_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'governance.policy_version rows are immutable once published (published_at=%)', OLD.published_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS governance.policy_version (
  id            BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT         NOT NULL,
  version       INT          NOT NULL,
  content_hash  TEXT         NOT NULL,
  body          JSONB        NOT NULL,
  published_at  TIMESTAMPTZ,
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS policy_version_name_published
  ON governance.policy_version (name, published_at DESC NULLS LAST);

CREATE OR REPLACE TRIGGER policy_version_immutable_after_publish
  BEFORE UPDATE ON governance.policy_version
  FOR EACH ROW EXECUTE FUNCTION governance.deny_published_policy_update();

CREATE OR REPLACE TRIGGER set_updated_at_policy_version
  BEFORE UPDATE ON governance.policy_version
  FOR EACH ROW EXECUTE FUNCTION governance.set_updated_at();

COMMENT ON TABLE governance.policy_version IS
  'Versioned policy documents. A row is mutable until published_at IS NOT NULL; after '
  'that the BEFORE UPDATE trigger rejects any change. content_hash is application-computed '
  '(SHA-256 of the body). To supersede a policy: INSERT a new row with version+1 and '
  'SET old_row.lifecycle_status = deprecated.';

-- ============================================================
-- governance.decision_log — hash-chained audit log (append-only, partitioned monthly, permanent)
-- this_hash = sha256(proposal_id || actor_did || decision || COALESCE(rationale,'') || COALESCE(prev_hash,''))
-- The application computes this_hash inside a serialized TX to guarantee chain integrity.
-- ============================================================
CREATE TABLE IF NOT EXISTS governance.decision_log (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY,
  proposal_id  BIGINT       NOT NULL,
  actor_did    TEXT         NOT NULL,
  decision     TEXT         NOT NULL,
  rationale    TEXT,
  prev_hash    TEXT,
  this_hash    TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS decision_log_proposal_created
  ON governance.decision_log (proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS decision_log_actor_created
  ON governance.decision_log (actor_did, created_at DESC);

REVOKE UPDATE, DELETE ON governance.decision_log FROM PUBLIC;

CREATE OR REPLACE FUNCTION governance.deny_decision_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'governance.decision_log is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER decision_log_no_update
  BEFORE UPDATE ON governance.decision_log
  FOR EACH ROW EXECUTE FUNCTION governance.deny_decision_log_mutation();

CREATE OR REPLACE TRIGGER decision_log_no_delete
  BEFORE DELETE ON governance.decision_log
  FOR EACH ROW EXECUTE FUNCTION governance.deny_decision_log_mutation();

SELECT partman.create_parent(
  p_parent_table    => 'governance.decision_log',
  p_control         => 'created_at',
  p_interval        => '1 month',
  p_start_partition => date_trunc('month', now())::text
);
-- Permanent: no retention set

COMMENT ON TABLE governance.decision_log IS
  'Append-only, hash-chained audit log of every governance decision. '
  'this_hash = sha256(proposal_id || actor_did || decision || rationale || prev_hash) '
  'computed by the application inside a SERIALIZABLE transaction. prev_hash NULL on the '
  'first row per proposal; subsequent rows chain to the prior this_hash. '
  'Partitioned monthly; permanent retention (no pruning).';

-- ============================================================
-- governance.compliance_check — policy compliance results (append-only, partitioned monthly, 1y)
-- ============================================================
CREATE TABLE IF NOT EXISTS governance.compliance_check (
  id                 BIGINT       GENERATED ALWAYS AS IDENTITY,
  policy_version_id  BIGINT
                     REFERENCES governance.policy_version (id) ON DELETE SET NULL,
  target_kind        TEXT         NOT NULL,   -- 'proposal','agency','project','route'
  target_id          BIGINT       NOT NULL,
  project_id         BIGINT,
  passed             BOOL         NOT NULL,
  findings           JSONB,
  checked_at         TIMESTAMPTZ  NOT NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS compliance_check_target
  ON governance.compliance_check (target_kind, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS compliance_check_project_created
  ON governance.compliance_check (project_id, created_at DESC);

REVOKE UPDATE, DELETE ON governance.compliance_check FROM PUBLIC;

CREATE OR REPLACE FUNCTION governance.deny_compliance_check_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'governance.compliance_check is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER compliance_check_no_update
  BEFORE UPDATE ON governance.compliance_check
  FOR EACH ROW EXECUTE FUNCTION governance.deny_compliance_check_mutation();

CREATE OR REPLACE TRIGGER compliance_check_no_delete
  BEFORE DELETE ON governance.compliance_check
  FOR EACH ROW EXECUTE FUNCTION governance.deny_compliance_check_mutation();

SELECT partman.create_parent(
  p_parent_table    => 'governance.compliance_check',
  p_control         => 'created_at',
  p_interval        => '1 month',
  p_start_partition => date_trunc('month', now())::text
);
UPDATE partman.part_config
  SET retention = '1 year', retention_keep_table = false
  WHERE parent_table = 'governance.compliance_check';

COMMENT ON TABLE governance.compliance_check IS
  'Append-only compliance check results. Each automated policy evaluation appends a row. '
  'findings JSONB holds structured failure details. Partitioned monthly; 1-year retention.';

-- ============================================================
-- governance.event_log — event-sourcing spine (append-only, partitioned monthly, permanent)
-- ============================================================
CREATE TABLE IF NOT EXISTS governance.event_log (
  id          BIGINT       GENERATED ALWAYS AS IDENTITY,
  event_kind  TEXT         NOT NULL,
  project_id  BIGINT,
  actor_did   TEXT,
  payload     JSONB        NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS event_log_kind_project_created
  ON governance.event_log (event_kind, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS event_log_actor_created
  ON governance.event_log (actor_did, created_at DESC);

REVOKE UPDATE, DELETE ON governance.event_log FROM PUBLIC;

CREATE OR REPLACE FUNCTION governance.deny_event_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'governance.event_log is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER event_log_no_update
  BEFORE UPDATE ON governance.event_log
  FOR EACH ROW EXECUTE FUNCTION governance.deny_event_log_mutation();

CREATE OR REPLACE TRIGGER event_log_no_delete
  BEFORE DELETE ON governance.event_log
  FOR EACH ROW EXECUTE FUNCTION governance.deny_event_log_mutation();

SELECT partman.create_parent(
  p_parent_table    => 'governance.event_log',
  p_control         => 'created_at',
  p_interval        => '1 month',
  p_start_partition => date_trunc('month', now())::text
);
-- Permanent: no retention set

COMMENT ON TABLE governance.event_log IS
  'Permanent event-sourcing spine for all system-level events. Every significant state '
  'change (proposal advance, policy publish, compliance failure, agent spawn) should emit '
  'an event_log row. event_kind is a dotted namespace (e.g. proposal.advanced, '
  'policy.published). Partitioned monthly; permanent retention.';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA governance TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA governance TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON governance.policy_version TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA governance TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA governance TO agenthive_agency;
    GRANT SELECT ON ALL TABLES IN SCHEMA governance TO agenthive_agency;
    GRANT INSERT ON governance.decision_log    TO agenthive_agency;
    GRANT INSERT ON governance.compliance_check TO agenthive_agency;
    GRANT INSERT ON governance.event_log        TO agenthive_agency;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA governance TO agenthive_agency;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA governance TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA governance TO agenthive_observability;
  END IF;
END $$;

\echo 'governance schema applied.'
