-- P609: Per-(type × gate) agent profiles for the gating loop
-- All tables land in roadmap_proposal schema (consistent with proposal_type_config).
-- NO CONCURRENTLY: tables are empty at migration time and this runs inside a transaction.

-- ─── 2a. Gate-level reviewer profiles (D1-D4) ────────────────────────────────

CREATE TABLE IF NOT EXISTS roadmap_proposal.gate_role (
  id               bigserial PRIMARY KEY,
  proposal_type    text NOT NULL REFERENCES roadmap_proposal.proposal_type_config(type) ON DELETE CASCADE,
  gate             text NOT NULL CHECK (gate IN ('D1','D2','D3','D4')),
  role             text NOT NULL,
  persona          text NOT NULL,
  output_contract  text NOT NULL,
  model_preference text DEFAULT NULL,
  tool_allow_list  text[] DEFAULT NULL,
  fallback_role    text DEFAULT NULL,
  owner_did        text DEFAULT NULL,
  lifecycle_status text NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active','deprecated','retired')),
  deprecated_at    timestamptz DEFAULT NULL,
  retire_after     timestamptz DEFAULT NULL,
  notes            text DEFAULT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index: only one active row per (proposal_type, gate).
-- Allows deprecated+new row swap without constraint violation.
CREATE UNIQUE INDEX IF NOT EXISTS gate_role_active_unique
  ON roadmap_proposal.gate_role (proposal_type, gate)
  WHERE lifecycle_status = 'active';

-- ─── 2b. Stage-level enhancement profiles (DRAFT/REVIEW/DEVELOP/MERGE) ───────

CREATE TABLE IF NOT EXISTS roadmap_proposal.gate_stage_role (
  id               bigserial PRIMARY KEY,
  proposal_type    text NOT NULL REFERENCES roadmap_proposal.proposal_type_config(type) ON DELETE CASCADE,
  stage            text NOT NULL,
  role             text NOT NULL,
  persona          text NOT NULL,
  output_contract  text NOT NULL,
  model_preference text DEFAULT NULL,
  tool_allow_list  text[] DEFAULT NULL,
  fallback_role    text DEFAULT NULL,
  owner_did        text DEFAULT NULL,
  lifecycle_status text NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active','deprecated','retired')),
  deprecated_at    timestamptz DEFAULT NULL,
  retire_after     timestamptz DEFAULT NULL,
  notes            text DEFAULT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- gate_stage_role ships for schema completeness only — no seed, no dispatch wiring in P609.
CREATE UNIQUE INDEX IF NOT EXISTS gate_stage_role_active_unique
  ON roadmap_proposal.gate_stage_role (proposal_type, stage)
  WHERE lifecycle_status = 'active';

-- ─── 2c. Append-only audit history for gate_role ─────────────────────────────

CREATE TABLE IF NOT EXISTS roadmap_proposal.gate_role_history (
  id                   bigserial PRIMARY KEY,
  gate_role_id         bigint NOT NULL REFERENCES roadmap_proposal.gate_role(id) ON DELETE CASCADE,
  changed_at           timestamptz NOT NULL DEFAULT now(),
  changed_by           text,
  old_persona          text,
  old_output_contract  text,
  old_model_preference text,
  old_tool_allow_list  text[],
  old_lifecycle_status text,
  change_note          text
);

-- ─── 2d. Audit trigger — captures old values before each UPDATE ───────────────

CREATE OR REPLACE FUNCTION roadmap_proposal.fn_gate_role_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO roadmap_proposal.gate_role_history (
    gate_role_id, changed_by,
    old_persona, old_output_contract, old_model_preference,
    old_tool_allow_list, old_lifecycle_status
  ) VALUES (
    OLD.id, current_user,
    OLD.persona, OLD.output_contract, OLD.model_preference,
    OLD.tool_allow_list, OLD.lifecycle_status
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gate_role_audit_trigger ON roadmap_proposal.gate_role;
CREATE TRIGGER gate_role_audit_trigger
  BEFORE UPDATE ON roadmap_proposal.gate_role
  FOR EACH ROW EXECUTE FUNCTION roadmap_proposal.fn_gate_role_audit();

-- ─── 2e. NOTIFY trigger — invalidates resolver TTL cache ─────────────────────

CREATE OR REPLACE FUNCTION roadmap_proposal.fn_gate_role_notify()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('gate_role_changed',
    json_build_object(
      'proposal_type', NEW.proposal_type,
      'gate', NEW.gate,
      'id', NEW.id
    )::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gate_role_notify_trigger ON roadmap_proposal.gate_role;
CREATE TRIGGER gate_role_notify_trigger
  AFTER INSERT OR UPDATE ON roadmap_proposal.gate_role
  FOR EACH ROW EXECUTE FUNCTION roadmap_proposal.fn_gate_role_notify();

-- gate_stage_role audit/history/notify triggers are explicitly deferred to the
-- follow-on proposal that wires gate_stage_role dispatch into the orchestrator.
