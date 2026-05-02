-- P526: Cubic budget enforcement policy metadata.
-- Adds a durable JSONB policy extension point used by cubic_create:
--   metadata->>'max_active_cubics_per_host'

ALTER TABLE roadmap.host_model_policy
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN roadmap.host_model_policy.metadata IS
  'P526/P742 host policy extension metadata. P526 reads max_active_cubics_per_host here; absent or invalid values default safely in code.';
