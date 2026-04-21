-- Migration 044: Enriched Workflow Stages (P227)
-- Add mandatory CodeReview, TestWriting, TestExecution stages to Standard RFC and Quick Fix workflows.
-- Code review by different agent than developer. Tests from ACs. Tool agent for test execution.

BEGIN;

-- =====================================================================
-- 1. Standard RFC: Insert new stages between DEVELOP (3) and MERGE (4)
-- =====================================================================

-- Shift MERGE from order 4 to 7, COMPLETE from 5 to 8
UPDATE roadmap.workflow_stages
SET stage_order = 7
WHERE template_id = 14 AND stage_name = 'MERGE';

UPDATE roadmap.workflow_stages
SET stage_order = 8
WHERE template_id = 14 AND stage_name = 'COMPLETE';

-- Insert the 3 new stages
INSERT INTO roadmap.workflow_stages (template_id, stage_name, stage_order, maturity_gate, requires_ac, gating_config)
VALUES
  (14, 'CODEREVIEW', 4, 2, false,
   '{"trigger": "develop_complete", "retry_on_fail": 2, "next_stage": "TESTWRITING",
     "dispatch": {"role": "code_reviewer", "tier": "mid", "exclude_developer": true}}'),
  (14, 'TESTWRITING', 5, 2, false,
   '{"trigger": "code_review_approve", "retry_on_fail": 2, "next_stage": "TESTEXECUTION",
     "dispatch": {"role": "test_writer", "tier": "mid"}}'),
  (14, 'TESTEXECUTION', 6, 2, false,
   '{"trigger": "test_writing_complete", "retry_on_fail": 3, "next_stage": "MERGE",
     "dispatch": {"role": "test_executor", "tier": "tool", "timeout_seconds": 120}}')
ON CONFLICT (template_id, stage_name) DO NOTHING;

-- =====================================================================
-- 2. Standard RFC: Update transitions
-- =====================================================================

-- Remove old direct DEVELOP → MERGE transition
DELETE FROM roadmap.workflow_transitions
WHERE template_id = 14 AND from_stage = 'DEVELOP' AND to_stage = 'MERGE';

-- Add new sequential transitions
INSERT INTO roadmap.workflow_transitions (template_id, from_stage, to_stage, labels, allowed_roles, requires_ac)
VALUES
  -- DEVELOP → CODEREVIEW (code complete, ready for review)
  (14, 'DEVELOP', 'CODEREVIEW', '{mature,complete}', '{PM,Architect}', false),
  -- CODEREVIEW → TESTWRITING (review passed)
  (14, 'CODEREVIEW', 'TESTWRITING', '{approve}', '{PM,Architect}', false),
  -- CODEREVIEW → DEVELOP (changes requested)
  (14, 'CODEREVIEW', 'DEVELOP', '{request_changes,iterate}', '{Architect}', false),
  -- TESTWRITING → TESTEXECUTION (tests written)
  (14, 'TESTWRITING', 'TESTEXECUTION', '{complete}', '{any}', false),
  -- TESTEXECUTION → MERGE (tests passed)
  (14, 'TESTEXECUTION', 'MERGE', '{pass,mature}', '{PM,Architect}', false),
  -- TESTEXECUTION → DEVELOP (tests failed)
  (14, 'TESTEXECUTION', 'DEVELOP', '{fail,iterate}', '{Architect}', false)
ON CONFLICT (template_id, from_stage, to_stage) DO NOTHING;

-- =====================================================================
-- 3. Quick Fix (hotfix): Add TestExecution between FIX and DEPLOYED
-- =====================================================================

-- Shift DEPLOYED from order 3 to 4
UPDATE roadmap.workflow_stages
SET stage_order = 4
WHERE template_id = 15 AND stage_name = 'DEPLOYED';

-- Insert TestExecution stage
INSERT INTO roadmap.workflow_stages (template_id, stage_name, stage_order, maturity_gate, requires_ac, gating_config)
VALUES
  (15, 'TESTEXECUTION', 3, 2, false,
   '{"trigger": "fixing_complete", "retry_on_fail": 1, "next_stage": "DEPLOYED",
     "dispatch": {"role": "test_executor", "tier": "tool", "timeout_seconds": 60}}')
ON CONFLICT (template_id, stage_name) DO NOTHING;

-- Remove old direct FIX → DEPLOYED transition
DELETE FROM roadmap.workflow_transitions
WHERE template_id = 15 AND from_stage = 'FIX' AND to_stage = 'DEPLOYED';

-- Add new transitions for hotfix
INSERT INTO roadmap.workflow_transitions (template_id, from_stage, to_stage, labels, allowed_roles, requires_ac)
VALUES
  -- FIX → TESTEXECUTION
  (15, 'FIX', 'TESTEXECUTION', '{mature,complete}', '{any}', false),
  -- TESTEXECUTION → DEPLOYED (tests passed)
  (15, 'TESTEXECUTION', 'DEPLOYED', '{pass,mature}', '{any}', true),
  -- TESTEXECUTION → FIX (tests failed)
  (15, 'TESTEXECUTION', 'FIX', '{fail,iterate}', '{any}', false)
ON CONFLICT (template_id, from_stage, to_stage) DO NOTHING;

-- =====================================================================
-- 4. Update proposal_valid_transitions for Standard RFC
-- =====================================================================

-- Remove old direct DEVELOP → MERGE from proposal_valid_transitions
DELETE FROM roadmap_proposal.proposal_valid_transitions
WHERE workflow_name = 'Standard RFC' AND from_state = 'DEVELOP' AND to_state = 'MERGE';

-- Add new proposal_valid_transitions for Standard RFC
INSERT INTO roadmap_proposal.proposal_valid_transitions (workflow_name, from_state, to_state, allowed_reasons, allowed_roles, requires_ac)
VALUES
  ('Standard RFC', 'DEVELOP', 'CODEREVIEW', '{mature,complete}', '{PM,Architect}', 'none'),
  ('Standard RFC', 'CODEREVIEW', 'TESTWRITING', '{approve}', '{PM,Architect}', 'none'),
  ('Standard RFC', 'CODEREVIEW', 'DEVELOP', '{request_changes,iterate}', '{Architect}', 'none'),
  ('Standard RFC', 'TESTWRITING', 'TESTEXECUTION', '{complete}', '{any}', 'none'),
  ('Standard RFC', 'TESTEXECUTION', 'MERGE', '{pass,mature}', '{PM,Architect}', 'all'),
  ('Standard RFC', 'TESTEXECUTION', 'DEVELOP', '{fail,iterate}', '{Architect}', 'none')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 5. Update proposal_valid_transitions for Quick Fix
-- =====================================================================

-- Remove old direct FIX → DEPLOYED
DELETE FROM roadmap_proposal.proposal_valid_transitions
WHERE workflow_name = 'Quick Fix' AND from_state = 'FIX' AND to_state = 'DEPLOYED';

-- Add new transitions for Quick Fix
INSERT INTO roadmap_proposal.proposal_valid_transitions (workflow_name, from_state, to_state, allowed_reasons, allowed_roles, requires_ac)
VALUES
  ('Quick Fix', 'FIX', 'TESTEXECUTION', '{mature,complete}', '{any}', 'none'),
  ('Quick Fix', 'TESTEXECUTION', 'DEPLOYED', '{pass,mature}', '{any}', 'all'),
  ('Quick Fix', 'TESTEXECUTION', 'FIX', '{fail,iterate}', '{any}', 'none')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 6. Update stage_count on templates
-- =====================================================================

UPDATE roadmap.workflow_templates
SET stage_count = (SELECT COUNT(*) FROM roadmap.workflow_stages WHERE template_id = 14),
    modified_at = NOW()
WHERE id = 14;

UPDATE roadmap.workflow_templates
SET stage_count = (SELECT COUNT(*) FROM roadmap.workflow_stages WHERE template_id = 15),
    modified_at = NOW()
WHERE id = 15;

COMMIT;
