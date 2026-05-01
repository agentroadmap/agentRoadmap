-- ============================================================================
-- 081-p706c0-hotpath-functions.sql
--
-- P781 (P706-C0): Hot-path stored functions become workflow-table-driven.
-- Replaces hardcoded legacy stage literals (TRIAGE, FIX, FIXING, DEPLOYED,
-- DONE, ESCALATE, WONT_FIX, NON_ISSUE, REJECTED, DISCARDED, REPLACED) with
-- queries against `roadmap.workflow_transitions` and `roadmap.workflow_stages`.
--
-- Why this migration ships BEFORE P774 (the full vocab migration):
-- After Phase 1 (the operator-applied DB rewrite that landed Hotfix's new
-- DRAFT/DEVELOP/COMPLETE stages and dropped the legacy ones), these
-- functions still contain hardcoded references like:
--   CASE UPPER(NEW.status) WHEN 'TRIAGE' THEN ... WHEN 'FIX' THEN ...
-- A Hotfix proposal advancing through DRAFT/mature triggers fn_notify_gate_ready
-- which falls through the CASE (no match) and emits no NOTIFY -> orchestrator
-- never wakes up for that proposal. Same risk for the maturity-sync chain.
--
-- The four functions rewritten here are made workflow-aware so they tolerate
-- both legacy and new vocabularies. P774 can later drop the legacy stages
-- without breaking the notify/maturity/lease chain.
--
-- Safe to run while orchestrator is paused. CREATE OR REPLACE FUNCTION is
-- MVCC-safe under live load too, but we prefer a quiet window for first run.
-- ============================================================================

BEGIN;

-- 1. fn_notify_gate_ready: derive (gate, to_state) from workflow_transitions.
--    The gate label uses 'D' || from_stage.stage_order so the hotfix flow
--    (DRAFT->DEVELOP->COMPLETE) emits D1 then D2 (gate slots align with
--    stage_order, matching how Standard RFC has emitted D1..D4 historically).
CREATE OR REPLACE FUNCTION roadmap.fn_notify_gate_ready()
  RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_template_id     bigint;
    v_workflow_name   text;
    v_to_state        text;
    v_gate            text;
    v_recent_decision boolean;
BEGIN
    -- Only fire when maturity transitions TO 'mature'.
    IF NEW.maturity <> 'mature' OR OLD.maturity IS NOT DISTINCT FROM 'mature' THEN
        RETURN NEW;
    END IF;

    -- P741 suppression: skip if a gate_decision_log row exists in last 10 min
    -- for this (proposal_id, from_state). Stops redundant re-fires.
    SELECT EXISTS (
        SELECT 1 FROM roadmap_proposal.gate_decision_log
         WHERE proposal_id = NEW.id
           AND from_state ILIKE NEW.status
           AND created_at > NOW() - INTERVAL '10 minutes'
    ) INTO v_recent_decision;
    IF v_recent_decision THEN RETURN NEW; END IF;

    -- Resolve workflow template via proposal_type_config.
    SELECT wt.id, wt.name
      INTO v_template_id, v_workflow_name
      FROM roadmap.proposal_type_config ptc
      JOIN roadmap.workflow_templates wt ON wt.name = ptc.workflow_name
     WHERE ptc.type = LOWER(NEW.type);
    IF v_template_id IS NULL THEN
        RETURN NEW;  -- unknown type: silent no-op (matches pre-rewrite behavior).
    END IF;

    -- Pick the next forward transition for NEW.status. "Forward" means the
    -- target stage_order is strictly greater than the source stage_order.
    -- Iteration / closure transitions are excluded by this comparison.
    SELECT tr.to_stage,
           'D' || ws_from.stage_order::text
      INTO v_to_state, v_gate
      FROM roadmap.workflow_transitions tr
      JOIN roadmap.workflow_stages ws_from
        ON ws_from.template_id = tr.template_id
       AND UPPER(ws_from.stage_name) = UPPER(tr.from_stage)
      JOIN roadmap.workflow_stages ws_to
        ON ws_to.template_id = tr.template_id
       AND UPPER(ws_to.stage_name) = UPPER(tr.to_stage)
     WHERE tr.template_id = v_template_id
       AND UPPER(tr.from_stage) = UPPER(NEW.status)
       AND ws_to.stage_order > ws_from.stage_order
     ORDER BY ws_to.stage_order ASC
     LIMIT 1;

    IF v_to_state IS NULL THEN RETURN NEW; END IF;

    PERFORM pg_notify('proposal_gate_ready', jsonb_build_object(
        'proposal_id', NEW.id,
        'display_id',  NEW.display_id,
        'workflow',    v_workflow_name,
        'gate',        v_gate,
        'from_stage',  NEW.status,
        'to_stage',    v_to_state,
        'source',      'implicit_maturity_gating',
        'ts',          to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )::text);

    RETURN NEW;
END;
$$;

-- 2. fn_sync_proposal_maturity: terminal check via workflow_stages.
--    Terminal = max(stage_order) for the proposal's workflow template.
--    Closure preservation: maturity='obsolete' is never overwritten.
CREATE OR REPLACE FUNCTION roadmap.fn_sync_proposal_maturity()
  RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_is_terminal boolean;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

    -- Terminal = last stage_order for the proposal's workflow template.
    SELECT EXISTS (
        SELECT 1
          FROM roadmap.proposal_type_config ptc
          JOIN roadmap.workflow_templates wt ON wt.name = ptc.workflow_name
          JOIN roadmap.workflow_stages ws ON ws.template_id = wt.id
         WHERE ptc.type = LOWER(NEW.type)
           AND UPPER(ws.stage_name) = UPPER(NEW.status)
           AND ws.stage_order = (
               SELECT MAX(stage_order) FROM roadmap.workflow_stages
                WHERE template_id = wt.id
           )
    ) INTO v_is_terminal;

    IF v_is_terminal THEN
        NEW.maturity := 'mature';
        RETURN NEW;
    END IF;

    -- Closure preservation: maturity='obsolete' is the closure semantic
    -- introduced by P706. Code that closes a proposal sets maturity directly;
    -- this function never overwrites obsolete.
    IF NEW.maturity = 'obsolete' THEN RETURN NEW; END IF;

    -- Live-lease guard: an active claim means 'active'.
    IF EXISTS (
        SELECT 1 FROM roadmap_proposal.proposal_lease
         WHERE proposal_id = NEW.id
           AND released_at IS NULL
           AND (expires_at IS NULL OR expires_at > now())
    ) THEN
        NEW.maturity := 'active';
    ELSE
        NEW.maturity := 'new';
    END IF;

    RETURN NEW;
END;
$$;

-- 3. fn_lease_clear_maturity_on_release (active version is in roadmap_proposal,
--    confirmed via pg_trigger; the roadmap.<same_name> is dead code dropped below).
CREATE OR REPLACE FUNCTION roadmap_proposal.fn_lease_clear_maturity_on_release()
  RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_other_alive_count int;
    v_status            text;
    v_type              text;
    v_is_terminal       boolean;
    v_is_obsolete       boolean;
    v_new_maturity      text;
BEGIN
    -- Only fire on the released_at NULL->NOT NULL transition.
    IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
        RETURN NEW;
    END IF;

    -- Skip if another agent still holds the proposal.
    SELECT count(*) INTO v_other_alive_count
      FROM roadmap_proposal.proposal_lease
     WHERE proposal_id = NEW.proposal_id
       AND id <> NEW.id
       AND released_at IS NULL
       AND (expires_at IS NULL OR expires_at > now());
    IF v_other_alive_count > 0 THEN RETURN NEW; END IF;

    SELECT status, type, (maturity = 'obsolete')
      INTO v_status, v_type, v_is_obsolete
      FROM roadmap_proposal.proposal
     WHERE id = NEW.proposal_id;

    -- Terminal check via workflow_stages (max stage_order per template).
    SELECT EXISTS (
        SELECT 1
          FROM roadmap.proposal_type_config ptc
          JOIN roadmap.workflow_templates wt ON wt.name = ptc.workflow_name
          JOIN roadmap.workflow_stages ws ON ws.template_id = wt.id
         WHERE ptc.type = LOWER(v_type)
           AND UPPER(ws.stage_name) = UPPER(v_status)
           AND ws.stage_order = (
               SELECT MAX(stage_order) FROM roadmap.workflow_stages
                WHERE template_id = wt.id
           )
    ) INTO v_is_terminal;

    IF v_is_terminal THEN
        v_new_maturity := 'mature';
    ELSIF v_is_obsolete THEN
        v_new_maturity := 'obsolete';
    -- P741 (HF-J): gate_transitioned means the proposal already moved past
    -- this gate via the trg_release_leases_on_transition trigger. Do NOT
    -- bump maturity to 'mature' -- that would re-fire fn_notify_gate_ready
    -- for the OLD stage we just left.
    ELSIF NEW.release_reason = 'gate_transitioned' THEN
        v_new_maturity := 'new';
    ELSIF NEW.release_reason IN ('work_delivered','gate_review_complete') THEN
        v_new_maturity := 'mature';
    ELSE
        -- gate_hold, gate_reject, lease_expired, manual_release, etc. -> queue.
        v_new_maturity := 'new';
    END IF;

    UPDATE roadmap_proposal.proposal
       SET maturity = v_new_maturity
     WHERE id = NEW.proposal_id
       AND maturity <> 'obsolete';  -- never overwrite closure (P706 contract).

    RETURN NEW;
END;
$$;

-- 4. Drop the dead duplicate roadmap.fn_lease_clear_maturity_on_release.
--    Verified via pg_trigger that no trigger references this schema-qualified
--    version; the active trigger trg_lease_clear_maturity_on_release on
--    proposal_lease calls roadmap_proposal.fn_lease_clear_maturity_on_release.
DROP FUNCTION IF EXISTS roadmap.fn_lease_clear_maturity_on_release();

-- 5. fn_guard_terminal_maturity: derive terminal from workflow_stages.
CREATE OR REPLACE FUNCTION roadmap.fn_guard_terminal_maturity()
  RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_is_terminal boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
          FROM roadmap.proposal_type_config ptc
          JOIN roadmap.workflow_templates wt ON wt.name = ptc.workflow_name
          JOIN roadmap.workflow_stages ws ON ws.template_id = wt.id
         WHERE ptc.type = LOWER(NEW.type)
           AND UPPER(ws.stage_name) = UPPER(NEW.status)
           AND ws.stage_order = (
               SELECT MAX(stage_order) FROM roadmap.workflow_stages
                WHERE template_id = wt.id
           )
    ) INTO v_is_terminal;

    IF v_is_terminal AND NEW.maturity = 'mature' THEN
        NEW.maturity := 'new';
    END IF;
    RETURN NEW;
END;
$$;

-- 6. AC-P781-09: exhaustive scan -- assert no other roadmap/roadmap_proposal/
--    public function still references legacy literals.
DO $check$
DECLARE
    v_offenders text;
BEGIN
    SELECT string_agg(n.nspname || '.' || p.proname, ', ')
      INTO v_offenders
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('roadmap','roadmap_proposal','public')
       AND p.prosrc ~ 'TRIAGE|FIXING|\bFIX\b|DEPLOYED|\bDONE\b|ESCALATE|WONT_FIX|NON_ISSUE|REJECTED|DISCARDED|REPLACED'
       AND p.proname NOT LIKE '%backup%'
       AND p.prokind = 'f';
    IF v_offenders IS NOT NULL THEN
        RAISE EXCEPTION 'P781 invariant violated: legacy stage literals still present in functions: %', v_offenders;
    END IF;
END;
$check$;

COMMIT;

-- ============================================================================
-- Post-commit verification (run manually):
--
-- AC-P781-02: zero legacy literals across all 4 named functions
-- SELECT n.nspname||'.'||p.proname AS func
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE p.proname IN ('fn_notify_gate_ready','fn_sync_proposal_maturity',
--                      'fn_lease_clear_maturity_on_release','fn_guard_terminal_maturity')
--    AND p.prosrc ~ 'TRIAGE|FIXING|\bFIX\b|DEPLOYED|\bDONE\b|ESCALATE|WONT_FIX|NON_ISSUE|REJECTED|DISCARDED|REPLACED';
-- expect: 0 rows
--
-- AC-P781-04: Hotfix DRAFT/mature -> NOTIFY payload to_state='DEVELOP'
-- (functional test in tests/integration/p781-hotpath-functions.test.ts)
-- ============================================================================
