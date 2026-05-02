-- ============================================================
-- 012-messaging: Agent-to-agent async messaging schema for hiveCentral
-- Topic bus, message log, subscriptions, dead-letter queue,
-- and cold-tier archive.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (rw topic/subscription, r all),
--             agenthive_agency (r topic/subscription, rw a2a_message),
--             agenthive_observability (r all)
-- Min PG:     16
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS messaging;

COMMENT ON SCHEMA messaging IS
  'Agent-to-agent async messaging bus. Topics are the routing key; agencies publish '
  'a2a_message rows and subscriptions route delivery. Undeliverable messages land in '
  'a2a_dlq. Long-term messages are archived in a2a_message_archive for audit.';

-- ============================================================
-- messaging.set_updated_at()
-- ============================================================
CREATE OR REPLACE FUNCTION messaging.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- messaging.a2a_topic — topic registry
-- ============================================================
CREATE TABLE IF NOT EXISTS messaging.a2a_topic (
  id                     BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                   TEXT         UNIQUE NOT NULL,
  retention_days         INT          NOT NULL DEFAULT 14,
  max_message_size_bytes INT          NOT NULL DEFAULT 65536,
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

CREATE OR REPLACE TRIGGER set_updated_at_a2a_topic
  BEFORE UPDATE ON messaging.a2a_topic
  FOR EACH ROW EXECUTE FUNCTION messaging.set_updated_at();

COMMENT ON TABLE messaging.a2a_topic IS
  'Registered message bus topics. retention_days is advisory for partition pruning; '
  'max_message_size_bytes is enforced by the messaging service, not the DB.';

-- ============================================================
-- messaging.a2a_message — main message log (append-only, partitioned monthly, 14d)
-- ============================================================
CREATE TABLE IF NOT EXISTS messaging.a2a_message (
  id                BIGINT       GENERATED ALWAYS AS IDENTITY,
  topic_id          BIGINT       NOT NULL
                                 REFERENCES messaging.a2a_topic (id) ON DELETE RESTRICT,
  sender_agency_id  BIGINT       NOT NULL
                                 REFERENCES agency.agency (id) ON DELETE RESTRICT,
  project_id        BIGINT       NULL,
  payload           JSONB        NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS a2a_message_topic_created
  ON messaging.a2a_message (topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS a2a_message_sender_created
  ON messaging.a2a_message (sender_agency_id, created_at DESC);

REVOKE UPDATE, DELETE ON messaging.a2a_message FROM PUBLIC;

CREATE OR REPLACE FUNCTION messaging.deny_a2a_message_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'messaging.a2a_message is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER a2a_message_no_update
  BEFORE UPDATE ON messaging.a2a_message
  FOR EACH ROW EXECUTE FUNCTION messaging.deny_a2a_message_mutation();

CREATE OR REPLACE TRIGGER a2a_message_no_delete
  BEFORE DELETE ON messaging.a2a_message
  FOR EACH ROW EXECUTE FUNCTION messaging.deny_a2a_message_mutation();

SELECT partman.create_parent(
  p_parent_table    => 'messaging.a2a_message',
  p_control         => 'created_at',
  p_interval        => '1 month',
  p_start_partition => date_trunc('month', now())::text
);
UPDATE partman.part_config
  SET retention = '14 days', retention_keep_table = false
  WHERE parent_table = 'messaging.a2a_message';

COMMENT ON TABLE messaging.a2a_message IS
  'Append-only agent-to-agent message log. Partitioned monthly; 14-day retention. '
  'project_id is denormalized for fast per-project scans without joining agency.';

-- ============================================================
-- messaging.a2a_subscription — topic subscription registry
-- ============================================================
CREATE TABLE IF NOT EXISTS messaging.a2a_subscription (
  id                   BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id             BIGINT       NOT NULL
                                    REFERENCES messaging.a2a_topic (id) ON DELETE CASCADE,
  receiver_agency_id   BIGINT       NOT NULL
                                    REFERENCES agency.agency (id) ON DELETE CASCADE,
  filter_expr          TEXT,
  is_active            BOOL         NOT NULL DEFAULT true,
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (topic_id, receiver_agency_id)
);

CREATE INDEX IF NOT EXISTS a2a_subscription_receiver
  ON messaging.a2a_subscription (receiver_agency_id)
  WHERE is_active = true;

CREATE OR REPLACE TRIGGER set_updated_at_a2a_subscription
  BEFORE UPDATE ON messaging.a2a_subscription
  FOR EACH ROW EXECUTE FUNCTION messaging.set_updated_at();

COMMENT ON TABLE messaging.a2a_subscription IS
  'Topic subscriptions: one row per (topic, receiver_agency) pair. '
  'filter_expr is an application-evaluated predicate on the payload; '
  'the DB does not enforce it. is_active=false suspends delivery without deleting.';

-- ============================================================
-- messaging.a2a_dlq — dead-letter queue (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS messaging.a2a_dlq (
  id             BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id     BIGINT       NOT NULL,   -- soft FK to a2a_message.id
  error          TEXT         NOT NULL,
  retry_count    INT          NOT NULL DEFAULT 0,
  last_retry_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS a2a_dlq_message_id
  ON messaging.a2a_dlq (message_id);

REVOKE UPDATE, DELETE ON messaging.a2a_dlq FROM PUBLIC;

CREATE OR REPLACE FUNCTION messaging.deny_a2a_dlq_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'messaging.a2a_dlq is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER a2a_dlq_no_update
  BEFORE UPDATE ON messaging.a2a_dlq
  FOR EACH ROW EXECUTE FUNCTION messaging.deny_a2a_dlq_mutation();

CREATE OR REPLACE TRIGGER a2a_dlq_no_delete
  BEFORE DELETE ON messaging.a2a_dlq
  FOR EACH ROW EXECUTE FUNCTION messaging.deny_a2a_dlq_mutation();

COMMENT ON TABLE messaging.a2a_dlq IS
  'Append-only dead-letter queue. Each failed delivery appends a new row. '
  'message_id is a soft FK (partitioned tables cannot have FKs in PG16). '
  'retry_count and last_retry_at are set by the messaging service at insert time.';

-- ============================================================
-- messaging.a2a_message_archive — cold-tier archive (append-only, partitioned yearly)
-- ============================================================
CREATE TABLE IF NOT EXISTS messaging.a2a_message_archive (
  id                BIGINT       NOT NULL,
  topic_id          BIGINT       NOT NULL,
  sender_agency_id  BIGINT       NOT NULL,
  project_id        BIGINT,
  payload           JSONB        NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL,
  archived_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS a2a_message_archive_topic_created
  ON messaging.a2a_message_archive (topic_id, created_at DESC);

REVOKE UPDATE, DELETE ON messaging.a2a_message_archive FROM PUBLIC;

CREATE OR REPLACE FUNCTION messaging.deny_a2a_message_archive_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'messaging.a2a_message_archive is append-only (op=%)', TG_OP;
END;
$$;

CREATE OR REPLACE TRIGGER a2a_message_archive_no_update
  BEFORE UPDATE ON messaging.a2a_message_archive
  FOR EACH ROW EXECUTE FUNCTION messaging.deny_a2a_message_archive_mutation();

CREATE OR REPLACE TRIGGER a2a_message_archive_no_delete
  BEFORE DELETE ON messaging.a2a_message_archive
  FOR EACH ROW EXECUTE FUNCTION messaging.deny_a2a_message_archive_mutation();

SELECT partman.create_parent(
  p_parent_table    => 'messaging.a2a_message_archive',
  p_control         => 'created_at',
  p_interval        => '1 year',
  p_start_partition => date_trunc('year', now())::text
);
-- No retention on archive: permanent cold tier

COMMENT ON TABLE messaging.a2a_message_archive IS
  'Permanent cold-tier archive of a2a messages. Partitioned yearly; no retention pruning. '
  'Populated by the messaging service archival job before the hot partition is pruned.';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA messaging TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA messaging TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON messaging.a2a_topic        TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON messaging.a2a_subscription TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA messaging TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA messaging TO agenthive_agency;
    GRANT SELECT ON
      messaging.a2a_topic,
      messaging.a2a_subscription,
      messaging.a2a_message,
      messaging.a2a_dlq,
      messaging.a2a_message_archive
    TO agenthive_agency;
    GRANT INSERT ON messaging.a2a_message TO agenthive_agency;
    GRANT INSERT ON messaging.a2a_dlq     TO agenthive_agency;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA messaging TO agenthive_agency;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA messaging TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA messaging TO agenthive_observability;
  END IF;
END $$;

\echo 'messaging schema applied.'
