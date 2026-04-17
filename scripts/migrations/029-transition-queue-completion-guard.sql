-- P239: prevent gate-pipeline false positives.
--
-- transition_queue.status is worker bookkeeping. A row may only become `done`
-- after the proposal state itself has reached the queued target stage.

CREATE OR REPLACE FUNCTION roadmap.fn_guard_transition_queue_done()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_status text;
BEGIN
    IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        SELECT p.status INTO v_current_status
        FROM roadmap_proposal.proposal p
        WHERE p.id = NEW.proposal_id;

        IF v_current_status IS NULL THEN
            RAISE EXCEPTION 'Cannot complete transition_queue %: proposal % not found', NEW.id, NEW.proposal_id;
        END IF;

        IF LOWER(v_current_status) <> LOWER(NEW.to_stage) THEN
            RAISE EXCEPTION 'Cannot complete transition_queue %: proposal % is in state %, expected %',
                NEW.id, NEW.proposal_id, v_current_status, NEW.to_stage
                USING HINT = 'Queue completion is worker bookkeeping only; apply the proposal state transition first.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_transition_queue_done ON roadmap.transition_queue;
CREATE TRIGGER trg_guard_transition_queue_done
BEFORE UPDATE OF status ON roadmap.transition_queue
FOR EACH ROW
EXECUTE FUNCTION roadmap.fn_guard_transition_queue_done();

UPDATE roadmap.transition_queue tq
SET status = 'failed',
    completed_at = COALESCE(tq.completed_at, now()),
    last_error = 'false completion cleanup: queue was marked done but proposal state still equals from_stage',
    metadata = COALESCE(tq.metadata, '{}'::jsonb) || jsonb_build_object(
        'false_completion_cleanup_at', now()::text,
        'previous_status', 'done'
    )
FROM roadmap_proposal.proposal p
WHERE p.id = tq.proposal_id
  AND tq.status = 'done'
  AND LOWER(COALESCE(p.status, '')) = LOWER(COALESCE(tq.from_stage, ''))
  AND LOWER(COALESCE(p.status, '')) <> LOWER(COALESCE(tq.to_stage, ''));
