-- Migration 042: Discord feed — proposal state & maturity change notifications
-- Adds pg_notify channels so the discord-bridge can push live state/maturity changes to Discord.

-- ─── 1. Add pg_notify to state change trigger ────────────────────────────────
-- Fires pg_notify('proposal_state_changed', ...) on every status change.

CREATE OR REPLACE FUNCTION roadmap.fn_log_proposal_state_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_agent text;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_agent := COALESCE(current_setting('app.agent_identity', true), 'system');

        -- 1. Append to audit jsonb
        NEW.audit := NEW.audit || jsonb_build_object(
            'TS',       to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'Agent',    v_agent,
            'Activity', 'StatusChange',
            'From',     OLD.status,
            'To',       NEW.status
        );

        -- 2. State transitions ledger
        INSERT INTO roadmap_proposal.proposal_state_transitions
            (proposal_id, from_state, to_state, transition_reason, transitioned_by)
        VALUES (NEW.id, OLD.status, NEW.status, 'system', v_agent);

        -- 3. Outbox event
        INSERT INTO roadmap_proposal.proposal_event (proposal_id, event_type, payload)
        VALUES (
            NEW.id,
            'status_changed',
            jsonb_build_object(
                'from',  OLD.status,
                'to',    NEW.status,
                'agent', v_agent,
                'ts',    to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        );

        -- 4. Real-time notification for Discord feed
        PERFORM pg_notify('proposal_state_changed', jsonb_build_object(
            'proposal_id',      NEW.id,
            'display_id',       NEW.display_id,
            'from_state',       OLD.status,
            'to_state',         NEW.status,
            'transitioned_by',  v_agent,
            'reason',           'system',
            'ts',               to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )::text);
    END IF;
    RETURN NEW;
END;
$$;

-- ─── 2. Add pg_notify for maturity changes ───────────────────────────────────
-- Fires pg_notify('proposal_maturity_changed', ...) on any maturity change,
-- not just gate-ready. The existing trg_gate_ready still handles the
-- proposal_gate_ready channel for mature transitions specifically.

CREATE OR REPLACE FUNCTION roadmap.fn_notify_maturity_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_agent text;
BEGIN
    IF NEW.maturity IS DISTINCT FROM OLD.maturity THEN
        v_agent := COALESCE(current_setting('app.agent_identity', true), 'system');

        -- Maturity transition ledger
        INSERT INTO roadmap_proposal.proposal_maturity_transitions
            (proposal_id, from_maturity, to_maturity, transition_reason, transitioned_by)
        VALUES (NEW.id, OLD.maturity, NEW.maturity, 'system', v_agent);

        -- Real-time notification for Discord feed
        PERFORM pg_notify('proposal_maturity_changed', jsonb_build_object(
            'proposal_id',      NEW.id,
            'display_id',       NEW.display_id,
            'from_maturity',    OLD.maturity,
            'to_maturity',      NEW.maturity,
            'transitioned_by',  v_agent,
            'ts',               to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )::text);
    END IF;
    RETURN NEW;
END;
$$;

-- Create trigger — fires AFTER UPDATE so that fn_sync_proposal_maturity
-- (BEFORE trigger) has already set the new maturity value.
DROP TRIGGER IF EXISTS trg_notify_maturity_change ON roadmap_proposal.proposal;
CREATE TRIGGER trg_notify_maturity_change
    AFTER UPDATE OF status, maturity ON roadmap_proposal.proposal
    FOR EACH ROW EXECUTE FUNCTION roadmap.fn_notify_maturity_change();
