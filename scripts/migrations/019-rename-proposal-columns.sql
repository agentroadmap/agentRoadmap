-- Migration 019: Rename proposal columns (P086)
-- Description: Rename maturity_state → maturity and dependency → dependency_note
-- Requires: 018-agent-registry-crypto-identity.sql
--
-- The current column names don't match the intended model:
--   - maturity_state should be just "maturity" (it represents the maturity level)
--   - dependency should be "dependency_note" (it's prose notes, not structured deps)
--
-- This migration:
--   1. Renames maturity_state → maturity on roadmap.proposal
--   2. Renames dependency → dependency_note on roadmap.proposal
--   3. Updates dependent views: v_mature_queue, v_proposal_full
--   4. Updates dependent triggers: trg_gate_ready, fn_notify_gate_ready
--   5. Updates constraint and index names for consistency

BEGIN;

SET search_path TO roadmap, public;


-- ─── 1. Rename maturity_state → maturity ─────────────────────────────────────

ALTER TABLE roadmap.proposal
    RENAME COLUMN maturity_state TO maturity;

-- Rename the CHECK constraint to match
ALTER TABLE roadmap.proposal
    RENAME CONSTRAINT proposal_maturity_state_check TO proposal_maturity_check;

-- Update the column comment
COMMENT ON COLUMN roadmap.proposal.maturity IS
    'Current maturity within the active state. Universal lifecycle: '
    'new → active → mature → obsolete. Repeats within each state as proposals '
    'iterate. When set to mature, triggers gate pipeline via trg_gate_ready. '
    'History is in proposal_maturity_transitions (timestamped, decision-backed).';


-- ─── 2. Rename dependency → dependency_note ──────────────────────────────────

ALTER TABLE roadmap.proposal
    RENAME COLUMN dependency TO dependency_note;

-- Update the column comment
COMMENT ON COLUMN roadmap.proposal.dependency_note IS
    'Prose description of dependencies; structured dependencies live in proposal_dependencies';


-- ─── 3. Update v_mature_queue view ──────────────────────────────────────────

DROP VIEW IF EXISTS roadmap.v_mature_queue;

CREATE OR REPLACE VIEW roadmap.v_mature_queue AS
SELECT
    p.id,
    p.display_id,
    p.type,
    p.title,
    p.status,
    p.maturity,
    p.priority,
    p.created_at,
    COALESCE(bc.blocker_count, 0) AS blocks_count,
    COALESCE(dc.dep_count, 0) AS depends_on_count
FROM roadmap.proposal p
LEFT JOIN (
    SELECT from_proposal_id AS proposal_id, COUNT(*) AS blocker_count
    FROM roadmap.proposal_dependencies
    WHERE resolved = false AND dependency_type = 'blocks'
    GROUP BY from_proposal_id
) bc ON bc.proposal_id = p.id
LEFT JOIN (
    SELECT to_proposal_id AS proposal_id, COUNT(*) AS dep_count
    FROM roadmap.proposal_dependencies
    WHERE resolved = false AND dependency_type = 'blocks'
    GROUP BY to_proposal_id
) dc ON dc.proposal_id = p.id
WHERE p.maturity = 'mature'
ORDER BY bc.blocker_count DESC NULLS LAST, p.created_at ASC;

COMMENT ON VIEW roadmap.v_mature_queue IS
    'Proposals at mature maturity, ready for gate evaluation. '
    'Ordered by how many others they block (most impactful first).';


-- ─── 4. Update v_proposal_full view ─────────────────────────────────────────

DROP VIEW IF EXISTS roadmap.v_proposal_full;

CREATE OR REPLACE VIEW roadmap.v_proposal_full AS
SELECT
    p.id,
    p.display_id,
    p.parent_id,
    p.type,
    p.status,
    p.maturity,
    p.title,
    p.summary,
    p.motivation,
    p.design,
    p.drawbacks,
    p.alternatives,
    p.dependency_note,
    p.priority,
    p.tags,
    p.audit,
    p.created_at,
    p.modified_at,
    COALESCE(dep.deps, '[]'::jsonb) AS dependencies,
    COALESCE(ac.criteria, '[]'::jsonb) AS acceptance_criteria,
    dec.latest_decision,
    dec.decision_at,
    lease.leased_by,
    lease.lease_expires,
    wf.workflow_name,
    wf.current_stage
FROM roadmap.proposal p
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'to_display_id', pd.display_id,
        'dependency_type', d.dependency_type,
        'resolved', d.resolved
    )) AS deps
    FROM roadmap.proposal_dependencies d
    JOIN roadmap.proposal pd ON pd.id = d.to_proposal_id
    WHERE d.from_proposal_id = p.id
) dep ON true
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'item_number', ac.item_number,
        'criterion_text', ac.criterion_text,
        'status', ac.status,
        'verified_by', ac.verified_by
    ) ORDER BY ac.item_number) AS criteria
    FROM roadmap.proposal_acceptance_criteria ac
    WHERE ac.proposal_id = p.id
) ac ON true
LEFT JOIN LATERAL (
    SELECT pd.decision AS latest_decision, pd.decided_at AS decision_at
    FROM roadmap.proposal_decision pd
    WHERE pd.proposal_id = p.id
    ORDER BY pd.decided_at DESC
    LIMIT 1
) dec ON true
LEFT JOIN LATERAL (
    SELECT pl.agent_identity AS leased_by, pl.expires_at AS lease_expires
    FROM roadmap.proposal_lease pl
    WHERE pl.proposal_id = p.id AND pl.released_at IS NULL
    ORDER BY pl.claimed_at DESC
    LIMIT 1
) lease ON true
LEFT JOIN LATERAL (
    SELECT ptc.workflow_name, w.current_stage
    FROM roadmap.workflows w
    JOIN roadmap.proposal_type_config ptc ON ptc.workflow_name = w.workflow_name
    WHERE w.proposal_id = p.id
    LIMIT 1
) wf ON true;

COMMENT ON VIEW roadmap.v_proposal_full IS
    'Complete proposal with all child tables as JSONB. '
    'Used by MCP tools for full proposal rendering.';


-- ─── 5. Update trigger function fn_notify_gate_ready ────────────────────────
-- The trigger references maturity_state which is now named maturity.

CREATE OR REPLACE FUNCTION roadmap.fn_notify_gate_ready()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_gate          text;
    v_to_state      text;
    v_task_prompt   text;
    v_queue_id      int8;
    v_agent         text;
BEGIN
    v_agent := COALESCE(current_setting('app.agent_identity', true), 'system');

    -- Only fire when maturity actually changes
    IF NEW.maturity IS DISTINCT FROM OLD.maturity THEN

        -- Audit append
        NEW.audit := NEW.audit || jsonb_build_object(
            'TS',       to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'Agent',    v_agent,
            'Activity', 'MaturityChange',
            'From',     OLD.maturity,
            'To',       NEW.maturity
        );

        -- Maturity transition ledger
        INSERT INTO roadmap.proposal_maturity_transitions
            (proposal_id, from_maturity, to_maturity, transition_reason, transitioned_by)
        VALUES (NEW.id, OLD.maturity, NEW.maturity, 'submit', v_agent);

        -- Outbox event
        INSERT INTO roadmap.proposal_event (proposal_id, event_type, payload)
        VALUES (
            NEW.id,
            'maturity_changed',
            jsonb_build_object(
                'from',  OLD.maturity,
                'to',    NEW.maturity,
                'stage', NEW.status,
                'agent', v_agent,
                'ts',    to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        );

        -- Gate pipeline: only when reaching 'mature'
        IF NEW.maturity = 'mature'
           AND OLD.maturity IS DISTINCT FROM 'mature' THEN

            -- Determine which gate based on current status
            CASE NEW.status
                WHEN 'Draft'   THEN v_gate := 'D1'; v_to_state := 'Review';
                WHEN 'Review'  THEN v_gate := 'D2'; v_to_state := 'Develop';
                WHEN 'Develop' THEN v_gate := 'D3'; v_to_state := 'Merge';
                WHEN 'Merge'   THEN v_gate := 'D4'; v_to_state := 'Complete';
                ELSE
                    -- Unknown state for gating — just notify, don't enqueue
                    PERFORM pg_notify('proposal_gate_ready', jsonb_build_object(
                        'proposal_id', NEW.id,
                        'display_id',  NEW.display_id,
                        'stage',       NEW.status,
                        'reason',      'no_gate_defined_for_state',
                        'ts',          to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                    )::text);
                    RETURN NEW;
            END CASE;

            -- Look up the task prompt for this gate
            SELECT gt.task_prompt INTO v_task_prompt
            FROM roadmap.gate_task_templates gt
            WHERE gt.gate_number = REPLACE(v_gate, 'D', '')::int
              AND gt.is_active = true
            LIMIT 1;

            -- Build the spawn metadata
            INSERT INTO roadmap.transition_queue (
                proposal_id, from_stage, to_stage, triggered_by,
                gate, status, metadata
            ) VALUES (
                NEW.id,
                NEW.status,
                v_to_state,
                'gate_pipeline',
                v_gate,
                'pending',
                jsonb_build_object(
                    'task', COALESCE(v_task_prompt, 'Process gate ' || v_gate || ' for proposal ' || NEW.display_id),
                    'gate', v_gate,
                    'proposal_display_id', NEW.display_id,
                    'spawn', jsonb_build_object(
                        'worktree', 'claude/one',
                        'timeoutMs', 300000
                    )
                )
            )
            ON CONFLICT (proposal_id, gate)
            WHERE gate IS NOT NULL AND transition_queue.status IN ('pending', 'processing')
            DO NOTHING
            RETURNING id INTO v_queue_id;

            -- Only notify if we actually inserted (not a duplicate)
            IF v_queue_id IS NOT NULL THEN
                PERFORM pg_notify('transition_queued', jsonb_build_object(
                    'queue_id',     v_queue_id,
                    'proposal_id',  NEW.id,
                    'display_id',   NEW.display_id,
                    'gate',         v_gate,
                    'from_stage',   NEW.status,
                    'to_stage',     v_to_state,
                    'ts',           to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                )::text);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Recreate trigger to use updated function
DROP TRIGGER IF EXISTS trg_gate_ready ON roadmap.proposal;
CREATE TRIGGER trg_gate_ready
    BEFORE UPDATE OF maturity ON roadmap.proposal
    FOR EACH ROW
    EXECUTE FUNCTION roadmap.fn_notify_gate_ready();


-- ─── 6. Update fn_enqueue_mature_proposals ──────────────────────────────────

CREATE OR REPLACE FUNCTION roadmap.fn_enqueue_mature_proposals()
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    v_count int := 0;
    v_gate  text;
    v_to_state text;
    v_task_prompt text;
BEGIN
    FOR rec IN (
        SELECT p.id, p.display_id, p.status
        FROM roadmap.proposal p
        WHERE p.maturity = 'mature'
          AND NOT EXISTS (
              SELECT 1 FROM roadmap.transition_queue tq
              WHERE tq.proposal_id = p.id
                AND tq.gate IS NOT NULL
                AND tq.status IN ('pending', 'processing')
          )
    ) LOOP
        -- Determine gate
        CASE rec.status
            WHEN 'Draft'   THEN v_gate := 'D1'; v_to_state := 'Review';
            WHEN 'Review'  THEN v_gate := 'D2'; v_to_state := 'Develop';
            WHEN 'Develop' THEN v_gate := 'D3'; v_to_state := 'Merge';
            WHEN 'Merge'   THEN v_gate := 'D4'; v_to_state := 'Complete';
            ELSE CONTINUE;
        END CASE;

        -- Look up task prompt
        SELECT gt.task_prompt INTO v_task_prompt
        FROM roadmap.gate_task_templates gt
        WHERE gt.gate_number = REPLACE(v_gate, 'D', '')::int
          AND gt.is_active = true
        LIMIT 1;

        INSERT INTO roadmap.transition_queue (
            proposal_id, from_stage, to_stage, triggered_by,
            gate, status, metadata
        ) VALUES (
            rec.id, rec.status, v_to_state, 'gate_scan',
            v_gate, 'pending',
            jsonb_build_object(
                'task', COALESCE(v_task_prompt, 'Process gate ' || v_gate || ' for proposal ' || rec.display_id),
                'gate', v_gate,
                'proposal_display_id', rec.display_id,
                'spawn', jsonb_build_object(
                    'worktree', 'claude/one',
                    'timeoutMs', 300000
                )
            )
        )
        ON CONFLICT (proposal_id, gate)
        WHERE gate IS NOT NULL AND transition_queue.status IN ('pending', 'processing')
        DO NOTHING;

        v_count := v_count + 1;
    END LOOP;

    -- Notify if we enqueued anything
    IF v_count > 0 THEN
        PERFORM pg_notify('transition_queued', jsonb_build_object(
            'source', 'gate_scan',
            'enqueued', v_count,
            'ts', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )::text);
    END IF;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION roadmap.fn_enqueue_mature_proposals IS
    'Pull-scan: enqueues any mature proposals not already in the transition queue. '
    'Returns count of newly enqueued items. Called every poll cycle.';

COMMIT;

-- ─── Verification ───────────────────────────────────────────────────────────
-- Verify columns were renamed:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'roadmap' AND table_name = 'proposal'
--     AND column_name IN ('maturity', 'maturity_state', 'dependency', 'dependency_note')
--   ORDER BY column_name;
-- Expected: maturity, dependency_note (NOT maturity_state, dependency)
--
-- Verify views work:
-- SELECT display_id, title, status, maturity FROM roadmap.v_mature_queue LIMIT 5;
-- SELECT display_id, title, maturity, dependency_note FROM roadmap.v_proposal_full LIMIT 5;
