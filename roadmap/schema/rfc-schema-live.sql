-- ============================================================
-- AgentHive — RFC Workflow Schema (LIVE from Postgres agenthive)
-- Source: pg_dump --schema-only -t 'proposal' -t 'proposal_*'
-- Date:   2026-04-04 19:31 EDT
-- Auth:   Andy (orchestrated by team: Skeptic ✓, Carter, Gilbert, Bob)
-- GQ77 approved design: "This is great, exactly what I hope to see"
--
-- Tables: 7 RFC tables + proposal core (20 columns)
-- State Machine: Proposal→Draft→Review→Develop→Merge→Complete
-- Maturity: 0:New → 1:Active → 2:Mature → 3:Obsolete
-- Reason Codes: mature🌳 decision⚖️ iteration🔄 depend🔗 discard🗑️ reject❌
--
-- CASCADE: child records auto-delete with parent proposal
-- SET NULL: orphaned discussion replies preserved (soft reference)
-- NO ACTION: proposal_version must be manually deleted (data safety)
-- ============================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET check_function_bodies = false;
SET client_min_messages = warning;

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Core Proposal Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal (
    id                        bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_id                text UNIQUE,
    parent_id                 bigint REFERENCES proposal(id),
    proposal_type             text NOT NULL,
    category                  text,
    domain_id                 text,
    title                     text,
    body_markdown             text,
    body_embedding            vector(1536),
    process_logic             text,
    maturity_level            integer DEFAULT 0,
    status                    text DEFAULT 'NEW'::text,
    budget_limit_usd          numeric(12,2),
    tags                      jsonb,
    rfc_state                 text CHECK (rfc_state IS NULL OR rfc_state IN ('DRAFT','REVIEW','DEVELOP','MERGE','COMPLETE')),
    maturity_queue_position   integer DEFAULT 0,
    blocked_by_dependencies   boolean DEFAULT false,
    accepted_criteria_count   integer DEFAULT 0,
    required_criteria_count   integer DEFAULT 0,
    priority                  integer DEFAULT 5,
    created_at                timestamp with time zone DEFAULT now(),
    updated_at                timestamp with time zone DEFAULT now()
);
CREATE INDEX idx_proposal_maturity ON proposal USING btree (maturity_level);
CREATE INDEX idx_proposal_status ON proposal USING btree (status);
CREATE INDEX idx_proposal_type ON proposal USING btree (proposal_type);

-- ─── State Machine Rules (Data-Driven) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_valid_transitions (
    id              bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_state      text NOT NULL,
    to_state        text NOT NULL,
    allowed_reasons text[],
    allowed_roles   text[],
    requires_ac     text CHECK (requires_ac IN ('none','all','critical')),
    CONSTRAINT valid_transitions_states CHECK (
        from_state IN ('PROPOSAL','DRAFT','REVIEW','DEVELOP','MERGE','COMPLETE','DISCARDED','REJECTED','DEFERRED')
        AND to_state IN ('PROPOSAL','DRAFT','REVIEW','DEVELOP','MERGE','COMPLETE','DISCARDED','REJECTED','DEFERRED')
    ),
    UNIQUE (from_state, to_state)
);
CREATE INDEX idx_valid_transitions_from ON proposal_valid_transitions USING btree (from_state);
CREATE INDEX idx_valid_transitions_to ON proposal_valid_transitions USING btree (to_state);

-- ─── Audit Trail ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_state_transitions (
    id                    bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id           bigint NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    from_state            text NOT NULL CHECK (from_state IN ('PROPOSAL','DRAFT','REVIEW','DEVELOP','MERGE','COMPLETE','DISCARDED','REJECTED','DEFERRED')),
    to_state              text NOT NULL CHECK (to_state IN ('PROPOSAL','DRAFT','REVIEW','DEVELOP','MERGE','COMPLETE','DISCARDED','REJECTED','DEFERRED')),
    transition_reason     text NOT NULL CHECK (transition_reason IN ('mature','decision','iteration','depend','discard','rejected','research','division','submit')),
    emoji                 character(4),
    depends_on_display_id text,
    transitioned_by       text,
    notes                 text,
    transitioned_at       timestamp with time zone DEFAULT now()
);
COMMENT ON COLUMN proposal_state_transitions.transition_reason IS 'mature(🌳), decision(⚖️), iteration(🔄), depend(🔗), discard(🗑️), rejected(❌), research(🔬), division(➗), submit(📤)';
CREATE INDEX idx_state_transitions_proposal ON proposal_state_transitions USING btree (proposal_id);
CREATE INDEX idx_state_transitions_reason ON proposal_state_transitions USING btree (transition_reason);
CREATE INDEX idx_state_transitions_to_state ON proposal_state_transitions USING btree (to_state);
CREATE INDEX idx_state_transitions_time ON proposal_state_transitions USING btree (transitioned_at DESC);

-- ─── Acceptance Criteria ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_acceptance_criteria (
    id                bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id       bigint NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    item_number       integer NOT NULL CHECK (item_number > 0),
    criterion_text    text NOT NULL,
    status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','pass','fail','blocked','waived')),
    verified_by       text,
    verification_notes text,
    verified_at       timestamp with time zone,
    created_at        timestamp with time zone DEFAULT now(),
    updated_at        timestamp with time zone DEFAULT now(),
    UNIQUE (proposal_id, item_number)
);
CREATE INDEX idx_ac_proposal ON proposal_acceptance_criteria USING btree (proposal_id);
CREATE INDEX idx_ac_status ON proposal_acceptance_criteria USING btree (status);
CREATE UNIQUE INDEX idx_ac_unique_per_proposal ON proposal_acceptance_criteria USING btree (proposal_id, item_number);

-- ─── Dependencies (DAG) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_dependencies (
    id              bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_proposal_id bigint NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    to_proposal_id  bigint NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    dependency_type text NOT NULL DEFAULT 'blocks' CHECK (dependency_type IN ('blocks','depended_by','supersedes','relates')),
    created_at      timestamp with time zone DEFAULT now(),
    updated_at      timestamp with time zone DEFAULT now(),
    resolved        boolean DEFAULT false,
    resolved_at     timestamp with time zone,
    UNIQUE (from_proposal_id, to_proposal_id)
);
CREATE INDEX idx_dependees_from ON proposal_dependencies USING btree (from_proposal_id);
CREATE INDEX idx_dependees_to ON proposal_dependencies USING btree (to_proposal_id);
CREATE INDEX idx_deps_from ON proposal_dependencies USING btree (from_proposal_id) WHERE resolved = false;
CREATE INDEX idx_deps_to ON proposal_dependencies USING btree (to_proposal_id);

-- ─── Discussions (Threaded + Vector Search) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_discussions (
    id                bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id       bigint NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    parent_id         bigint REFERENCES proposal_discussions(id) ON DELETE SET NULL,
    author_identity   text NOT NULL,
    context_prefix    text CHECK (context_prefix IN ('arch:','team:','critical:','security:','general:','feedback:','concern:','poc:')),
    body              text NOT NULL,
    body_embedding    vector(1536),
    body_markdown     text,
    created_at        timestamp with time zone DEFAULT now(),
    updated_at        timestamp with time zone DEFAULT now()
);
CREATE INDEX idx_discussion_proposal ON proposal_discussions USING btree (proposal_id);
CREATE INDEX idx_discussion_parent ON proposal_discussions USING btree (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_discussion_author ON proposal_discussions USING btree (author_identity);
CREATE INDEX idx_discussion_created ON proposal_discussions USING btree (created_at DESC);
CREATE INDEX idx_discussion_embedding ON proposal_discussions USING hnsw (body_embedding vector_cosine_ops) WITH (m='16', ef_construction='64');
CREATE INDEX idx_discussion_context ON proposal_discussions USING btree (context_prefix) WHERE context_prefix IS NOT NULL;

-- ─── Reviews (Structured Outcomes) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_reviews (
    id                bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id       bigint NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    reviewer_identity text NOT NULL,
    verdict           text NOT NULL CHECK (verdict IN ('approve','request_changes','reject')),
    findings          jsonb,
    notes             text,
    reviewed_at       timestamp with time zone DEFAULT now(),
    comment           text,
    is_blocking       boolean DEFAULT false,
    UNIQUE NULLS NOT DISTINCT (proposal_id, reviewer_identity)
);
COMMENT ON TABLE proposal_reviews IS 'Formal review outcomes (approve/request_changes/reject).';
CREATE INDEX idx_reviews_proposal ON proposal_reviews USING btree (proposal_id);
CREATE INDEX idx_reviews_reviewer ON proposal_reviews USING btree (reviewer_identity);
CREATE INDEX idx_reviews_verdict ON proposal_reviews USING btree (verdict);
CREATE INDEX idx_reviews_blocking ON proposal_reviews USING btree (proposal_id) WHERE is_blocking = true;
CREATE INDEX idx_reviews_findings ON proposal_reviews USING gin (findings);

-- ─── Labels (Indexed Filtering) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_labels (
    proposal_id bigint NOT NULL REFERENCES proposal(id) ON DELETE CASCADE,
    label       text NOT NULL,
    PRIMARY KEY (proposal_id, label)
);
CREATE INDEX idx_labels_label ON proposal_labels USING btree (label);

-- ─── Version History ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposal_version (
    id                  bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    proposal_id         bigint REFERENCES proposal(id),
    author_identity     text,
    version_number      integer,
    change_summary      text,
    body_delta          text,
    metadata_delta_json jsonb,
    git_commit_sha      text,
    created_at          timestamp with time zone DEFAULT now()
);
