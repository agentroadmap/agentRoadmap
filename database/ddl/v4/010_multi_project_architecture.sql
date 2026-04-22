-- P300: Multi-project architecture
-- Phase 1a: Extend projects table, add proposal.project_id, update fn_claim_work_offer

BEGIN;

-- 1. Extend roadmap_workforce.projects with multi-project columns
ALTER TABLE roadmap_workforce.projects
  ADD COLUMN IF NOT EXISTS db_name TEXT NOT NULL DEFAULT 'agenthive',
  ADD COLUMN IF NOT EXISTS git_root TEXT NOT NULL DEFAULT '/data/code/AgentHive',
  ADD COLUMN IF NOT EXISTS discord_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS db_host TEXT NOT NULL DEFAULT '127.0.0.1',
  ADD COLUMN IF NOT EXISTS db_port INT NOT NULL DEFAULT 5432,
  ADD COLUMN IF NOT EXISTS db_user TEXT NOT NULL DEFAULT 'xiaomi';

-- 2. Add project_id to proposal table (default to project 1 = agenthive)
ALTER TABLE roadmap_proposal.proposal
  ADD COLUMN IF NOT EXISTS project_id INT8
    REFERENCES roadmap_workforce.projects(id) DEFAULT 1;

-- Backfill all existing proposals to project_id = 1
UPDATE roadmap_proposal.proposal SET project_id = 1 WHERE project_id IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE roadmap_proposal.proposal
  ALTER COLUMN project_id SET NOT NULL;

-- 3. Ensure squad_dispatch.project_id is populated on new dispatches
-- (column already exists per schema discovery, but may be nullable)
-- Add index for project-scoped queries
CREATE INDEX IF NOT EXISTS idx_squad_dispatch_project_offer
  ON roadmap_workforce.squad_dispatch(project_id, offer_status)
  WHERE offer_status = 'open';

-- 4. Update fn_claim_work_offer to add project scoping
-- New signature: fn_claim_work_offer(p_agent_identity, p_required_capabilities, p_lease_ttl_seconds, p_project_id)
-- p_project_id DEFAULT NULL: when NULL, filter by agency's subscribed projects via provider_registry
-- when set, filter to that specific project only

-- Drop old 3-param overload (signature changed, PG creates overload otherwise)
DROP FUNCTION IF EXISTS roadmap_workforce.fn_claim_work_offer(text, jsonb, int);

CREATE OR REPLACE FUNCTION roadmap_workforce.fn_claim_work_offer(
  p_agent_identity TEXT,
  p_required_capabilities JSONB DEFAULT '{}'::jsonb,
  p_lease_ttl_seconds INT DEFAULT 20,
  p_project_id INT8 DEFAULT NULL
)
RETURNS TABLE (
  dispatch_id BIGINT,
  proposal_id BIGINT,
  squad_name TEXT,
  dispatch_role TEXT,
  claim_token UUID,
  claim_expires_at TIMESTAMPTZ,
  offer_version INT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_picked_id BIGINT;
  v_new_token UUID := gen_random_uuid();
  v_expires TIMESTAMPTZ := now() + make_interval(secs => p_lease_ttl_seconds);
  v_agency_id BIGINT;
BEGIN
  -- Verify caller is a registered agent
  IF NOT EXISTS (
    SELECT 1 FROM roadmap_workforce.agent_registry
    WHERE agent_identity = p_agent_identity
  ) THEN
    RAISE EXCEPTION 'unknown agent_identity %', p_agent_identity
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Get agency_id for project scoping
  SELECT ar.id INTO v_agency_id
  FROM roadmap_workforce.agent_registry ar
  WHERE ar.agent_identity = p_agent_identity;

  -- Pick one open offer whose required_capabilities are satisfied by this
  -- agent's agent_capability rows, scoped to projects the agency has joined.
  -- SKIP LOCKED lets concurrent claimers race without blocking.
  WITH agent_caps AS (
    SELECT ac.capability
    FROM roadmap_workforce.agent_capability ac
    JOIN roadmap_workforce.agent_registry ar ON ar.id = ac.agent_id
    WHERE ar.agent_identity = p_agent_identity
  ),
  agency_projects AS (
    -- Projects this agency has joined (via provider_registry)
    SELECT pr.project_id
    FROM roadmap_workforce.provider_registry pr
    WHERE pr.agency_id = v_agency_id
      AND pr.is_active = true
    UNION
    -- If no project filter, allow all projects (backward compat)
    SELECT id FROM roadmap_workforce.projects
    WHERE p_project_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM roadmap_workforce.provider_registry pr2
        WHERE pr2.agency_id = v_agency_id AND pr2.is_active = true
      )
  ),
  candidate AS (
    SELECT sd.id
    FROM roadmap_workforce.squad_dispatch sd
    WHERE sd.offer_status = 'open'
      -- Project scoping: either specific project or agency's subscribed projects
      AND (
        (p_project_id IS NOT NULL AND sd.project_id = p_project_id)
        OR (p_project_id IS NULL AND sd.project_id IN (SELECT project_id FROM agency_projects))
      )
      -- Capability matching (unchanged)
      AND (
        sd.required_capabilities = '{}'::jsonb
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            COALESCE(sd.required_capabilities -> 'all', '[]'::jsonb)
          ) req(cap)
          WHERE req.cap NOT IN (SELECT capability FROM agent_caps)
        )
      )
    ORDER BY sd.assigned_at ASC
    FOR UPDATE OF sd SKIP LOCKED
    LIMIT 1
  )
  SELECT id INTO v_picked_id FROM candidate;

  IF v_picked_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE roadmap_workforce.squad_dispatch sd
  SET offer_status = 'claimed',
      agent_identity = p_agent_identity,
      claim_token = v_new_token,
      claim_expires_at = v_expires,
      claimed_at = now(),
      last_renewed_at = now(),
      offer_version = sd.offer_version + 1
  WHERE sd.id = v_picked_id;

  RETURN QUERY
  SELECT sd.id, sd.proposal_id, sd.squad_name, sd.dispatch_role,
         sd.claim_token, sd.claim_expires_at, sd.offer_version, sd.metadata
  FROM roadmap_workforce.squad_dispatch sd
  WHERE sd.id = v_picked_id;
END;
$function$;

-- 5. Create index on proposal.project_id for project-scoped queries
CREATE INDEX IF NOT EXISTS idx_proposal_project_id
  ON roadmap_proposal.proposal(project_id);

COMMIT;
