-- P309: Clean up blocked dispatches from 10hr dispatch loop (2026-04-19/20)
-- 2961 dispatches with dispatch_status='blocked' from implicit maturity gate (P240)
-- dispatching copilot-one to host bot. Host policy rejects route_provider=github,
-- so every dispatch failed with SpawnPolicyViolation. Loop ran ~10 hours.
-- Affected: P289(936), P290(1012), P291(1012), P297(1).
--
-- These have completed_at set but dispatch_status='blocked', so the stale reaper (P269)
-- never cleans them (it only reaps WHERE completed_at IS NULL).
--
-- This migration cancels them all and tags metadata for audit.

UPDATE roadmap_workforce.squad_dispatch
SET dispatch_status = 'cancelled',
    metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object(
            'cleaned_at', to_jsonb(now()),
            'cleaned_reason', 'P309: 10hr dispatch loop blocked cleanup (SpawnPolicyViolation)'
        )
WHERE dispatch_status = 'blocked';
