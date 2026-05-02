-- ============================================================
-- 007-template: Workflow template schema for hiveCentral
-- Immutable workflow templates, state machine definitions,
-- gate criteria, and agent role profiles.
-- Replaces STAGE_DISPATCH_ROLES / JOB_ROLES / GATE_ROLES literals.
-- ============================================================
-- Target DB:  hiveCentral
-- Owner:      agenthive_admin
-- Roles:      agenthive_orchestrator (r all, rw agent_role_profile),
--             agenthive_agency (r all),
--             agenthive_observability (r all)
-- Min PG:     16
-- ============================================================

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS template;

COMMENT ON SCHEMA template IS
  'Workflow template definitions: immutable workflow_template rows, ordered state names, '
  'gate transition criteria, and agent_role_profile rows that replace hardcoded '
  'STAGE_DISPATCH_ROLES/JOB_ROLES/GATE_ROLES literals. All workflow logic is data-driven.';

-- ============================================================
-- template.set_updated_at()
-- ============================================================
CREATE OR REPLACE FUNCTION template.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

-- ============================================================
-- template.workflow_template — immutable workflow definitions
-- ============================================================
-- New version = new row with incremented version. Rows are
-- immutable after INSERT (trigger enforces this).
CREATE OR REPLACE FUNCTION template.deny_workflow_template_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'template.workflow_template rows are immutable (op=%)', TG_OP;
END;
$$;

CREATE TABLE IF NOT EXISTS template.workflow_template (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT         NOT NULL,
  slug         TEXT         NOT NULL,
  version      INT          NOT NULL DEFAULT 1,
  is_current   BOOL         NOT NULL DEFAULT true,
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

CREATE INDEX IF NOT EXISTS workflow_template_slug_current
  ON template.workflow_template (slug, is_current);

CREATE OR REPLACE TRIGGER workflow_template_no_update
  BEFORE UPDATE ON template.workflow_template
  FOR EACH ROW EXECUTE FUNCTION template.deny_workflow_template_update();

COMMENT ON TABLE template.workflow_template IS
  'Immutable workflow template definitions. To create a new version: INSERT a new row '
  'with the same slug and version = old_version + 1, then UPDATE the prior row''s '
  'is_current = false (which is allowed since is_current is not the immutable payload). '
  'The immutability trigger prevents payload changes after the fact.';

-- ============================================================
-- template.state_name — ordered states in a workflow
-- ============================================================
CREATE TABLE IF NOT EXISTS template.state_name (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id  BIGINT       NOT NULL
                            REFERENCES template.workflow_template (id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  ordinal      SMALLINT     NOT NULL,
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, name)
);

CREATE OR REPLACE TRIGGER set_updated_at_state_name
  BEFORE UPDATE ON template.state_name
  FOR EACH ROW EXECUTE FUNCTION template.set_updated_at();

-- ============================================================
-- template.gate_definition — gate transition criteria
-- ============================================================
CREATE TABLE IF NOT EXISTS template.gate_definition (
  id                  BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id         BIGINT       NOT NULL
                                   REFERENCES template.workflow_template (id) ON DELETE CASCADE,
  from_state_id       BIGINT       NOT NULL
                                   REFERENCES template.state_name (id) ON DELETE CASCADE,
  to_state_id         BIGINT       NOT NULL
                                   REFERENCES template.state_name (id) ON DELETE CASCADE,
  required_maturity   TEXT,        -- 'mature' means the proposal must reach mature before gate opens
  min_reviewer_count  SMALLINT     NOT NULL DEFAULT 1,
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, from_state_id)
);

CREATE OR REPLACE TRIGGER set_updated_at_gate_definition
  BEFORE UPDATE ON template.gate_definition
  FOR EACH ROW EXECUTE FUNCTION template.set_updated_at();

COMMENT ON TABLE template.gate_definition IS
  'Gate transition criteria: for each (template, from_state) pair, defines the target '
  'state, the maturity level required before the gate opens, and how many reviewers must '
  'approve. Uniqueness on (template_id, from_state_id) means one gate per state transition.';

-- ============================================================
-- template.agent_role_profile — data-driven dispatch role table
-- Replaces all STAGE_DISPATCH_ROLES / JOB_ROLES / GATE_ROLES literals.
-- ============================================================
-- scope/project_id invariant: same as agency.agency
CREATE OR REPLACE FUNCTION template.check_role_profile_scope()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.scope = 'tenant' AND NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'TenantScopeViolation: agent_role_profile scope=tenant requires project_id';
  END IF;
  IF NEW.scope = 'global' AND NEW.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'TenantScopeViolation: agent_role_profile scope=global requires project_id IS NULL';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS template.agent_role_profile (
  id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id  BIGINT       NOT NULL
                            REFERENCES template.workflow_template (id) ON DELETE CASCADE,
  stage        TEXT         NOT NULL,   -- 'DRAFT','REVIEW','DEVELOP','MERGE'
  maturity     TEXT         NOT NULL,   -- 'new','active','mature'
  roles        TEXT[]       NOT NULL,   -- e.g. '{architect,developer}'
  scope        TEXT         NOT NULL DEFAULT 'global'
                            CHECK (scope IN ('global','tenant')),
  project_id   BIGINT       NULL,
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_role_profile_unique
  ON template.agent_role_profile (template_id, stage, maturity, scope, (COALESCE(project_id, 0)));

CREATE INDEX IF NOT EXISTS agent_role_profile_template_stage_maturity
  ON template.agent_role_profile (template_id, stage, maturity);
CREATE INDEX IF NOT EXISTS agent_role_profile_project_id
  ON template.agent_role_profile (project_id)
  WHERE project_id IS NOT NULL;

CREATE OR REPLACE TRIGGER role_profile_scope_check
  BEFORE INSERT OR UPDATE ON template.agent_role_profile
  FOR EACH ROW EXECUTE FUNCTION template.check_role_profile_scope();

CREATE OR REPLACE TRIGGER set_updated_at_agent_role_profile
  BEFORE UPDATE ON template.agent_role_profile
  FOR EACH ROW EXECUTE FUNCTION template.set_updated_at();

COMMENT ON TABLE template.agent_role_profile IS
  'Data-driven dispatch role table. For each (template, stage, maturity) combination, '
  'defines which agent roles should be dispatched. Replaces all STAGE_DISPATCH_ROLES, '
  'JOB_ROLES, and GATE_ROLES literals. The orchestrator JOINs this table at dispatch '
  'time instead of reading a hardcoded map. scope=tenant rows override global rows for '
  'a specific project.';

-- ============================================================
-- template.proposal_template — proposal structure templates
-- ============================================================
CREATE TABLE IF NOT EXISTS template.proposal_template (
  id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  template_id      BIGINT       NOT NULL
                                REFERENCES template.workflow_template (id) ON DELETE CASCADE,
  name             TEXT         NOT NULL,
  body_schema      JSONB,
  required_fields  TEXT[],
  -- Catalog hygiene:
  owner_did    TEXT,
  lifecycle_status TEXT     NOT NULL DEFAULT 'active'
                            CHECK (lifecycle_status IN ('active','deprecated','retired','blocked')),
  deprecated_at  TIMESTAMPTZ,
  retire_after   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER set_updated_at_proposal_template
  BEFORE UPDATE ON template.proposal_template
  FOR EACH ROW EXECUTE FUNCTION template.set_updated_at();

-- ============================================================
-- Seed: agenthive standard workflow template
-- ============================================================
DO $$
DECLARE
  v_tmpl_id   BIGINT;
  v_draft_id  BIGINT;
  v_review_id BIGINT;
  v_develop_id BIGINT;
  v_merge_id  BIGINT;
  v_complete_id BIGINT;
BEGIN
  -- Insert workflow template
  INSERT INTO template.workflow_template (name, slug, version, is_current, owner_did)
  VALUES ('AgentHive Standard Workflow', 'agenthive', 1, true, 'did:agenthive:system')
  ON CONFLICT (slug, version) DO NOTHING
  RETURNING id INTO v_tmpl_id;

  IF v_tmpl_id IS NULL THEN
    SELECT id INTO v_tmpl_id FROM template.workflow_template WHERE slug = 'agenthive' AND version = 1;
  END IF;

  -- Insert states
  INSERT INTO template.state_name (template_id, name, ordinal, owner_did)
  VALUES
    (v_tmpl_id, 'DRAFT',    1, 'did:agenthive:system'),
    (v_tmpl_id, 'REVIEW',   2, 'did:agenthive:system'),
    (v_tmpl_id, 'DEVELOP',  3, 'did:agenthive:system'),
    (v_tmpl_id, 'MERGE',    4, 'did:agenthive:system'),
    (v_tmpl_id, 'COMPLETE', 5, 'did:agenthive:system')
  ON CONFLICT (template_id, name) DO NOTHING;

  SELECT id INTO v_draft_id    FROM template.state_name WHERE template_id = v_tmpl_id AND name = 'DRAFT';
  SELECT id INTO v_review_id   FROM template.state_name WHERE template_id = v_tmpl_id AND name = 'REVIEW';
  SELECT id INTO v_develop_id  FROM template.state_name WHERE template_id = v_tmpl_id AND name = 'DEVELOP';
  SELECT id INTO v_merge_id    FROM template.state_name WHERE template_id = v_tmpl_id AND name = 'MERGE';
  SELECT id INTO v_complete_id FROM template.state_name WHERE template_id = v_tmpl_id AND name = 'COMPLETE';

  -- Insert gate definitions
  INSERT INTO template.gate_definition (template_id, from_state_id, to_state_id, required_maturity, min_reviewer_count, owner_did)
  VALUES
    (v_tmpl_id, v_draft_id,   v_review_id,   'mature', 1, 'did:agenthive:system'),
    (v_tmpl_id, v_review_id,  v_develop_id,  'mature', 1, 'did:agenthive:system'),
    (v_tmpl_id, v_develop_id, v_merge_id,    'mature', 1, 'did:agenthive:system'),
    (v_tmpl_id, v_merge_id,   v_complete_id, 'mature', 1, 'did:agenthive:system')
  ON CONFLICT (template_id, from_state_id) DO NOTHING;

  -- Insert agent_role_profile (replaces STAGE_DISPATCH_ROLES map)
  -- new = waiting for lease / initial dispatch
  -- active = under active development
  -- mature = finished, gate review pending
  INSERT INTO template.agent_role_profile (template_id, stage, maturity, roles, owner_did)
  VALUES
    (v_tmpl_id, 'DRAFT',   'new',    ARRAY['architect'],                     'did:agenthive:system'),
    (v_tmpl_id, 'DRAFT',   'active', ARRAY['architect'],                     'did:agenthive:system'),
    (v_tmpl_id, 'DRAFT',   'mature', ARRAY['gate-reviewer'],                 'did:agenthive:system'),
    (v_tmpl_id, 'REVIEW',  'new',    ARRAY['reviewer'],                      'did:agenthive:system'),
    (v_tmpl_id, 'REVIEW',  'active', ARRAY['reviewer'],                      'did:agenthive:system'),
    (v_tmpl_id, 'REVIEW',  'mature', ARRAY['gate-reviewer'],                 'did:agenthive:system'),
    (v_tmpl_id, 'DEVELOP', 'new',    ARRAY['developer'],                     'did:agenthive:system'),
    (v_tmpl_id, 'DEVELOP', 'active', ARRAY['developer'],                     'did:agenthive:system'),
    (v_tmpl_id, 'DEVELOP', 'mature', ARRAY['gate-reviewer','code-reviewer'], 'did:agenthive:system'),
    (v_tmpl_id, 'MERGE',   'new',    ARRAY['merger'],                        'did:agenthive:system'),
    (v_tmpl_id, 'MERGE',   'active', ARRAY['merger'],                        'did:agenthive:system'),
    (v_tmpl_id, 'MERGE',   'mature', ARRAY['gate-reviewer'],                 'did:agenthive:system')
  ON CONFLICT (template_id, stage, maturity, scope, (COALESCE(project_id, 0))) DO NOTHING;
END;
$$;

-- ============================================================
-- Views
-- ============================================================
CREATE OR REPLACE VIEW template.v_current_role_profiles AS
SELECT
  wt.slug AS template_slug,
  arp.stage,
  arp.maturity,
  arp.roles,
  arp.scope,
  arp.project_id
FROM template.agent_role_profile arp
JOIN template.workflow_template wt ON wt.id = arp.template_id
WHERE wt.is_current = true
  AND arp.lifecycle_status = 'active'
ORDER BY wt.slug, arp.stage, arp.maturity;

COMMENT ON VIEW template.v_current_role_profiles IS
  'Active agent role profiles for all current workflow templates. '
  'The orchestrator queries this view at dispatch time to resolve which roles to spawn.';

-- ============================================================
-- Grants
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_orchestrator') THEN
    GRANT USAGE ON SCHEMA template TO agenthive_orchestrator;
    GRANT SELECT ON ALL TABLES IN SCHEMA template TO agenthive_orchestrator;
    GRANT INSERT, UPDATE ON template.agent_role_profile TO agenthive_orchestrator;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA template TO agenthive_orchestrator;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_agency') THEN
    GRANT USAGE ON SCHEMA template TO agenthive_agency;
    GRANT SELECT ON ALL TABLES IN SCHEMA template TO agenthive_agency;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenthive_observability') THEN
    GRANT USAGE ON SCHEMA template TO agenthive_observability;
    GRANT SELECT ON ALL TABLES IN SCHEMA template TO agenthive_observability;
  END IF;
END $$;

\echo 'template schema applied.'
