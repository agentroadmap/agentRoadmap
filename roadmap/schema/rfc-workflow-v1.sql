-- ============================================================
-- AgentHive RFC Workflow Schema
-- Designed: 2026-04-04
-- Context: Extends existing AgentHive Postgres schema with
--          full RFC state machine, audit trail, AC tracking,
--          and structured review/discussion.
-- ============================================================
-- State Machine:
--   Proposal → Draft → Review → Accept → Build → Merge → Complete
--   Transitions: mature 🌳, decision ⚖️, iteration 🔄,
--                depend 🔗, discard 🗑️, rejected ❌
--   Maturity: 0:New, 1:Active, 2:Mature, 3:Obsolete
-- ============================================================

SET search_path TO public;

-- 1. STATE TRANSITION AUDIT TRAIL
-- Every state change is recorded with who, why, and when.
CREATE TABLE IF NOT EXISTS state_transitions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id BIGINT NOT NULL,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    transition_reason TEXT NOT NULL CHECK (transition_reason IN (
        'mature', 'decision', 'iteration', 'depend', 'discard',
        'rejected', 'research', 'division', 'submit'
    )),
    emoji TEXT,
    notes TEXT,
    transitioned_by TEXT,
    transitioned_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_state_proposal FOREIGN KEY (proposal_id)
        REFERENCES proposal(id) ON DELETE CASCADE
);
CREATE INDEX idx_state_proposal ON state_transitions(proposal_id);
CREATE INDEX idx_state_reason ON state_transitions(transition_reason);
CREATE INDEX idx_state_to ON state_transitions(to_state);
CREATE INDEX idx_state_time ON state_transitions(transitioned_at DESC);

-- 2. DISCUSSION THREADS (linked to proposals)
-- Structured discussions with context prefixes and vector search.
CREATE TABLE IF NOT EXISTS proposal_discussions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES proposal_discussions(id),
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    body_embedding vector(1536),
    prefix_emoji TEXT CHECK (prefix_emoji IN ('💬', '🗨️', '📣', '🔬')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_discussion_proposal ON proposal_discussions(proposal_id);
CREATE INDEX idx_discussion_parent ON proposal_discussions(parent_id);
CREATE INDEX idx_discussion_author ON proposal_discussions(author);
CREATE INDEX idx_discussion_time ON proposal_discussions(created_at DESC);
CREATE INDEX idx_discussion_embedding ON proposal_discussions
    USING hnsw (body_embedding vector_cosine_ops);

-- 3. ACCEPTANCE CRITERIA (structured AC items)
-- Each proposal can have multiple AC items, tracked individually.
CREATE TABLE IF NOT EXISTS acceptance_criteria (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    item_number INT NOT NULL,
    criterion_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'pass', 'fail', 'blocked', 'waived')),
    verified_by TEXT,
    verified_at TIMESTAMPTZ,
    notes TEXT,
    UNIQUE(proposal_id, item_number)
);
CREATE INDEX idx_ac_proposal ON acceptance_criteria(proposal_id);
CREATE INDEX idx_ac_status ON acceptance_criteria(status);

-- 4. PROPOSAL DEPENDENCIES (DAG)
-- Links between proposals: blocks, depended_by, supersedes.
CREATE TABLE IF NOT EXISTS proposal_dependencies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    depends_on_id BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    dependency_type TEXT DEFAULT 'blocks'
        CHECK (dependency_type IN ('blocks', 'child_of', 'supersedes', 'relates')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(proposal_id, depends_on_id)
);
CREATE INDEX idx_deps_proposal ON proposal_dependencies(proposal_id);
CREATE INDEX idx_deps_depends ON proposal_dependencies(depends_on_id);

-- 5. VIEW: Proposal review summary dashboard
CREATE OR REPLACE VIEW v_proposal_review_summary AS
SELECT
    p.display_id,
    p.title,
    p.status,
    p.maturity_level,
    p.proposal_type,
    p.assigned_builder,
    p.assigned_auditor,
    pr.reviewer_identity,
    pr.verdict,
    pr.reviewed_at,
    pr.notes AS review_notes,
    ac.total AS total_ac,
    ac.passed AS passed_ac,
    ac.failed AS failed_ac,
    st.last_transition_reason,
    st.last_transitioned_by,
    st.transitioned_at
FROM proposal p
LEFT JOIN proposal_reviews pr ON pr.proposal_id = p.id
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pass') AS passed,
        COUNT(*) FILTER (WHERE status = 'fail') AS failed
    FROM acceptance_criteria
    WHERE proposal_id = p.id
) ac ON true
LEFT JOIN LATERAL (
    SELECT DISTINCT ON (proposal_id)
        proposal_id,
        to_state AS last_transition_reason,
        transitioned_by AS last_transitioned_by,
        transitioned_at
    FROM state_transitions
    WHERE proposal_id = p.id
    ORDER BY proposal_id, id DESC
) st ON st.proposal_id = p.id;
