-- Migration 041: Enhanced proposal detail view with ALL child entities
-- Includes: discussions, reviews, gate decisions, dispatches
-- Created: 2026-04-21

CREATE OR REPLACE VIEW roadmap_proposal.v_proposal_detail AS
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
    p.required_capabilities,
    
    -- Dependencies
    COALESCE(dep.deps, '[]'::jsonb) AS dependencies,
    
    -- Acceptance Criteria
    COALESCE(ac.criteria, '[]'::jsonb) AS acceptance_criteria,
    
    -- Latest decision (legacy)
    dec.latest_decision,
    dec.decision_at,
    
    -- Full gate decision history (NEW)
    COALESCE(gd.gate_decisions, '[]'::jsonb) AS gate_decisions,
    
    -- Discussions (NEW)
    COALESCE(disc.discussions, '[]'::jsonb) AS discussions,
    
    -- Reviews (NEW)
    COALESCE(rev.reviews, '[]'::jsonb) AS reviews,
    
    -- Current lease
    lease.leased_by,
    lease.lease_expires,
    
    -- Active dispatches (NEW)
    COALESCE(disp.dispatches, '[]'::jsonb) AS active_dispatches,
    
    -- Workflow
    wf.workflow_name,
    wf.current_stage
    
FROM roadmap_proposal.proposal p

-- Dependencies
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'to_display_id', pd.display_id, 
        'dependency_type', d.dependency_type, 
        'resolved', d.resolved
    )) AS deps
    FROM roadmap_proposal.proposal_dependencies d
    JOIN roadmap_proposal.proposal pd ON pd.id = d.to_proposal_id
    WHERE d.from_proposal_id = p.id
) dep ON true

-- Acceptance Criteria
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'item_number', ac_1.item_number, 
        'criterion_text', ac_1.criterion_text, 
        'status', ac_1.status, 
        'verified_by', ac_1.verified_by
    ) ORDER BY ac_1.item_number) AS criteria
    FROM roadmap_proposal.proposal_acceptance_criteria ac_1
    WHERE ac_1.proposal_id = p.id
) ac ON true

-- Latest decision (legacy compatibility)
LEFT JOIN LATERAL (
    SELECT pd.decision AS latest_decision,
           pd.decided_at AS decision_at
    FROM roadmap_proposal.proposal_decision pd
    WHERE pd.proposal_id = p.id
    ORDER BY pd.decided_at DESC
    LIMIT 1
) dec ON true

-- Full gate decision history (from gate_decision_log)
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'decision', gd_1.decision,
        'from_state', gd_1.from_state,
        'to_state', gd_1.to_state,
        'maturity', gd_1.maturity,
        'gate', gd_1.gate,
        'gate_level', gd_1.gate_level,
        'decided_by', gd_1.decided_by,
        'authority_agent', gd_1.authority_agent,
        'rationale', gd_1.rationale,
        'ac_verification', gd_1.ac_verification,
        'dependency_check', gd_1.dependency_check,
        'design_review', gd_1.design_review,
        'challenges', gd_1.challenges,
        'blockers', gd_1.blockers,
        'created_at', gd_1.created_at
    ) ORDER BY gd_1.created_at DESC) AS gate_decisions
    FROM roadmap.gate_decision_log gd_1
    WHERE gd_1.proposal_id = p.id
) gd ON true

-- Discussions
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'id', pd_1.id,
        'author_identity', pd_1.author_identity,
        'body', pd_1.body,
        'created_at', pd_1.created_at
    ) ORDER BY pd_1.created_at DESC) AS discussions
    FROM roadmap_proposal.proposal_discussions pd_1
    WHERE pd_1.proposal_id = p.id
) disc ON true

-- Reviews
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'reviewer_identity', pr_1.reviewer_identity,
        'verdict', pr_1.verdict,
        'findings', pr_1.findings,
        'notes', pr_1.notes,
        'is_blocking', pr_1.is_blocking,
        'reviewed_at', pr_1.reviewed_at
    ) ORDER BY pr_1.reviewed_at DESC) AS reviews
    FROM roadmap_proposal.proposal_reviews pr_1
    WHERE pr_1.proposal_id = p.id
) rev ON true

-- Current lease
LEFT JOIN LATERAL (
    SELECT pl.agent_identity AS leased_by,
           pl.expires_at AS lease_expires
    FROM roadmap_proposal.proposal_lease pl
    WHERE pl.proposal_id = p.id AND pl.released_at IS NULL
    ORDER BY pl.claimed_at DESC
    LIMIT 1
) lease ON true

-- Active dispatches (open/assigned/active only)
LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
        'id', sd.id,
        'dispatch_role', sd.dispatch_role,
        'dispatch_status', sd.dispatch_status,
        'agent_identity', sd.agent_identity,
        'worker_identity', sd.worker_identity,
        'assigned_at', sd.assigned_at
    ) ORDER BY sd.assigned_at DESC) AS dispatches
    FROM roadmap_workforce.squad_dispatch sd
    WHERE sd.proposal_id = p.id 
      AND sd.dispatch_status IN ('open', 'assigned', 'active')
) disp ON true

-- Workflow
LEFT JOIN LATERAL (
    SELECT ptc.workflow_name,
           w.current_stage
    FROM roadmap.workflows w
    JOIN roadmap.workflow_templates wt ON wt.id = w.template_id
    JOIN roadmap_proposal.proposal_type_config ptc ON ptc.workflow_name = wt.name
    WHERE w.proposal_id = p.id
    LIMIT 1
) wf ON true;

-- Add comment for documentation
COMMENT ON VIEW roadmap_proposal.v_proposal_detail IS 'Complete proposal with ALL child entities as JSONB: ACs, dependencies, discussions, reviews, gate decisions, active dispatches, lease, workflow. Used by getProposalDetail MCP action.';
