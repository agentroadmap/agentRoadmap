-- P187: Reference Catalog System
-- Two-table universal controlled vocabulary for all AgentHive domains.
-- Runs alongside existing roadmap.reference_terms (single-table baseline);
-- does NOT drop or alter that table.

-- ── Domain registry ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roadmap.reference_domain (
  domain_key    text PRIMARY KEY,
  label         text NOT NULL,
  description   text,
  value_kind    text NOT NULL DEFAULT 'text',
  owner_scope   text NOT NULL DEFAULT 'global',
  is_extensible bool NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (value_kind IN ('text', 'int', 'boolean')),
  CHECK (owner_scope IN ('global', 'workflow', 'proposal_type'))
);

-- ── Term registry ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roadmap.reference_term (
  domain_key   text NOT NULL REFERENCES roadmap.reference_domain(domain_key),
  term_key     text NOT NULL,
  label        text NOT NULL,
  description  text,
  ordinal      int4,
  rank_value   int4,
  is_active    bool NOT NULL DEFAULT true,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  modified_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (domain_key, term_key),
  CHECK (term_key ~ '^[a-z][a-z0-9_]*$')
);

CREATE INDEX IF NOT EXISTS idx_reference_term_domain
  ON roadmap.reference_term(domain_key);
CREATE INDEX IF NOT EXISTS idx_reference_term_active
  ON roadmap.reference_term(is_active) WHERE is_active = true;

-- ── auto-update modified_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION roadmap.fn_reference_term_modified_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.modified_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reference_term_modified_at ON roadmap.reference_term;
CREATE TRIGGER trg_reference_term_modified_at
  BEFORE UPDATE ON roadmap.reference_term
  FOR EACH ROW EXECUTE FUNCTION roadmap.fn_reference_term_modified_at();

-- ── Seed: 12 domains ─────────────────────────────────────────────────────────
INSERT INTO roadmap.reference_domain (domain_key, label, description, value_kind, owner_scope, is_extensible) VALUES
  ('proposal_maturity',    'Proposal Maturity',       'Lifecycle stages within a workflow state',         'text', 'global', false),
  ('proposal_type',        'Proposal Type',           'Proposal classification / RFC type',               'text', 'global', false),
  ('dependency_type',      'Dependency Type',         'Relationships between proposals',                  'text', 'global', false),
  ('review_verdict',       'Review Verdict',          'Review decision outcomes',                         'text', 'global', false),
  ('proposal_decision',    'Proposal Decision',       'Gate decision outcomes',                           'text', 'global', false),
  ('agent_status',         'Agent Status',            'Agent lifecycle states',                           'text', 'global', false),
  ('ac_status',            'AC Status',               'Acceptance criteria verification outcomes',        'text', 'global', false),
  ('gate_level',           'Gate Level',              'Gating review depth levels',                       'text', 'global', false),
  ('proposal_state',       'Proposal State',          'Workflow states for the proposal state machine',   'text', 'global', false),
  ('notification_surface', 'Notification Surface',    'Surfaces where notifications are delivered',       'text', 'global', false),
  ('run_status',           'Run Status',              'Execution / job run outcomes',                     'text', 'global', false),
  ('escalation_severity',  'Escalation Severity',     'Issue / obstacle severity levels',                 'text', 'global', false)
ON CONFLICT (domain_key) DO NOTHING;

-- ── Seed: terms ───────────────────────────────────────────────────────────────
INSERT INTO roadmap.reference_term (domain_key, term_key, label, ordinal) VALUES
  -- proposal_maturity (migrated from roadmap.maturity table)
  ('proposal_maturity', 'new',      'New',      1),
  ('proposal_maturity', 'active',   'Active',   2),
  ('proposal_maturity', 'mature',   'Mature',   3),
  ('proposal_maturity', 'obsolete', 'Obsolete', 4),

  -- proposal_type
  ('proposal_type', 'product',   'Product',   1),
  ('proposal_type', 'component', 'Component', 2),
  ('proposal_type', 'feature',   'Feature',   3),
  ('proposal_type', 'issue',     'Issue',     4),
  ('proposal_type', 'directive', 'Directive', 5),

  -- dependency_type
  ('dependency_type', 'blocks',     'Blocks',     1),
  ('dependency_type', 'relates',    'Relates',    2),
  ('dependency_type', 'duplicates', 'Duplicates', 3),

  -- review_verdict
  ('review_verdict', 'approve',         'Approve',          1),
  ('review_verdict', 'request_changes', 'Request Changes',  2),
  ('review_verdict', 'reject',          'Reject',           3),

  -- proposal_decision
  ('proposal_decision', 'approved',  'Approved',  1),
  ('proposal_decision', 'rejected',  'Rejected',  2),
  ('proposal_decision', 'deferred',  'Deferred',  3),
  ('proposal_decision', 'escalated', 'Escalated', 4),

  -- agent_status
  ('agent_status', 'active',    'Active',    1),
  ('agent_status', 'inactive',  'Inactive',  2),
  ('agent_status', 'suspended', 'Suspended', 3),

  -- ac_status
  ('ac_status', 'pending', 'Pending', 1),
  ('ac_status', 'pass',    'Pass',    2),
  ('ac_status', 'fail',    'Fail',    3),
  ('ac_status', 'blocked', 'Blocked', 4),
  ('ac_status', 'waived',  'Waived',  5),

  -- gate_level
  ('gate_level', 'd1', 'D1', 1),
  ('gate_level', 'd2', 'D2', 2),
  ('gate_level', 'd3', 'D3', 3),
  ('gate_level', 'd4', 'D4', 4),

  -- proposal_state
  ('proposal_state', 'draft',    'Draft',    1),
  ('proposal_state', 'review',   'Review',   2),
  ('proposal_state', 'develop',  'Develop',  3),
  ('proposal_state', 'merge',    'Merge',    4),
  ('proposal_state', 'complete', 'Complete', 5),

  -- notification_surface
  ('notification_surface', 'tui',    'TUI',    1),
  ('notification_surface', 'web',    'Web',    2),
  ('notification_surface', 'mobile', 'Mobile', 3),

  -- run_status
  ('run_status', 'running',   'Running',   1),
  ('run_status', 'success',   'Success',   2),
  ('run_status', 'error',     'Error',     3),
  ('run_status', 'cancelled', 'Cancelled', 4),

  -- escalation_severity
  ('escalation_severity', 'low',      'Low',      1),
  ('escalation_severity', 'medium',   'Medium',   2),
  ('escalation_severity', 'high',     'High',     3),
  ('escalation_severity', 'critical', 'Critical', 4)
ON CONFLICT (domain_key, term_key) DO NOTHING;
