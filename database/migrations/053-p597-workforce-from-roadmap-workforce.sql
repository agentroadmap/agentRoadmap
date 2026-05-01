-- P597: Workforce backfill — copy persistent agent profile + capability matrix from
-- roadmap_workforce.* into the new workforce.* catalog (DDL: 006-workforce.sql).
--
-- Idempotent. Safe to re-run. Skips silently if the workforce schema does not
-- yet exist (DDL applied separately as part of the hiveCentral bootstrap, which
-- on the transition single-DB topology lands in this same database — see
-- CONVENTIONS §6.0). roadmap_workforce.* is NOT dropped: it remains
-- authoritative for runtime claim/lease/workload until P429.
--
-- Source columns verified against live schema (2026-04-27):
--   roadmap_workforce.agent_registry: id, agent_identity, agent_type, role, skills,
--     preferred_model, preferred_provider, status, github_handle, public_key,
--     trust_tier, agent_cli, api_spec, base_url, supported_models, agency_id, project_id
--     (NO `name`, NO `metadata` columns)
--   roadmap_workforce.agent_capability: id, agent_id, capability, proficiency,
--     verified_by, verified_at, notes, created_at
--     (NO `domain` column)

DO $migration$
DECLARE
  v_agent_count        INT := 0;
  v_skill_count        INT := 0;
  v_capability_count   INT := 0;
  v_workforce_present  BOOLEAN;
BEGIN
  -- Short-circuit if hiveCentral DDL has not been applied to this DB yet.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'workforce'
  ) INTO v_workforce_present;

  IF NOT v_workforce_present THEN
    RAISE NOTICE 'P597 backfill skipped: workforce schema not present (apply hiveCentral 006-workforce.sql first)';
    RETURN;
  END IF;

  -- Step 1 — agents from roadmap_workforce.agent_registry
  INSERT INTO workforce.agent (agent_identity, display_name, agent_type, status, metadata, owner_did)
  SELECT
    ar.agent_identity,
    ar.agent_identity                         AS display_name,    -- registry has no display_name
    CASE
      WHEN ar.agent_type IN ('ai','llm','agency') THEN 'ai'::workforce.agent_kind
      WHEN ar.agent_type = 'hybrid'                THEN 'hybrid'::workforce.agent_kind
      WHEN ar.agent_type = 'human'                 THEN 'human'::workforce.agent_kind
      ELSE                                              'ai'::workforce.agent_kind
    END                                       AS agent_type,
    CASE
      WHEN ar.status = 'active'    THEN 'active'::workforce.agent_status
      WHEN ar.status = 'suspended' THEN 'suspended'::workforce.agent_status
      ELSE                              'inactive'::workforce.agent_status
    END                                       AS status,
    jsonb_strip_nulls(jsonb_build_object(
      'preferred_model',     ar.preferred_model,
      'preferred_provider',  ar.preferred_provider,
      'api_spec',            ar.api_spec,
      'base_url',            ar.base_url,
      'agent_cli',           ar.agent_cli,
      'trust_tier',          ar.trust_tier,
      'github_handle',       ar.github_handle,
      'public_key',          ar.public_key,
      'legacy_role',         ar.role,
      'legacy_skills',       ar.skills,
      'source',              'roadmap_workforce.agent_registry'
    ))                                        AS metadata,
    'did:hive:system:workforce-backfill'      AS owner_did
  FROM roadmap_workforce.agent_registry ar
  WHERE ar.agent_identity IS NOT NULL
  ON CONFLICT (agent_identity) DO NOTHING;

  GET DIAGNOSTICS v_agent_count = ROW_COUNT;

  -- Step 2 — derive missing skill catalog rows from observed capabilities.
  -- We do NOT overwrite category/lifecycle if a curated row already exists.
  INSERT INTO workforce.skill (skill_name, display_name, category, lifecycle, owner_did, notes)
  SELECT
    ac.capability                              AS skill_name,
    initcap(replace(ac.capability, '-', ' ')) AS display_name,
    'engineering'                              AS category,        -- default; curate later via UPDATE
    'active'::workforce.skill_lifecycle        AS lifecycle,
    'did:hive:system:workforce-backfill'       AS owner_did,
    'Auto-derived from roadmap_workforce.agent_capability during P597 backfill' AS notes
  FROM (
    SELECT DISTINCT capability FROM roadmap_workforce.agent_capability WHERE capability IS NOT NULL
  ) ac
  ON CONFLICT (skill_name) DO NOTHING;

  GET DIAGNOSTICS v_skill_count = ROW_COUNT;

  -- Step 3 — capability matrix.
  -- Map proficiency INT(1-5) -> ENUM, drop ac.domain (does not exist),
  -- join via agent_identity (the only stable cross-schema key).
  INSERT INTO workforce.agent_skill (agent_id, skill_id, proficiency, granted_by, granted_at, notes)
  SELECT
    wa.id                                      AS agent_id,
    ws.id                                      AS skill_id,
    CASE
      WHEN ac.proficiency >= 5 THEN 'expert'::workforce.proficiency_level
      WHEN ac.proficiency = 4   THEN 'advanced'::workforce.proficiency_level
      WHEN ac.proficiency = 3   THEN 'intermediate'::workforce.proficiency_level
      WHEN ac.proficiency = 2   THEN 'basic'::workforce.proficiency_level
      ELSE                            'none'::workforce.proficiency_level
    END                                        AS proficiency,
    COALESCE(ac.verified_by, 'system')         AS granted_by,
    COALESCE(ac.verified_at, ac.created_at, now()) AS granted_at,
    ac.notes                                   AS notes
  FROM roadmap_workforce.agent_capability ac
  JOIN roadmap_workforce.agent_registry  ar ON ar.id = ac.agent_id
  JOIN workforce.agent                   wa ON wa.agent_identity = ar.agent_identity
  JOIN workforce.skill                   ws ON ws.skill_name      = ac.capability
  ON CONFLICT (agent_id, skill_id) DO NOTHING;

  GET DIAGNOSTICS v_capability_count = ROW_COUNT;

  RAISE NOTICE 'P597 backfill complete: % agents, % new skills, % capabilities',
    v_agent_count, v_skill_count, v_capability_count;
END
$migration$;

-- Verification queries (manual, do not gate the migration):
--   SELECT 'agent_registry'   AS src, COUNT(*) FROM roadmap_workforce.agent_registry
--   UNION ALL SELECT 'agent', COUNT(*) FROM workforce.agent
--   UNION ALL SELECT 'agent_capability', COUNT(*) FROM roadmap_workforce.agent_capability
--   UNION ALL SELECT 'agent_skill', COUNT(*) FROM workforce.agent_skill;
