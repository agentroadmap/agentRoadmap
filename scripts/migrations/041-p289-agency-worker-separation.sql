-- P289: Agency/Worker Identity Separation
--
-- Problem: P281's OfferProvider conflates agency (registered, long-lived) with
-- worker (ephemeral, spawned). The agency claims under its own identity, spawns
-- an agent, but the spawned agent has no identity in the dispatch record.
--
-- Fix:
--   1. Add worker_identity to squad_dispatch (the spawned agent's identity)
--   2. Add agency_id FK on agent_registry (worker → parent agency)
--   3. provider_registry table (agency opt-in per project/squad)
--   4. fn_activate_work_offer accepts worker_identity
--   5. Workers self-register on spawn

BEGIN;

-- (1) worker_identity: the spawned agent doing the actual work.
--     NULL until activation (agency hasn't spawned yet).
ALTER TABLE roadmap_workforce.squad_dispatch
  ADD COLUMN IF NOT EXISTS worker_identity TEXT;

-- (2) agency_id: workers reference their parent agency.
--     NULL for agencies themselves and standalone agents.
ALTER TABLE roadmap_workforce.agent_registry
  ADD COLUMN IF NOT EXISTS agency_id BIGINT REFERENCES roadmap_workforce.agent_registry(id);

-- (3) provider_registry: agency opt-in per project/squad with capabilities.
--     Replaces implicit routing — agencies declare what they can handle.
CREATE TABLE IF NOT EXISTS roadmap_workforce.provider_registry (
  id            BIGSERIAL PRIMARY KEY,
  agency_id     BIGINT NOT NULL REFERENCES roadmap_workforce.agent_registry(id),
  project_id    TEXT,                    -- NULL = all projects
  squad_name    TEXT,                    -- NULL = all squads
  capabilities  JSONB NOT NULL DEFAULT '{}',  -- {"all": ["filesystem", "code-review"]}
  is_active     BOOLEAN NOT NULL DEFAULT true,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One registration per agency+project+squad combo
  UNIQUE (agency_id, project_id, squad_name)
);

CREATE INDEX idx_provider_registry_active
  ON roadmap_workforce.provider_registry (is_active, project_id, squad_name);

-- (4) fn_activate_work_offer: accept worker_identity.
--     Old signature: (dispatch_id, agent_identity, claim_token)
--     New signature: (dispatch_id, agent_identity, claim_token, worker_identity)
--     We add worker_identity as optional 4th param (NULL = backward compat).

CREATE OR REPLACE FUNCTION roadmap_workforce.fn_activate_work_offer(
  p_dispatch_id BIGINT,
  p_agent_identity TEXT,
  p_claim_token UUID,
  p_worker_identity TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_updated INT;
BEGIN
  UPDATE roadmap_workforce.squad_dispatch
  SET offer_status = 'active',
      dispatch_status = 'active',
      last_renewed_at = now(),
      worker_identity = COALESCE(p_worker_identity, worker_identity)
  WHERE id = p_dispatch_id
    AND agent_identity = p_agent_identity
    AND claim_token = p_claim_token
    AND offer_status IN ('claimed','active');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$fn$;

-- (5) fn_register_worker: self-registration for spawned agents.
--     Called by the spawned worker (or its agency on its behalf).
--     Creates a registry entry linked to the agency.
CREATE OR REPLACE FUNCTION roadmap_workforce.fn_register_worker(
  p_worker_identity TEXT,
  p_agency_identity TEXT,
  p_agent_type TEXT DEFAULT 'workforce',
  p_skills JSONB DEFAULT '{}',
  p_preferred_model TEXT DEFAULT NULL,
  p_preferred_provider TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_agency_id BIGINT;
  v_worker_id BIGINT;
BEGIN
  -- Look up agency
  SELECT id INTO v_agency_id
  FROM roadmap_workforce.agent_registry
  WHERE agent_identity = p_agency_identity;

  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'unknown agency_identity %', p_agency_identity
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Upsert worker
  INSERT INTO roadmap_workforce.agent_registry (
    agent_identity, agent_type, skills, preferred_model,
    preferred_provider, status, agency_id
  ) VALUES (
    p_worker_identity, p_agent_type, p_skills, p_preferred_model,
    p_preferred_provider, 'active', v_agency_id
  )
  ON CONFLICT (agent_identity) DO UPDATE SET
    skills = EXCLUDED.skills,
    preferred_model = EXCLUDED.preferred_model,
    preferred_provider = EXCLUDED.preferred_provider,
    status = 'active',
    agency_id = v_agency_id,
    updated_at = now()
  RETURNING id INTO v_worker_id;

  RETURN v_worker_id;
END;
$fn$;

-- (6) fn_claim_work_offer: allow agencies (or their workers) to claim.
--     No change needed — agencies claim under their own identity.
--     Workers don't claim; they're spawned by the claiming agency.

COMMIT;
