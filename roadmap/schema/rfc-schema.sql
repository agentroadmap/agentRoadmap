-- ============================================================
-- AgentHive RFC Workflow Schema
-- Designed: 2026-04-04
-- Context: Extends existing AgentHive Postgres schema with
--          full RFC state machine, audit trail, AC tracking,
--          and structured review/discussion.
-- ============================================================
-- State Machine:
--   Proposal → Draft → Review → Develop → Merge → Complete
--   Transitions: mature 🌳, decision ⚖️, iteration 🔄,
--                depend 🔗, discard 🗑️, rejected ❌
--   Maturity: 0:New, 1:Active, 2:Mature, 3:Obsolete
-- ============================================================

-- Extension (should already exist, but safe to check)
-- CREATE EXTENSION IF NOT EXISTS vector;

SET search_path TO public;

-- ============================================================
-- 1. STATE TRANSITION AUDIT TRAIL
-- Every state change is recorded with who, why, and when.
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_state_transitions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    from_state TEXT NOT NULL CHECK (from_state IN (
        'PROPOSAL', 'DRAFT', 'REVIEW', 'DEVELOP', 'MERGE', 'COMPLETE',
        'DISCARDED', 'REJECTED', 'DEFERRED'
    )),
    to_state TEXT NOT NULL CHECK (to_state IN (
        'PROPOSAL', 'DRAFT', 'REVIEW', 'DEVELOP', 'MERGE', 'COMPLETE',
        'DISCARDED', 'REJECTED', 'DEFERRED'
    )),
    transition_reason TEXT NOT NULL CHECK (transition_reason IN (
        'mature',      -- 🌳 Ready for state transition
        'decision',    -- ⚖️ Human/lead makes a decision
        'iteration',   -- 🔄 Revision requested, needs more work
        'depend',      -- 🔗 Waiting on another proposal
        'discard',     -- 🗑️ No longer relevant
        'rejected',    -- ❌ Explicitly rejected
        'research',    -- 🔬 Needs more research
        'division',    -- ➗ Split into child proposals
        'submit'       -- 📤 Initial submission
    )),
    emoji CHAR(4),
    depends_on_display_id TEXT,  -- display_id of blocking proposal (for 'depend')
    transitioned_by TEXT,        -- agent identity who made the transition
    notes TEXT,                  -- free-form explanation
    transitioned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_state_transitions_proposal ON proposal_state_transitions(proposal_id);
CREATE INDEX idx_state_transitions_from_state ON proposal_state_transitions(from_state);
CREATE INDEX idx_state_transitions_to_state ON proposal_state_transitions(to_state);
CREATE INDEX idx_state_transitions_reason ON proposal_state_transitions(transition_reason);
CREATE INDEX idx_state_transitions_time ON proposal_state_transitions(transitioned_at DESC);

-- ============================================================
-- 2. DISCUSSION THREADS (linked to proposals)
-- Structured discussions with context prefixes and vector search.
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_discussions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES proposal_discussions(id) ON DELETE SET NULL,  -- threaded replies
    author_identity TEXT NOT NULL,
    context_prefix TEXT CHECK (context_prefix IN (
        'arch:', 'team:', 'critical:', 'security:', 'general:',
        'feedback:', 'concern:', 'poc:'
    )),
    body TEXT NOT NULL,
    body_embedding vector(1536),  -- For semantic search (Nomic/OpenAI embeddings)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for cosine similarity semantic search
CREATE INDEX idx_discussion_embedding ON proposal_discussions
    USING hnsw (body_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Standard indexes
CREATE INDEX idx_discussion_proposal ON proposal_discussions(proposal_id);
CREATE INDEX idx_discussion_parent ON proposal_discussions(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_discussion_author ON proposal_discussions(author_identity);
CREATE INDEX idx_discussion_context ON proposal_discussions(context_prefix) WHERE context_prefix IS NOT NULL;
CREATE INDEX idx_discussion_created ON proposal_discussions(created_at DESC);

-- ============================================================
-- 3. ACCEPTANCE CRITERIA (structured AC items)
-- Each proposal can have multiple AC items, tracked individually.
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_acceptance_criteria (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    item_number INT NOT NULL CHECK (item_number > 0),
    criterion_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'pass', 'fail', 'blocked', 'waived'
    )),
    verified_by TEXT,           -- who verified (auditor identity)
    verification_notes TEXT,     -- why it passed/failed
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(proposal_id, item_number)
);

CREATE INDEX idx_ac_proposal ON proposal_acceptance_criteria(proposal_id);
CREATE INDEX idx_ac_status ON proposal_acceptance_criteria(status);
CREATE UNIQUE INDEX idx_ac_unique_per_proposal ON proposal_acceptance_criteria(proposal_id, item_number);

-- ============================================================
-- 4. PROPOSAL DEPENDENCIES (Directed Acyclic Graph)
-- Links between proposals: blocks, depended_by, supersedes.
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_dependencies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    depends_on_display_id TEXT NOT NULL,  -- display_id of depended-on proposal (e.g., 'RFC-101')
    dependency_type TEXT NOT NULL CHECK (dependency_type IN (
        'blocks',
        'depended_by',
        'relates',
        'supersedes',
        'child_of'
    )),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(proposal_id, depends_on_display_id, dependency_type)
);

CREATE INDEX idx_deps_proposal ON proposal_dependencies(proposal_id);
CREATE INDEX idx_deps_target ON proposal_dependencies(depends_on_display_id);
CREATE INDEX idx_deps_type ON proposal_dependencies(dependency_type);

-- ============================================================
-- 5. REVIEW RECORDS (structured review outcomes)
-- Formal reviews with verdict, findings, and notes.
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    reviewer_identity TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN (
        'approve',
        'request_changes',
        'reject'
    )),
    findings JSONB,     -- structured: { security: 'pass', perf: 'warn', architecture: 'pass', code_quality: 'info', ... }
    notes TEXT,
    reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_proposal ON proposal_reviews(proposal_id);
CREATE INDEX idx_reviews_verdict ON proposal_reviews(verdict);
CREATE INDEX idx_reviews_reviewer ON proposal_reviews(reviewer_identity);
CREATE INDEX idx_reviews_findings ON proposal_reviews USING GIN (findings);

-- ============================================================
-- 6. VALID TRANSITIONS TABLE (state machine rules)
-- Defines which transitions are allowed and who can make them.
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_valid_transitions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    allowed_reasons TEXT[],  -- array of valid transition_reason values
    allowed_roles TEXT[],    -- who can make this transition (e.g., {builder, auditor, lead})
    requires_ac TEXT CHECK (requires_ac IN ('none', 'all', 'critical')),  -- AC gate requirement
    CONSTRAINT valid_transitions_states CHECK (
        from_state IN ('PROPOSAL', 'DRAFT', 'REVIEW', 'DEVELOP', 'MERGE', 'COMPLETE', 'DISCARDED', 'REJECTED', 'DEFERRED')
        AND to_state IN ('PROPOSAL', 'DRAFT', 'REVIEW', 'DEVELOP', 'MERGE', 'COMPLETE', 'DISCARDED', 'REJECTED', 'DEFERRED')
    ),
    UNIQUE(from_state, to_state)
);

-- Default valid transitions (based on Roadmap_process.md state machine)
INSERT INTO proposal_valid_transitions (from_state, to_state, allowed_reasons, allowed_roles, requires_ac) VALUES
    ('PROPOSAL', 'DRAFT',      '{submit, research}',      '{builder, lead}',        'none'),
    ('PROPOSAL', 'DISCARDED',  '{discard}',                '{builder, lead}',        'none'),
    ('DRAFT', 'REVIEW',        '{mature}',                '{builder, auditor}',     'none'),
    ('DRAFT', 'DRAFT',         '{iteration, depend}',      '{builder}',              'none'),
    ('DRAFT', 'DISCARDED',     '{discard}',                '{builder, lead}',        'none'),
    ('REVIEW', 'DEVELOP',      '{decision}',              '{lead, auditor}',        'none'),
    ('REVIEW', 'DRAFT',        '{iteration}',              '{auditor, reviewer}',    'none'),
    ('REVIEW', 'REJECTED',    '{decision, discard}',      '{lead}',                 'none'),
    ('REVIEW', 'DEFERRED',     '{depend, discard}',        '{lead}',                 'none'),
    ('DEVELOP', 'MERGE',        '{mature}',                '{builder}',              'none'),
    ('DEVELOP', 'DRAFT',        '{iteration}',              '{builder, auditor}',     'none'),
    ('DEVELOP', 'REJECTED',    '{decision}',              '{lead}',                 'none'),
    ('MERGE', 'COMPLETE',      '{decision}',              '{lead, reviewer}',       'all'),
    ('MERGE', 'DEVELOP',        '{iteration}',              '{reviewer}, {auditor}',  'none');

CREATE INDEX idx_valid_transitions_from ON proposal_valid_transitions(from_state);
CREATE INDEX idx_valid_transitions_to ON proposal_valid_transitions(to_state);

-- ============================================================
-- 7. STATE CHANGE TRIGGER FUNCTION
-- Automatically logs transitions to the audit table.
-- ============================================================
CREATE OR REPLACE FUNCTION log_proposal_state_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO proposal_state_transitions (
            proposal_id, from_state, to_state, transition_reason, transitioned_by, notes
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            'manual',  -- reason can be overridden by application logic
            NULL,      -- transitioned_by can be set by application
            'Status changed from ' || OLD.status || ' to ' || NEW.status
        );
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on existing proposal table
DROP TRIGGER IF EXISTS trg_proposal_state_change ON proposal;
CREATE TRIGGER trg_proposal_state_change
    BEFORE UPDATE OF status ON proposal
    FOR EACH ROW
    EXECUTE FUNCTION log_proposal_state_change();

-- ============================================================
-- 8. VIEW: Active Proposals with State Summary
-- ============================================================
CREATE OR REPLACE VIEW v_proposal_state_summary AS
SELECT
    p.id,
    p.display_id,
    p.title,
    p.status,
    p.maturity_level,
    p.proposal_type,
    p.category,
    p.tags,
    p.updated_at,
    pst.transition_reason AS last_transition_reason,
    pst.transitioned_by AS last_transitioned_by,
    pst.transitioned_at AS last_transitioned_at,
    pst.notes AS last_transition_notes,
    COALESCE(ac.total, 0) AS total_ac,
    COALESCE(ac.passed, 0) AS passed_ac,
    COALESCE(ac.failed, 0) AS failed_ac,
    COALESCE(deps.count, 0) AS dependency_count,
    COALESCE(reviews.count, 0) AS review_count,
    COALESCE(reviews.approved, 0) AS approved_reviews,
    COALESCE(discussions.count, 0) AS discussion_count
FROM proposal p
LEFT JOIN LATERAL (
    SELECT * FROM proposal_state_transitions
    WHERE proposal_id = p.id
    ORDER BY id DESC LIMIT 1
) pst ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pass') AS passed,
        COUNT(*) FILTER (WHERE status = 'fail') AS failed
    FROM proposal_acceptance_criteria
    WHERE proposal_id = p.id
) ac ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS count FROM proposal_dependencies
    WHERE proposal_id = p.id
) deps ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE verdict = 'approve') AS approved
    FROM proposal_reviews
    WHERE proposal_id = p.id
) reviews ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS count FROM proposal_discussions
    WHERE proposal_id = p.id
) discussions ON true;

-- ============================================================
-- 9. VIEW: Blocked Proposals (blocked by dependencies)
-- ============================================================
CREATE OR REPLACE VIEW v_blocked_proposals AS
SELECT
    p.display_id AS proposal,
    p.title,
    p.status,
    dep.depends_on_display_id AS blocked_by,
    bp.title AS blocker_title,
    bp.status AS blocker_status
FROM proposal_dependencies dep
JOIN proposal p ON p.id = dep.proposal_id
LEFT JOIN proposal bp ON bp.display_id = dep.depends_on_display_id
WHERE dep.dependency_type = 'blocks'
  AND bp.status NOT IN ('COMPLETE');

-- ============================================================
-- 10. VIEW: Maturity-Ready Queue (mature proposals ready for transition)
-- ============================================================
CREATE OR REPLACE VIEW v_mature_queue AS
SELECT
    p.display_id,
    p.title,
    p.status AS current_state,
    p.maturity_level,
    p.priority_score,
    pst.to_state AS recommended_next_state,
    pst.transition_reason,
    COALESCE(ac.total, 0) AS total_ac,
    COALESCE(ac.passed, 0) AS passed_ac,
    CASE
        WHEN ac.total > 0 AND ac.passed = ac.total THEN 'ready'
        WHEN ac.total > 0 THEN 'ac_incomplete'
        ELSE 'no_ac_defined'
    END AS readiness
FROM proposal p
JOIN LATERAL (
    SELECT to_state, transition_reason
    FROM proposal_valid_transitions
    WHERE from_state = p.status
    LIMIT 1  -- first valid transition
) pst ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pass') AS passed
    FROM proposal_acceptance_criteria
    WHERE proposal_id = p.id
) ac ON true
WHERE p.maturity_level = 2  -- Mature
  AND p.status NOT IN ('COMPLETE', 'DISCARDED', 'REJECTED')
ORDER BY p.priority_score DESC NULLS LAST, p.updated_at ASC;

-- ============================================================
-- SEED: Initial reason codes with emojis for reference
-- ============================================================
COMMENT ON TABLE proposal_state_transitions IS 'Complete audit trail of all proposal state transitions with reason codes.';
COMMENT ON COLUMN proposal_state_transitions.transition_reason IS 'mature(🌳), decision(⚖️), iteration(🔄), depend(🔗), discard(🗑️), rejected(❌), research(🔬), division(➗), submit(📤)';
COMMENT ON TABLE proposal_discussions IS 'Threaded discussions linked to proposals with semantic vector search.';
COMMENT ON TABLE proposal_acceptance_criteria IS 'Structured acceptance criteria items with pass/fail tracking.';
COMMENT ON TABLE proposal_dependencies IS 'Directed acyclic graph of proposal dependencies.';
COMMENT ON TABLE proposal_reviews IS 'Formal review outcomes (approve/request_changes/reject).';
COMMENT ON TABLE proposal_valid_transitions IS 'State machine rules: which transitions are valid, allowed reasons, and AC gates.';
