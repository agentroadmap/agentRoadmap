-- Agent Communication Protocol: reply threading for message_ledger
--
-- Adds reply_to column so agents can track which orchestrator reply
-- corresponds to their sos/ask/decision message.

BEGIN;

ALTER TABLE roadmap.message_ledger
    ADD COLUMN IF NOT EXISTS reply_to int8 NULL,
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_message_ledger_reply_to
    ON roadmap.message_ledger (reply_to)
    WHERE reply_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_message_ledger_unread
    ON roadmap.message_ledger (to_agent, read_at)
    WHERE read_at IS NULL;

COMMIT;
