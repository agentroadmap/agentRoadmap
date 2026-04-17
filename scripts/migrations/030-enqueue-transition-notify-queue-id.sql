-- P239 follow-up: make gate enqueue visible to the orchestrator.
--
-- The deployed fn_enqueue_mature_proposals() had drifted from migration 020 and
-- no longer emitted transition_queued notifications. That left D1 work visible
-- in transition_queue/cubics but invisible to the orchestrator.

CREATE OR REPLACE FUNCTION roadmap.fn_enqueue_mature_proposals()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    rec         record;
    v_count     integer := 0;
    v_gate      text;
    v_to_state  text;
    v_task_prompt text;
    v_queue_id  bigint;
BEGIN
    FOR rec IN (
        SELECT p.id, p.display_id, p.status
        FROM roadmap_proposal.proposal p
        WHERE p.maturity = 'mature'
          AND LOWER(p.status) IN ('draft', 'review', 'develop', 'merge')
          AND NOT EXISTS (
              SELECT 1
              FROM roadmap.transition_queue tq
              WHERE tq.proposal_id = p.id
                AND tq.gate IS NOT NULL
                AND tq.status IN ('pending', 'waiting_input')
          )
          AND NOT EXISTS (
              SELECT 1
              FROM roadmap.transition_queue tq
              WHERE tq.proposal_id = p.id
                AND tq.gate IS NOT NULL
                AND tq.status = 'processing'
                AND tq.processing_at > now() - interval '30 minutes'
          )
          AND NOT EXISTS (
              SELECT 1
              FROM roadmap.transition_queue tq
              WHERE tq.proposal_id = p.id
                AND tq.gate IS NOT NULL
                AND tq.status = 'done'
                AND tq.completed_at > now() - interval '24 hours'
          )
    ) LOOP
        v_queue_id := NULL;

        CASE LOWER(rec.status)
            WHEN 'draft'   THEN v_gate := 'D1'; v_to_state := 'Review';
            WHEN 'review'  THEN v_gate := 'D2'; v_to_state := 'Develop';
            WHEN 'develop' THEN v_gate := 'D3'; v_to_state := 'Merge';
            WHEN 'merge'   THEN v_gate := 'D4'; v_to_state := 'Complete';
            ELSE CONTINUE;
        END CASE;

        SELECT gt.task_prompt INTO v_task_prompt
        FROM roadmap.gate_task_templates gt
        WHERE gt.gate_number = REPLACE(v_gate, 'D', '')::integer
          AND gt.is_active = true
        LIMIT 1;

        UPDATE roadmap.transition_queue
        SET status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'failed_reason', 'timeout_re_enqueue',
                'failed_at', now()::text
            )
        WHERE proposal_id = rec.id
          AND gate = v_gate
          AND status = 'processing'
          AND processing_at < now() - interval '30 minutes';

        INSERT INTO roadmap.transition_queue (
            proposal_id, from_stage, to_stage, triggered_by,
            gate, status, metadata
        ) VALUES (
            rec.id, rec.status, v_to_state, 'gate_scan',
            v_gate, 'pending',
            jsonb_build_object(
                'task', COALESCE(
                    v_task_prompt,
                    'Process gate ' || v_gate || ' for proposal ' || rec.display_id
                ),
                'gate', v_gate,
                'proposal_display_id', rec.display_id,
                'spawn', jsonb_build_object(
                    'timeoutMs', 600000
                )
            )
        )
        ON CONFLICT (proposal_id, gate)
        WHERE gate IS NOT NULL
          AND transition_queue.status IN ('pending', 'processing')
        DO NOTHING
        RETURNING id INTO v_queue_id;

        IF v_queue_id IS NOT NULL THEN
            v_count := v_count + 1;
            PERFORM pg_notify('transition_queued', jsonb_build_object(
                'source', 'fn_enqueue_mature_proposals',
                'queue_id', v_queue_id,
                'proposal_id', rec.id,
                'proposal_display_id', rec.display_id,
                'gate', v_gate,
                'from_stage', rec.status,
                'to_stage', v_to_state,
                'ts', now()
            )::text);
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION roadmap.fn_enqueue_mature_proposals() IS
    'Pull-scan: enqueues mature proposals and emits transition_queued with queue_id for orchestrator dispatch.';
