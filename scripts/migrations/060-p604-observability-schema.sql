-- 060-p604-observability-schema.sql
-- P604: Observability schema — spans, lifecycle events, routing, explainability
--
-- Migration 058 is reserved for P495 (file 058-p495-tenant-saga-bootstrap.sql not yet committed).
-- Migration 059 is 059-p611-gate-decision-auto-advance.sql (committed).
-- P472 has no migration file; no principal_identity table exists in DB as of this migration.
-- The service_did CHECK pattern mirrors P472 principal_kind values by value only — no FK dependency.
-- Preflight: FK target tables (model_routes, model_metadata, project, spawn_briefing) must exist.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='roadmap' AND table_name='model_routes') THEN
    RAISE EXCEPTION 'Prerequisite missing: roadmap.model_routes (migration 025)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='roadmap' AND table_name='model_metadata') THEN
    RAISE EXCEPTION 'Prerequisite missing: roadmap.model_metadata';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='roadmap' AND table_name='project') THEN
    RAISE EXCEPTION 'Prerequisite missing: roadmap.project (migration 050)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='roadmap' AND table_name='spawn_briefing') THEN
    RAISE EXCEPTION 'Prerequisite missing: roadmap.spawn_briefing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='roadmap_proposal' AND table_name='proposal') THEN
    RAISE EXCEPTION 'Prerequisite missing: roadmap_proposal.proposal (trigger target)';
  END IF;
END;
$$;

-- ─── trace_span ───────────────────────────────────────────────────────────────
-- Plain unpartitioned table. Range partitioning deferred: self-referential
-- parent_span_id FK cannot span partition boundaries in PostgreSQL.
-- Retention via DELETE (not DROP PARTITION); see AC-5.
-- service_did enforced exclusively by DB-level CHECK (sole enforcement path).

CREATE TABLE IF NOT EXISTS roadmap.trace_span (
  span_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id           UUID NOT NULL,
  parent_span_id     UUID REFERENCES roadmap.trace_span(span_id),
  operation          TEXT NOT NULL,
  service_did        TEXT NOT NULL,
    CONSTRAINT trace_span_service_did_check
      CHECK (service_did ~ '^(agent|agency|operator):'),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at           TIMESTAMPTZ,
  attributes         JSONB NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'ok',
    CONSTRAINT trace_span_status_check CHECK (status IN ('ok','error','cancelled')),
  error_message      TEXT
);

-- ─── agent_execution_span ────────────────────────────────────────────────────
-- agent_id = roadmap.agent_runs.id (per-execution instance, NOT agent_registry.id).
-- No FK on agent_id — intentional to avoid coupling to agent_runs schema evolution.
-- model_name TEXT (denormalised); route_id is the authoritative FK for route identity.

CREATE TABLE IF NOT EXISTS roadmap.agent_execution_span (
  span_id            UUID PRIMARY KEY REFERENCES roadmap.trace_span(span_id) ON DELETE CASCADE,
  agency_id          TEXT NOT NULL,
  agent_id           BIGINT NOT NULL,
  proposal_id        BIGINT,
  project_id         BIGINT REFERENCES roadmap.project(project_id) ON DELETE SET NULL,
  model_name         TEXT,
  route_id           BIGINT REFERENCES roadmap.model_routes(id) ON DELETE SET NULL,
  input_tokens       INT,
  output_tokens      INT,
  cost_usd           NUMERIC(12,8),
  briefing_id        UUID REFERENCES roadmap.spawn_briefing(briefing_id) ON DELETE SET NULL
);

-- ─── proposal_lifecycle_event ─────────────────────────────────────────────────
-- Retained indefinitely (governance/audit record). No DELETE grant issued.
-- Populated by trg_proposal_lifecycle_event (below); do not write directly.

CREATE TABLE IF NOT EXISTS roadmap.proposal_lifecycle_event (
  event_id           BIGSERIAL PRIMARY KEY,
  project_id         BIGINT REFERENCES roadmap.project(project_id) ON DELETE SET NULL,
  proposal_display_id TEXT NOT NULL,
  from_state         TEXT,
  to_state           TEXT NOT NULL,
  from_maturity      TEXT,
  to_maturity        TEXT NOT NULL,
  triggered_by_did   TEXT NOT NULL,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  context            JSONB NOT NULL DEFAULT '{}'
);

CREATE OR REPLACE FUNCTION roadmap.fn_proposal_lifecycle_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO roadmap.proposal_lifecycle_event (
    project_id, proposal_display_id, from_state, to_state,
    from_maturity, to_maturity, triggered_by_did, context
  ) VALUES (
    NEW.project_id, NEW.display_id, OLD.status, NEW.status,
    OLD.maturity, NEW.maturity,
    COALESCE(
      NULLIF(current_setting('app.agent_did', true), ''),
      NULLIF(current_setting('app.agent_identity', true), ''),
      'system'
    ),
    jsonb_build_object('source', 'trg_proposal_lifecycle_event')
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_proposal_lifecycle_event ON roadmap_proposal.proposal;
CREATE TRIGGER trg_proposal_lifecycle_event
  AFTER UPDATE OF status, maturity ON roadmap_proposal.proposal
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.maturity IS DISTINCT FROM NEW.maturity)
  EXECUTE FUNCTION roadmap.fn_proposal_lifecycle_event();

-- ─── model_routing_outcome ────────────────────────────────────────────────────
-- trace_id intentionally not FK-constrained — traces may originate from external systems.
-- Retained indefinitely (governance record). No DELETE grant issued.

CREATE TABLE IF NOT EXISTS roadmap.model_routing_outcome (
  outcome_id         BIGSERIAL PRIMARY KEY,
  trace_id           UUID NOT NULL,
  selected_route_id  BIGINT NOT NULL REFERENCES roadmap.model_routes(id) ON DELETE RESTRICT,
  candidate_routes   JSONB NOT NULL,
  selection_reason   TEXT NOT NULL,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── decision_explainability ──────────────────────────────────────────────────
-- trace_id intentionally not FK-constrained — traces may originate from external systems.
-- ruleset_id supports replay (P607). Retained indefinitely. No DELETE grant issued.

CREATE TABLE IF NOT EXISTS roadmap.decision_explainability (
  decision_id        BIGSERIAL PRIMARY KEY,
  trace_id           UUID NOT NULL,
  decision_kind      TEXT NOT NULL,
    CONSTRAINT de_kind_check CHECK (decision_kind IN ('gate_advance','agent_assignment','budget_block','grant_check')),
  inputs             JSONB NOT NULL,
  rules_evaluated    JSONB NOT NULL,
  outcome            JSONB NOT NULL,
  ruleset_id         TEXT,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes (17 explicit) ────────────────────────────────────────────────────

-- trace_span (4)
CREATE INDEX IF NOT EXISTS idx_trace_span_trace_id       ON roadmap.trace_span(trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_span_started_at     ON roadmap.trace_span(started_at);
CREATE INDEX IF NOT EXISTS idx_trace_span_parent_span_id ON roadmap.trace_span(parent_span_id) WHERE parent_span_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trace_span_status_err     ON roadmap.trace_span(status) WHERE status != 'ok';

-- agent_execution_span (6)
CREATE INDEX IF NOT EXISTS idx_aes_proposal  ON roadmap.agent_execution_span(proposal_id);
CREATE INDEX IF NOT EXISTS idx_aes_agency    ON roadmap.agent_execution_span(agency_id);
CREATE INDEX IF NOT EXISTS idx_aes_route     ON roadmap.agent_execution_span(route_id);
CREATE INDEX IF NOT EXISTS idx_aes_project   ON roadmap.agent_execution_span(project_id);
CREATE INDEX IF NOT EXISTS idx_aes_briefing  ON roadmap.agent_execution_span(briefing_id);
CREATE INDEX IF NOT EXISTS idx_aes_agent_id  ON roadmap.agent_execution_span(agent_id);

-- proposal_lifecycle_event (3)
CREATE INDEX IF NOT EXISTS idx_ple_display_id  ON roadmap.proposal_lifecycle_event(proposal_display_id);
CREATE INDEX IF NOT EXISTS idx_ple_project     ON roadmap.proposal_lifecycle_event(project_id);
CREATE INDEX IF NOT EXISTS idx_ple_occurred_at ON roadmap.proposal_lifecycle_event(occurred_at);

-- model_routing_outcome (2)
CREATE INDEX IF NOT EXISTS idx_mro_trace_id ON roadmap.model_routing_outcome(trace_id);
CREATE INDEX IF NOT EXISTS idx_mro_route    ON roadmap.model_routing_outcome(selected_route_id);

-- decision_explainability (2)
CREATE INDEX IF NOT EXISTS idx_de_trace ON roadmap.decision_explainability(trace_id);
CREATE INDEX IF NOT EXISTS idx_de_kind  ON roadmap.decision_explainability(decision_kind);

-- ─── Role grants ──────────────────────────────────────────────────────────────
-- Role hierarchy (migration 022): admin_write ⊃ agent_write ⊃ agent_read; roadmap_agent is base group.

-- trace_span: SELECT+INSERT for telemetry; column UPDATE for span-close; DELETE for retention cron
GRANT SELECT, INSERT ON roadmap.trace_span TO roadmap_agent;
GRANT UPDATE (ended_at, status, error_message) ON roadmap.trace_span TO roadmap_agent;
GRANT DELETE ON roadmap.trace_span TO admin_write;

-- agent_execution_span: SELECT+INSERT; DELETE for retention cron
GRANT SELECT, INSERT ON roadmap.agent_execution_span TO roadmap_agent;
GRANT DELETE ON roadmap.agent_execution_span TO admin_write;

-- proposal_lifecycle_event: retained indefinitely — no DELETE grant
GRANT SELECT, INSERT ON roadmap.proposal_lifecycle_event TO roadmap_agent;
GRANT USAGE ON SEQUENCE roadmap.proposal_lifecycle_event_event_id_seq TO roadmap_agent;

-- model_routing_outcome: retained indefinitely — no DELETE grant
GRANT SELECT, INSERT ON roadmap.model_routing_outcome TO roadmap_agent;
GRANT USAGE ON SEQUENCE roadmap.model_routing_outcome_outcome_id_seq TO roadmap_agent;

-- decision_explainability: retained indefinitely — no DELETE grant
GRANT SELECT, INSERT ON roadmap.decision_explainability TO roadmap_agent;
GRANT USAGE ON SEQUENCE roadmap.decision_explainability_decision_id_seq TO roadmap_agent;
