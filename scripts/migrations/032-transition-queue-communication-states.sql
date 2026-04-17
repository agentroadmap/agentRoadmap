-- Transition queue is worker lifecycle, not the conversation itself.
-- Agents can communicate through MCP messages/discussions while a queue row is
-- pending/processing/waiting_input/held. Do not overload failed for gate holds.

ALTER TABLE roadmap.transition_queue
  DROP CONSTRAINT IF EXISTS transition_queue_status_check;

ALTER TABLE roadmap.transition_queue
  ADD CONSTRAINT transition_queue_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'waiting_input'::text,
    'held'::text,
    'done'::text,
    'failed'::text,
    'cancelled'::text
  ]));

COMMENT ON COLUMN roadmap.transition_queue.status IS
  'Worker lifecycle: pending, processing, waiting_input, held, done, failed, cancelled. Proposal state/maturity remain in roadmap_proposal.proposal.';

DROP INDEX IF EXISTS roadmap.idx_transition_queue_gate_dedup;
CREATE UNIQUE INDEX idx_transition_queue_gate_dedup
  ON roadmap.transition_queue (proposal_id, gate)
  WHERE gate IS NOT NULL
    AND status IN ('pending', 'processing', 'waiting_input');

DROP INDEX IF EXISTS roadmap.idx_transition_queue_pending;
CREATE INDEX idx_transition_queue_pending
  ON roadmap.transition_queue (process_after)
  WHERE status = 'pending';

UPDATE roadmap.transition_queue
SET status = 'held',
    completed_at = COALESCE(completed_at, now()),
    metadata = COALESCE(metadata, '{}'::jsonb) ||
      jsonb_build_object('gate_decision', COALESCE(metadata->>'gate_decision', 'hold'))
WHERE status = 'failed'
  AND metadata->>'gate_decision' = 'hold';
