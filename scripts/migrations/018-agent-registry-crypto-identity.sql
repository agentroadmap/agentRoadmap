-- Migration 018: Add crypto identity columns to agent_registry (P159)
-- Description: Add public_key and key_rotated_at for Ed25519 key management
-- Requires: 017-worktree-merge-log.sql
--
-- P080 proposed adding crypto identity columns and agent-identity.ts implements
-- Ed25519 key management, but the DB migration was never applied.
-- agent_registry still only has basic columns.
--
-- This migration:
--   1. Adds public_key TEXT NULL — stores the agent's Ed25519 public key (hex-encoded)
--   2. Adds key_rotated_at TIMESTAMPTZ NULL — timestamp of last key rotation

BEGIN;

SET search_path TO roadmap, public;

-- ─── 1. Add public_key column ────────────────────────────────────────────────

ALTER TABLE roadmap.agent_registry
    ADD COLUMN IF NOT EXISTS public_key text NULL;

COMMENT ON COLUMN roadmap.agent_registry.public_key IS
    'Ed25519 public key (hex-encoded) for agent cryptographic identity verification. '
    'Set by agent-identity.ts during key generation. NULL for agents without crypto identity.';


-- ─── 2. Add key_rotated_at column ───────────────────────────────────────────

ALTER TABLE roadmap.agent_registry
    ADD COLUMN IF NOT EXISTS key_rotated_at timestamptz NULL;

COMMENT ON COLUMN roadmap.agent_registry.key_rotated_at IS
    'Timestamp of the last Ed25519 key rotation. NULL if key has never been rotated. '
    'Updated by agent-identity.ts rotateKey().';

COMMIT;

-- ─── Verification ───────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'roadmap' AND table_name = 'agent_registry'
--     AND column_name IN ('public_key', 'key_rotated_at')
--   ORDER BY ordinal_position;
