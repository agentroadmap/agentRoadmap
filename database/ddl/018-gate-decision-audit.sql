-- Gate Decision Audit Trail (P167)
-- Records structured decision rationale for every proposal state transition
-- including AC verification, dependency checks, and architectural review

BEGIN;

-- Table to store detailed gate decisions with complete rationale
CREATE TABLE IF NOT EXISTS roadmap.gate_decision_log (
    id              int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    proposal_id     int8        NOT NULL,
    from_state      text        NOT NULL,     -- DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE
    to_state        text        NOT NULL,
    gate_level      text        NULL,         -- D1, D2, D3, D4 (depends on transition)
    decision        text        NOT NULL,     -- 'approve' | 'reject' | 'defer'
    decided_by      text        NOT NULL,     -- agent identity
    ac_verification jsonb       NULL,         -- { passed: int, failed: int, blocked: int, checks: [] }
    dependency_check jsonb      NULL,         -- { resolved: bool, blockers: [] }
    design_review   jsonb       NULL,         -- { coherent: bool, feedback: [] }
    rationale       text        NULL,         -- Human readable decision explanation
    challenges      text[]      NULL,         -- Questions raised
    blockers        text[]      NULL,         -- Blocking issues if rejected
    created_at      timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT gate_decision_log_pkey           PRIMARY KEY (id),
    CONSTRAINT gate_decision_log_decision_check CHECK (decision IN ('approve', 'reject', 'defer')),
    CONSTRAINT gate_decision_log_proposal_fkey  FOREIGN KEY (proposal_id)
        REFERENCES roadmap.proposal (id) ON DELETE CASCADE
);

CREATE INDEX idx_gate_decision_proposal ON roadmap.gate_decision_log (proposal_id);
CREATE INDEX idx_gate_decision_state    ON roadmap.gate_decision_log (from_state, to_state);
CREATE INDEX idx_gate_decision_created  ON roadmap.gate_decision_log (created_at DESC);
CREATE INDEX idx_gate_decision_decided_by ON roadmap.gate_decision_log (decided_by);

COMMENT ON TABLE  roadmap.gate_decision_log IS 'Detailed gate decisions with rationale, AC verification, and dependency checks for every state transition';
COMMENT ON COLUMN roadmap.gate_decision_log.gate_level IS 'D1=DRAFT→REVIEW, D2=REVIEW→DEVELOP, D3=DEVELOP→MERGE, D4=MERGE→COMPLETE';
COMMENT ON COLUMN roadmap.gate_decision_log.ac_verification IS 'AC check summary: {passed: #, failed: #, blocked: #, checks: [{item_number, status, notes}]}';
COMMENT ON COLUMN roadmap.gate_decision_log.dependency_check IS 'Dependency validation: {resolved: bool, blockers: [list of unresolved deps]}';
COMMENT ON COLUMN roadmap.gate_decision_log.design_review IS 'Design coherence check: {coherent: bool, feedback: [issues]}';
COMMENT ON COLUMN roadmap.gate_decision_log.rationale IS 'Human-readable explanation of the decision';

COMMIT;
