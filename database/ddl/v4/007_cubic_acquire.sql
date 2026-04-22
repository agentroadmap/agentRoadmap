-- P2XX: Cubic acquire — atomic find-or-create + recycle + focus
--
-- Problem: orchestrator dispatchAgent() makes 4 MCP round-trips per agent
-- (SSE connect → cubic_list → cubic_recycle → cubic_focus → close).
-- For a 4-agent squad, that's 16 round-trips + connection overhead.
--
-- Solution: single SQL function that does everything atomically:
--   1. Find existing cubic for agent (idle or any status)
--   2. If locked to a different proposal, release it
--   3. Focus it on the target proposal (lock, active, phase, metadata)
--   4. If no cubic exists, create one and focus it
--   5. Return the cubic_id + status
--
-- The orchestrator calls this directly via SQL (zero MCP overhead)
-- or through the cubic_acquire MCP wrapper.

BEGIN;

CREATE OR REPLACE FUNCTION roadmap.fn_acquire_cubic(
    p_agent_identity TEXT,
    p_proposal_id    INT8,
    p_phase          TEXT DEFAULT 'design',
    p_budget_usd     NUMERIC DEFAULT NULL,
    p_worktree_path  TEXT DEFAULT NULL
) RETURNS TABLE (
    cubic_id        TEXT,
    was_recycled    BOOLEAN,
    was_created     BOOLEAN,
    status          TEXT,
    worktree_path   TEXT
) LANGUAGE plpgsql AS $$
DECLARE
    v_cubic_id      TEXT;
    v_existing_status TEXT;
    v_lock_holder   TEXT;
    v_new_id        TEXT;
    v_was_recycled  BOOLEAN := FALSE;
    v_was_created   BOOLEAN := FALSE;
BEGIN
    -- Step 1: Find existing cubic for this agent (prefer idle, then any non-expired)
    SELECT c.cubic_id, c.status, c.lock_holder
    INTO v_cubic_id, v_existing_status, v_lock_holder
    FROM roadmap.cubics c
    WHERE c.agent_identity = p_agent_identity
      AND c.status NOT IN ('expired', 'complete')
    ORDER BY
        CASE c.status WHEN 'idle' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
        c.created_at DESC
    LIMIT 1;

    IF FOUND THEN
        -- Step 2: If locked to a different proposal, release it
        IF v_lock_holder IS NOT NULL
           AND v_lock_holder != 'P' || p_proposal_id::TEXT THEN
            v_was_recycled := TRUE;
        END IF;

        -- Step 3: Focus the cubic on this proposal
        UPDATE roadmap.cubics c
        SET status         = 'active',
            phase          = p_phase,
            lock_holder    = 'P' || p_proposal_id::TEXT,
            lock_phase     = p_phase,
            locked_at      = NOW(),
            activated_at   = COALESCE(c.activated_at, NOW()),
            completed_at   = NULL,
            budget_usd     = COALESCE(p_budget_usd, c.budget_usd),
            worktree_path  = COALESCE(p_worktree_path, c.worktree_path),
            metadata       = COALESCE(c.metadata, '{}'::jsonb)
                             || jsonb_build_object(
                                    'current_proposal', p_proposal_id,
                                    'phase', p_phase,
                                    'acquired_at', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                )
        WHERE c.cubic_id = v_cubic_id;

        RETURN QUERY SELECT
            v_cubic_id,
            v_was_recycled,
            FALSE,
            'active'::TEXT,
            COALESCE(p_worktree_path,
                (SELECT c2.worktree_path FROM roadmap.cubics c2 WHERE c2.cubic_id = v_cubic_id));
    ELSE
        -- Step 4: No cubic exists — create and focus in one shot
        INSERT INTO roadmap.cubics (
            status, phase, agent_identity, worktree_path, budget_usd,
            lock_holder, lock_phase, locked_at, activated_at, metadata
        ) VALUES (
            'active',
            p_phase,
            p_agent_identity,
            COALESCE(p_worktree_path, '/data/code/worktree-' || p_agent_identity),
            p_budget_usd,
            'P' || p_proposal_id::TEXT,
            p_phase,
            NOW(),
            NOW(),
            jsonb_build_object(
                'current_proposal', p_proposal_id,
                'phase', p_phase,
                'created_by', 'fn_acquire_cubic',
                'acquired_at', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        )
        RETURNING cubics.cubic_id INTO v_new_id;

        RETURN QUERY SELECT
            v_new_id,
            FALSE,
            TRUE,
            'active'::TEXT,
            p_worktree_path;
    END IF;
END;
$$;

COMMENT ON FUNCTION roadmap.fn_acquire_cubic IS
    'Atomic cubic acquisition: find existing for agent, recycle if locked elsewhere, '
    'focus on target proposal. Creates new cubic if none exists. '
    'Returns (cubic_id, was_recycled, was_created, status, worktree_path).';

-- Also add an index for the agent lookup (if not exists)
CREATE INDEX IF NOT EXISTS idx_cubics_agent_active
    ON roadmap.cubics (agent_identity, status)
    WHERE status NOT IN ('expired', 'complete');

COMMIT;
