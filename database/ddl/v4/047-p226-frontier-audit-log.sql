-- P226: Frontier audit log table
-- Tracks frontier model audits of mid/lower-tier decisions.
-- Addresses skeptic-beta m2: also adds frontier_audit event types to proposal_event constraint.
--
-- The frontier audit loop reviews decisions made by cheaper models and can
-- pause proposal advancement if critical architectural drift is detected.

BEGIN;

-- Frontier audit log (in roadmap_proposal schema — it's proposal-scoped)
CREATE TABLE IF NOT EXISTS roadmap_proposal.frontier_audit_log (
    id BIGSERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL REFERENCES roadmap_proposal.proposal(id),
    decision_id BIGINT NOT NULL REFERENCES roadmap_proposal.gate_decision_log(id),
    decision_maker TEXT NOT NULL,
    decision_tier TEXT NOT NULL CHECK (decision_tier IN ('mid', 'lower')),
    audit_timestamp TIMESTAMPTZ DEFAULT now(),
    auditor TEXT DEFAULT 'frontier-agent',
    audit_severity TEXT CHECK (audit_severity IN ('low', 'medium', 'critical')),
    audit_notes TEXT,
    action_taken TEXT CHECK (action_taken IN ('none', 'flag', 'pause', 'retry'))
);

CREATE INDEX idx_frontier_audit_proposal ON roadmap_proposal.frontier_audit_log(proposal_id);
CREATE INDEX idx_frontier_audit_severity ON roadmap_proposal.frontier_audit_log(audit_severity) WHERE audit_severity = 'critical';
CREATE INDEX idx_frontier_audit_decision ON roadmap_proposal.frontier_audit_log(decision_id);
CREATE INDEX idx_frontier_audit_timestamp ON roadmap_proposal.frontier_audit_log(audit_timestamp DESC);

-- Add frontier_audit event types to proposal_event CHECK constraint (fixes skeptic-beta m2)
-- First drop existing constraint, then recreate with new types
ALTER TABLE roadmap_proposal.proposal_event
    DROP CONSTRAINT IF EXISTS proposal_event_type_check;

ALTER TABLE roadmap_proposal.proposal_event
    ADD CONSTRAINT proposal_event_type_check CHECK (event_type = ANY (ARRAY[
        'status_changed', 'decision_made', 'lease_claimed', 'lease_released',
        'dependency_added', 'dependency_resolved', 'ac_updated', 'review_submitted',
        'maturity_changed', 'milestone_achieved', 'proposal_created',
        'gate_dispatched', 'gate_advanced', 'gate_held', 'gate_failed',
        'agent_dispatched', 'agent_completed', 'agent_failed',
        'agent_sos', 'agent_ask', 'agent_decision', 'squad_dispatched',
        'frontier_audit_flag', 'frontier_audit_pause', 'frontier_audit_critical'
    ]));

COMMIT;
