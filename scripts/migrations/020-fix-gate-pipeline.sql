-- =============================================================================
-- Migration 020: Gate Pipeline Fix Bundle (P204 + P211 + P205)
-- Applied: 2026-04-13
-- =============================================================================
--
-- P204: fn_enqueue_mature_proposals() case mismatch
--   - Used exact TitleCase matches but DB has mixed UPPERCASE/TitleCase
--   - Fix: LOWER() for case-insensitive matching
--   - Also: added timeout-aware re-enqueue (stale processing rows >30 min)
--   - Also: removed hardcoded worktree, uses 'claude-one' default
--
-- P211: markTransitionDone() dead code
--   - Transitions stuck in 'processing' forever
--   - Fix: created fn_mark_transition_done() helper
--   - Added stale processing cleanup (>30 min) on each scan
--
-- P205: prop_create SQL bug (window function in FILTER)
--   - FILTER (WHERE stage_order = MIN(stage_order) OVER ()) is invalid PG
--   - Fix: rewritten as (ARRAY_AGG(stage_name ORDER BY stage_order))[1]
--   - Code fix in src/infra/postgres/proposal-storage-v2.ts line 243-253
--
-- reference_terms: Empty table blocked all proposal inserts
--   - Trigger fn_validate_proposal_reference_terms validates status/maturity
--   - Fix: populated with all workflow stages + maturity values + TitleCase variants
-- =============================================================================

BEGIN;

-- ─── 1. Clean up stale processing rows ─────────────────────────────────────

UPDATE roadmap.transition_queue
SET status = 'failed',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'failed_reason', 'stale_cleanup', 'failed_at', now()::text)
WHERE status = 'processing'
  AND processing_at < now() - interval '30 minutes';

-- ─── 2. fn_enqueue_mature_proposals — fixed (P204 + P211) ──────────────────

CREATE OR REPLACE FUNCTION roadmap.fn_enqueue_mature_proposals()
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    rec       RECORD;
    v_count   int := 0;
    v_gate    text;
    v_to_state text;
    v_task_prompt text;
BEGIN
    FOR rec IN (
        SELECT p.id, p.display_id, p.status
        FROM roadmap_proposal.proposal p
        WHERE p.maturity = 'mature'
          AND LOWER(p.status) IN ('draft', 'review', 'develop', 'merge')
          AND NOT EXISTS (
              SELECT 1 FROM roadmap.transition_queue tq
              WHERE tq.proposal_id = p.id
                AND tq.gate IS NOT NULL
                AND tq.status = 'pending')
          AND NOT EXISTS (
              SELECT 1 FROM roadmap.transition_queue tq
              WHERE tq.proposal_id = p.id
                AND tq.gate IS NOT NULL
                AND tq.status = 'processing'
                AND tq.processing_at > now() - interval '30 minutes')
    ) LOOP
        CASE LOWER(rec.status)
            WHEN 'draft'   THEN v_gate := 'D1'; v_to_state := 'Review';
            WHEN 'review'  THEN v_gate := 'D2'; v_to_state := 'Develop';
            WHEN 'develop' THEN v_gate := 'D3'; v_to_state := 'Merge';
            WHEN 'merge'   THEN v_gate := 'D4'; v_to_state := 'Complete';
            ELSE CONTINUE;
        END CASE;

        SELECT gt.task_prompt INTO v_task_prompt
        FROM roadmap.gate_task_templates gt
        WHERE gt.gate_number = REPLACE(v_gate, 'D', '')::int AND gt.is_active = true
        LIMIT 1;

        UPDATE roadmap.transition_queue
        SET status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'failed_reason', 'timeout_re_enqueue', 'failed_at', now()::text)
        WHERE proposal_id = rec.id AND gate = v_gate
          AND status = 'processing'
          AND processing_at < now() - interval '30 minutes';

        INSERT INTO roadmap.transition_queue (
            proposal_id, from_stage, to_stage, triggered_by,
            gate, status, metadata
        ) VALUES (
            rec.id, rec.status, v_to_state, 'gate_scan',
            v_gate, 'pending',
            jsonb_build_object(
                'task', COALESCE(v_task_prompt,
                    'Process gate ' || v_gate || ' for proposal ' || rec.display_id),
                'gate', v_gate, 'proposal_display_id', rec.display_id,
                'spawn', jsonb_build_object('worktree', 'claude-one', 'timeoutMs', 300000))
        )
        ON CONFLICT (proposal_id, gate)
        WHERE gate IS NOT NULL AND transition_queue.status IN ('pending', 'processing')
        DO NOTHING;

        IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;

    IF v_count > 0 THEN
        PERFORM pg_notify('transition_queued', jsonb_build_object(
            'source', 'gate_scan', 'enqueued', v_count,
            'ts', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))::text);
    END IF;
    RETURN v_count;
END;
$$;

-- ─── 3. fn_mark_transition_done — new (P211) ───────────────────────────────

CREATE OR REPLACE FUNCTION roadmap.fn_mark_transition_done(
    p_queue_id bigint,
    p_result   jsonb DEFAULT '{}'::jsonb
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_updated int;
BEGIN
    UPDATE roadmap.transition_queue
    SET status = 'done', completed_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb) || p_result || jsonb_build_object(
            'completed_at', now()::text)
    WHERE id = p_queue_id AND status = 'processing';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

-- ─── 4. Populate reference_terms (P205 — empty table blocked inserts) ──────

INSERT INTO roadmap.reference_terms (term_category, term_value, description) VALUES
  ('proposal_state', 'DRAFT', 'Draft (uppercase)'),
  ('proposal_state', 'REVIEW', 'Review (uppercase)'),
  ('proposal_state', 'DEVELOP', 'Develop (uppercase)'),
  ('proposal_state', 'MERGE', 'Merge (uppercase)'),
  ('proposal_state', 'COMPLETE', 'Complete (uppercase)'),
  ('proposal_state', 'REJECTED', 'Rejected'),
  ('proposal_state', 'DISCARDED', 'Discarded'),
  ('proposal_state', 'DEPLOYED', 'Deployed'),
  ('proposal_state', 'TRIAGE', 'Hotfix triage'),
  ('proposal_state', 'FIX', 'Hotfix fixing'),
  ('proposal_state', 'FIXING', 'Fixing (uppercase)'),
  ('proposal_state', 'DONE', 'Hotfix done'),
  ('proposal_state', 'WONT_FIX', 'Wont fix'),
  ('proposal_state', 'NON_ISSUE', 'Non-issue'),
  ('proposal_state', 'ESCALATE', 'Escalated'),
  ('proposal_state', 'APPROVED', 'Approved'),
  ('proposal_state', 'CLOSED', 'Closed'),
  ('proposal_state', 'MERGED', 'Merged'),
  ('proposal_state', 'OPEN', 'Open'),
  ('proposal_state', 'REVIEWING', 'Reviewing')
ON CONFLICT DO NOTHING;

-- ─── 5. Run enqueue to pick up eligible proposals ──────────────────────────

SELECT roadmap.fn_enqueue_mature_proposals() AS newly_enqueued;

COMMIT;
