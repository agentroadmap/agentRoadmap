-- P208: Agent Trust & Authorization Model — channel_identities + agent_trust_audit
--
-- Creates:
--   1. roadmap_messaging schema with channel_identities table
--   2. agent_trust_audit table in roadmap_workforce (audit trail for trust changes)
--
-- The agent_trust table already exists with the correct schema and constraints.

BEGIN;

-- 1. roadmap_messaging schema + channel_identities table

CREATE SCHEMA IF NOT EXISTS roadmap_messaging;

CREATE TABLE IF NOT EXISTS roadmap_messaging.channel_identities (
    id              BIGSERIAL PRIMARY KEY,
    channel         TEXT NOT NULL,          -- 'discord', 'telegram', 'slack', etc.
    external_id     TEXT NOT NULL,          -- platform-specific user ID
    external_handle TEXT,                   -- human-readable handle (@user, username#discriminator)
    agent_identity  TEXT NOT NULL REFERENCES roadmap_workforce.agent_registry(agent_identity) ON DELETE CASCADE,
    trust_tier      TEXT NOT NULL DEFAULT 'restricted'
                    CHECK (trust_tier IN ('authority','trusted','known','restricted','blocked')),
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    mapped_by       TEXT NOT NULL,          -- agent that created the mapping
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,           -- NULL = never expires
    UNIQUE (channel, external_id)
);

COMMENT ON TABLE roadmap_messaging.channel_identities IS
    'Maps external platform identities (Discord, Telegram, Slack) to internal agent identities with trust tier.';

CREATE INDEX idx_channel_identities_agent ON roadmap_messaging.channel_identities (agent_identity);
CREATE INDEX idx_channel_identities_channel ON roadmap_messaging.channel_identities (channel);
CREATE INDEX idx_channel_identities_expires ON roadmap_messaging.channel_identities (expires_at) WHERE expires_at IS NOT NULL;

-- 2. agent_trust_audit table

CREATE TABLE IF NOT EXISTS roadmap_workforce.agent_trust_audit (
    id              BIGSERIAL PRIMARY KEY,
    agent_identity  TEXT NOT NULL,
    trusted_agent   TEXT NOT NULL,
    old_tier        TEXT,
    new_tier        TEXT NOT NULL,
    modified_by     TEXT NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roadmap_workforce.agent_trust_audit IS
    'Audit trail for all trust tier changes between agents.';

CREATE INDEX idx_trust_audit_agent ON roadmap_workforce.agent_trust_audit (agent_identity);
CREATE INDEX idx_trust_audit_trusted ON roadmap_workforce.agent_trust_audit (trusted_agent);
CREATE INDEX idx_trust_audit_created ON roadmap_workforce.agent_trust_audit (created_at);

COMMIT;
