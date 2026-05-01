-- P748: agent_role_profile table with queue-native keys
-- Replaces legacy agent_role_profile (role_label PK) with a queue-keyed table
-- keyed by (scope, workflow_template_id, stage, maturity, role).
-- Legacy table is renamed to agent_role_profile_legacy to preserve existing data.
-- Ref: P748

BEGIN;

-- ─────────────────────────────────────────────
-- 1. Preserve legacy table (different schema)
-- ─────────────────────────────────────────────
ALTER TABLE roadmap.agent_role_profile
  RENAME TO agent_role_profile_legacy;

-- ─────────────────────────────────────────────
-- 2. Create new queue-native table
-- ─────────────────────────────────────────────
CREATE TABLE roadmap.agent_role_profile (
  id                      BIGSERIAL PRIMARY KEY,
  scope                   TEXT        NOT NULL CHECK (scope IN ('global', 'project')),
  project_id              BIGINT      NULL,
  workflow_template_id    BIGINT      NOT NULL
                            REFERENCES roadmap.workflow_templates(id) ON DELETE CASCADE,
  stage                   TEXT        NOT NULL,
  maturity                TEXT        NOT NULL
                            CHECK (maturity IN ('new', 'active', 'mature', 'obsolete')),
  role                    TEXT        NOT NULL,
  required_capabilities   TEXT[]      NOT NULL DEFAULT '{}',
  allowed_route_providers TEXT[]      NULL,
  forbidden_route_providers TEXT[]    NULL,
  prompt_template         JSONB,
  priority                INTEGER     NOT NULL DEFAULT 100,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 3. Unique constraints
--    Global rows  : project_id IS NULL  → partial unique index
--    Project rows : project_id NOT NULL → partial unique index
-- ─────────────────────────────────────────────
CREATE UNIQUE INDEX uq_agent_role_profile_global
  ON roadmap.agent_role_profile (workflow_template_id, stage, maturity, role)
  WHERE scope = 'global' AND project_id IS NULL;

CREATE UNIQUE INDEX uq_agent_role_profile_project
  ON roadmap.agent_role_profile (project_id, workflow_template_id, stage, maturity, role)
  WHERE scope = 'project' AND project_id IS NOT NULL;

-- Supporting lookup indexes
CREATE INDEX idx_agent_role_profile_queue
  ON roadmap.agent_role_profile (workflow_template_id, stage, maturity);

CREATE INDEX idx_agent_role_profile_project_id
  ON roadmap.agent_role_profile (project_id)
  WHERE project_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 4. Grants
-- ─────────────────────────────────────────────
GRANT SELECT ON roadmap.agent_role_profile TO roadmap_agent;
GRANT SELECT ON roadmap.agent_role_profile TO PUBLIC;

-- ─────────────────────────────────────────────
-- 5. Seed: Standard RFC (workflow_template_id = 14)
--    Stages: DRAFT, REVIEW, DEVELOP, MERGE
--    Maturity: new, mature
-- ─────────────────────────────────────────────
INSERT INTO roadmap.agent_role_profile
  (scope, workflow_template_id, stage, maturity, role, required_capabilities, prompt_template, priority)
VALUES

  -- DRAFT stage – new maturity
  ('global', 14, 'DRAFT', 'new',    'drafter',
   ARRAY['text_generation'],
   '{"system": "You are a technical drafter creating initial RFC proposals.", "mode": "draft"}'::jsonb,
   100),

  ('global', 14, 'DRAFT', 'new',    'enrichment_agent',
   ARRAY['web_search','summarization'],
   '{"system": "You enrich RFC drafts with supporting context and references.", "mode": "enrich"}'::jsonb,
   110),

  -- DRAFT stage – mature maturity
  ('global', 14, 'DRAFT', 'mature', 'drafter',
   ARRAY['text_generation','structured_output'],
   '{"system": "You are a senior technical drafter refining mature RFC proposals.", "mode": "draft_mature"}'::jsonb,
   100),

  ('global', 14, 'DRAFT', 'mature', 'enrichment_agent',
   ARRAY['web_search','summarization','citation'],
   '{"system": "You enrich mature RFC drafts with authoritative references and deep context.", "mode": "enrich_mature"}'::jsonb,
   110),

  -- REVIEW stage – new maturity
  ('global', 14, 'REVIEW', 'new',   'reviewer',
   ARRAY['text_analysis','critique'],
   '{"system": "You review new RFC proposals for completeness and correctness.", "mode": "review"}'::jsonb,
   100),

  ('global', 14, 'REVIEW', 'new',   'gate_decision_agent',
   ARRAY['decision_making','structured_output'],
   '{"system": "You make gate/pass/fail decisions for new RFCs entering review.", "mode": "gate"}'::jsonb,
   90),

  -- REVIEW stage – mature maturity
  ('global', 14, 'REVIEW', 'mature','reviewer',
   ARRAY['text_analysis','critique','structured_output'],
   '{"system": "You perform deep technical review of mature RFC proposals.", "mode": "review_mature"}'::jsonb,
   100),

  ('global', 14, 'REVIEW', 'mature','gate_decision_agent',
   ARRAY['decision_making','structured_output'],
   '{"system": "You make authoritative gate decisions for mature RFCs entering development.", "mode": "gate_mature"}'::jsonb,
   90),

  -- DEVELOP stage – new maturity
  ('global', 14, 'DEVELOP', 'new',  'developer',
   ARRAY['code_generation','tool_use'],
   '{"system": "You implement new RFC proposals as working code.", "mode": "develop"}'::jsonb,
   100),

  -- DEVELOP stage – mature maturity
  ('global', 14, 'DEVELOP', 'mature','developer',
   ARRAY['code_generation','tool_use','refactoring'],
   '{"system": "You implement mature RFC proposals with production-grade code.", "mode": "develop_mature"}'::jsonb,
   100),

  -- MERGE stage – new maturity
  ('global', 14, 'MERGE', 'new',    'merge_decision_agent',
   ARRAY['decision_making','code_review'],
   '{"system": "You decide whether new RFC implementations are ready to merge.", "mode": "merge_gate"}'::jsonb,
   90),

  -- MERGE stage – mature maturity
  ('global', 14, 'MERGE', 'mature', 'merge_decision_agent',
   ARRAY['decision_making','code_review','structured_output'],
   '{"system": "You make final merge decisions for mature RFC implementations.", "mode": "merge_gate_mature"}'::jsonb,
   90),

-- ─────────────────────────────────────────────
-- 6. Seed: Hotfix (workflow_template_id = 37)
--    Stages: DRAFT, REVIEW, DEVELOP, MERGE
--    Maturity: new, mature
-- ─────────────────────────────────────────────

  -- DRAFT stage – new maturity
  ('global', 37, 'DRAFT', 'new',    'drafter',
   ARRAY['text_generation'],
   '{"system": "You draft concise hotfix change proposals with urgency context.", "mode": "hotfix_draft"}'::jsonb,
   100),

  ('global', 37, 'DRAFT', 'new',    'enrichment_agent',
   ARRAY['web_search','log_analysis'],
   '{"system": "You enrich hotfix drafts with incident context and root-cause evidence.", "mode": "hotfix_enrich"}'::jsonb,
   110),

  -- DRAFT stage – mature maturity
  ('global', 37, 'DRAFT', 'mature', 'drafter',
   ARRAY['text_generation','structured_output'],
   '{"system": "You draft mature hotfix proposals with full impact analysis.", "mode": "hotfix_draft_mature"}'::jsonb,
   100),

  ('global', 37, 'DRAFT', 'mature', 'enrichment_agent',
   ARRAY['web_search','log_analysis','citation'],
   '{"system": "You enrich mature hotfix drafts with comprehensive post-incident data.", "mode": "hotfix_enrich_mature"}'::jsonb,
   110),

  -- REVIEW stage – new maturity
  ('global', 37, 'REVIEW', 'new',   'reviewer',
   ARRAY['text_analysis','critique'],
   '{"system": "You rapidly review new hotfix proposals for safety and correctness.", "mode": "hotfix_review"}'::jsonb,
   100),

  ('global', 37, 'REVIEW', 'new',   'gate_decision_agent',
   ARRAY['decision_making','structured_output'],
   '{"system": "You make fast gate decisions for new hotfix proposals under time pressure.", "mode": "hotfix_gate"}'::jsonb,
   90),

  -- REVIEW stage – mature maturity
  ('global', 37, 'REVIEW', 'mature','reviewer',
   ARRAY['text_analysis','critique','structured_output'],
   '{"system": "You perform thorough review of mature hotfix proposals.", "mode": "hotfix_review_mature"}'::jsonb,
   100),

  ('global', 37, 'REVIEW', 'mature','gate_decision_agent',
   ARRAY['decision_making','structured_output'],
   '{"system": "You make authoritative gate decisions for mature hotfixes.", "mode": "hotfix_gate_mature"}'::jsonb,
   90),

  -- DEVELOP stage – new maturity
  ('global', 37, 'DEVELOP', 'new',  'developer',
   ARRAY['code_generation','tool_use'],
   '{"system": "You implement new hotfixes quickly with minimal blast radius.", "mode": "hotfix_develop"}'::jsonb,
   100),

  -- DEVELOP stage – mature maturity
  ('global', 37, 'DEVELOP', 'mature','developer',
   ARRAY['code_generation','tool_use','refactoring'],
   '{"system": "You implement mature hotfixes with full regression awareness.", "mode": "hotfix_develop_mature"}'::jsonb,
   100),

  -- MERGE stage – new maturity
  ('global', 37, 'MERGE', 'new',    'merge_decision_agent',
   ARRAY['decision_making','code_review'],
   '{"system": "You approve or reject new hotfix merges under urgency constraints.", "mode": "hotfix_merge_gate"}'::jsonb,
   90),

  -- MERGE stage – mature maturity
  ('global', 37, 'MERGE', 'mature', 'merge_decision_agent',
   ARRAY['decision_making','code_review','structured_output'],
   '{"system": "You make final merge decisions for mature hotfix implementations.", "mode": "hotfix_merge_gate_mature"}'::jsonb,
   90)

ON CONFLICT DO NOTHING;

COMMIT;
