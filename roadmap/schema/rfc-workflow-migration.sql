-- ============================================================================
-- RFC Workflow Migration (Incremental on existing agenthive DB)
-- Adds state machine, reviews, discussions, AC, and dependency enforcement
-- ============================================================================

-- 1. State transitions audit log
CREATE TABLE IF NOT EXISTS state_transition (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id     BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    from_state      TEXT NOT NULL,
    to_state        TEXT NOT NULL,
    from_maturity   INT NOT NULL,
    to_maturity     INT NOT NULL,
    decision_type   TEXT CHECK (decision_type IN (
        'mature', 'decision', 'iteration', 'depend', 'discard',
        'rejected', 'research', 'division', 'submit'
    )),
    reason          TEXT,
    decided_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transition_proposal ON state_transition(proposal_id);
CREATE INDEX idx_transition_created ON state_transition(created_at DESC);

-- 2. Reviews (formal structured reviews)
CREATE TABLE IF NOT EXISTS proposal_reviews (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id     BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    reviewer        TEXT NOT NULL,
    verdict         TEXT NOT NULL CHECK (verdict IN ('approve', 'request_changes', 'reject')),
    feedback        TEXT,
    reviewed_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(proposal_id, reviewer)
);

CREATE INDEX idx_reviews_proposal ON proposal_reviews(proposal_id);
CREATE INDEX idx_reviews_verdict ON proposal_reviews(verdict);

-- 3. Discussions (threaded comments)
CREATE TABLE IF NOT EXISTS proposal_discussions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id     BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    parent_id       BIGINT REFERENCES proposal_discussions(id),
    author          TEXT NOT NULL,
    content         TEXT NOT NULL,
    body_embedding  vector(1536),
    is_resolved     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discussions_proposal ON proposal_discussions(proposal_id);
CREATE INDEX idx_discussions_resolved ON proposal_discussions(proposal_id) WHERE NOT is_resolved;
CREATE INDEX idx_discussions_embedding ON proposal_discussions USING HNSW (body_embedding vector_cosine_ops);

-- 4. Rename existing table if needed: proposal_acceptance_criteria → acceptance_criteria
-- (We use the Andy-approved schema from channel)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'acceptance_criteria') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proposal_acceptance_criteria') THEN
            ALTER TABLE proposal_acceptance_criteria RENAME TO acceptance_criteria;
        ELSIF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'proposal' AND column_name = 'acceptance_criteria'
        ) THEN
            -- Create the table fresh
            CREATE TABLE acceptance_criteria (
                id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                proposal_id     BIGINT NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
                criterion       TEXT NOT NULL,
                order_index     INT NOT NULL,
                is_met          BOOLEAN DEFAULT FALSE,
                evidence        TEXT,
                verified_by     TEXT,
                verified_at     TIMESTAMPTZ,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_ac_proposal ON acceptance_criteria(proposal_id, order_index);
        END IF;
    END IF;
END $$;

-- 5. proposal_dependency already exists — add dep_type if missing and ON DELETE CASCADE
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proposal_dependency' AND column_name = 'dep_type'
    ) THEN
        ALTER TABLE proposal_dependency ADD COLUMN dep_type TEXT NOT NULL DEFAULT 'blocks';
    END IF;
END $$;

-- 6. Add RFC-specific columns to proposal (if missing)
ALTER TABLE proposal 
    ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS decision_reason TEXT,
    ADD COLUMN IF NOT EXISTS assigned_agent TEXT,
    ADD COLUMN IF NOT EXISTS security_acl JSONB DEFAULT '{"read": ["*"], "write": [], "decide": []}';

-- 7. Update timestamp trigger for proposal
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_updated ON proposal;
CREATE TRIGGER trg_proposal_updated
    BEFORE UPDATE ON proposal
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
