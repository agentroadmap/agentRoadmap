-- =============================================
-- Seed P070-P072 audit trail + Acceptance Criteria
-- 2026-04-05 13:15 EDT - Andy (executed by Carter)
-- Run with: docker exec -i postgres-db psql -U admin -d agenthive < seed-p070-072-complete.sql
-- =============================================

BEGIN;

-- 1. State transitions audit trail (initial PROPOSAL creation)
INSERT INTO proposal_state_transitions (proposal_id, from_state, to_state, transitioned_at, reason, performed_by)
SELECT id, NULL, 'PROPOSAL', NOW(), 'Initial proposal creation', 'system'
FROM proposal
WHERE display_id IN ('P070', 'P071', 'P072')
  AND NOT EXISTS (
    SELECT 1 FROM proposal_state_transitions pst
    WHERE pst.proposal_id = proposal.id AND pst.to_state = 'PROPOSAL'
  );

-- 2. Acceptance Criteria - P070: Dependency-Gated State Transitions via Maturity
-- Based on proposal spec: typed dependency gating for maturity-based transitions
INSERT INTO proposal_acceptance_criteria (proposal_id, item_number, criterion, status)
SELECT p.id, v.n, v.criterion, 'pending'
FROM proposal p, (VALUES
  (1, 'Typed dependency types (interface, build, unit_test, integration, runtime) added to schema with valid constraints'),
  (2, 'SMDL transition gating supports per-type dependency checks (not binary block-all)'),
  (3, 'Interface dependencies allow parallel Draft/Review work while downstream proposes'),
  (4, 'Integration dependencies correctly block MERGE transition until upstream is ready'),
  (5, 'Runtime dependencies correctly block COMPLETE until service is deployed and live'),
  (6, 'Maturity model (New→Active→Mature→Obsolete) integrated with dependency gating'),
  (7, 'Existing proposals with no explicit dependency type default to "build" for backwards compatibility')
) AS v(n, criterion)
WHERE p.display_id = 'P070'
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- 3. Acceptance Criteria - P071: Typed Dependencies in SMDL
-- Based on proposal spec: extend proposal_dependencies with typed dependency edges
INSERT INTO proposal_acceptance_criteria (proposal_id, item_number, criterion, status)
SELECT p.id, v.n, v.criterion, 'pending'
FROM proposal p, (VALUES
  (1, 'dependency_type column added to proposal_dependencies with enum constraint (interface, build, unit_test, integration, runtime)'),
  (2, 'SMDL DSL grammar extended to support typed dependency declarations'),
  (3, 'Per-transition gating configuration evaluates only relevant dependency types'),
  (4, 'Interface dependencies allow downstream proposals to proceed through Draft/Review phases'),
  (5, 'Build dependencies block Develop phase until upstream code is available'),
  (6, 'Integration dependencies block Merge phase until upstream integration target is ready')
) AS v(n, criterion)
WHERE p.display_id = 'P071'
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- 4. Acceptance Criteria - P072: Agent Memory Lifecycle
-- Based on proposal spec: store, refresh, cleanup mechanisms for agent memory
INSERT INTO proposal_acceptance_criteria (proposal_id, item_number, criterion, status)
SELECT p.id, v.n, v.criterion, 'pending'
FROM proposal p, (VALUES
  (1, 'Agent memory store API supports CRUD operations with agent_id isolation'),
  (2, 'Memory refresh mechanism with configurable TTL handles stale entry expiration'),
  (3, 'Automated memory cleanup routine runs on schedule or triggers on-demand'),
  (4, 'Memory lifecycle tracked with timestamps (created_at, refreshed_at, expired_at)'),
  (5, 'No cross-agent memory leakage — queries scoped by agent_id'),
  (6, 'Memory vector index rebuilds automatically after bulk insert or cleanup'),
  (7, 'Memory usage metrics tracked for per-agent quota monitoring')
) AS v(n, criterion)
WHERE p.display_id = 'P072'
ON CONFLICT (proposal_id, item_number) DO NOTHING;

COMMIT;

-- Verify
SELECT display_id, COUNT(*) AS ac_count
FROM proposal p
JOIN proposal_acceptance_criteria pac ON pac.proposal_id = p.id
WHERE p.display_id IN ('P070', 'P071', 'P072')
GROUP BY p.display_id
ORDER BY p.display_id;
