-- Discord Bridge: Channel Identity Mapping & Message ACK Tracking
-- Proposal: P221
-- Tables: discord_channel_mapping, discord_message_ack

BEGIN;

-- Channel identity mapping: AgentHive A2A channels → Discord channels
CREATE TABLE IF NOT EXISTS roadmap.discord_channel_mapping (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    agentive_channel TEXT NOT NULL UNIQUE,  -- 'broadcast', 'team:engineering', etc.
    discord_channel_id TEXT NOT NULL,
    discord_channel_name TEXT,
    discord_guild_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discord_mapping_agentive
    ON roadmap.discord_channel_mapping(agentive_channel)
    WHERE enabled = true;

CREATE INDEX idx_discord_mapping_discord
    ON roadmap.discord_channel_mapping(discord_channel_id);

-- Message delivery acknowledgment tracking
CREATE TABLE IF NOT EXISTS roadmap.discord_message_ack (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    agentive_msg_id TEXT NOT NULL UNIQUE,
    discord_msg_id TEXT,
    discord_channel_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'retrying')),
    attempt_count INTEGER NOT NULL DEFAULT 1,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    error_reason TEXT,
    acked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discord_ack_agentive_msg
    ON roadmap.discord_message_ack(agentive_msg_id);

CREATE INDEX idx_discord_ack_status
    ON roadmap.discord_message_ack(status, last_attempt_at)
    WHERE status != 'sent';

-- Seed default channel mapping (broadcast → main Discord channel)
INSERT INTO roadmap.discord_channel_mapping
    (agentive_channel, discord_channel_id, discord_channel_name, discord_guild_id)
VALUES
    ('broadcast', '1480366428325548200', 'bot-home', '1480366427851460719')
ON CONFLICT (agentive_channel) DO NOTHING;

COMMIT;
