-- Seed AC items for P070-P072 (corrected column: criterion_text)
-- IDs: P070=88, P071=89, P072=90

BEGIN;

-- P070 AC items
INSERT INTO proposal_acceptance_criteria (proposal_id, item_number, criterion_text, status) VALUES
(88, 1, 'Typed dependency types (interface, build, unit_test, integration, runtime) added to schema', 'pending'),
(88, 2, 'SMDL transition gating supports per-type dependency checks (not binary block-all)', 'pending'),
(88, 3, 'Interface dependencies allow parallel Draft/Review work while downstream proposes', 'pending'),
(88, 4, 'Integration dependencies correctly block MERGE until upstream is ready', 'pending'),
(88, 5, 'Runtime dependencies correctly block COMPLETE until service deployed and live', 'pending'),
(88, 6, 'Maturity model (New→Active→Mature→Obsolete) integrated with dependency gating', 'pending'),
(88, 7, 'Existing proposals without explicit dependency type default to "build" for backwards compat', 'pending')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- P071 AC items
INSERT INTO proposal_acceptance_criteria (proposal_id, item_number, criterion_text, status) VALUES
(89, 1, 'dependency_type column added to proposal_dependencies with enum (interface|build|unit_test|integration|runtime)', 'pending'),
(89, 2, 'SMDL DSL grammar extended to support typed dependency declarations', 'pending'),
(89, 3, 'Per-transition gating configuration evaluates only relevant dependency types', 'pending'),
(89, 4, 'Interface deps allow downstream to proceed through Draft/Review phases', 'pending'),
(89, 5, 'Build deps block Develop phase until upstream code available', 'pending'),
(89, 6, 'Integration deps block Merge phase until upstream integration target ready', 'pending')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- P072 AC items
INSERT INTO proposal_acceptance_criteria (proposal_id, item_number, criterion_text, status) VALUES
(90, 1, 'Agent memory store API supports CRUD operations with agent_id isolation', 'pending'),
(90, 2, 'Memory refresh mechanism with configurable TTL handles stale entry expiration', 'pending'),
(90, 3, 'Automated memory cleanup routine runs on schedule or triggers on-demand', 'pending'),
(90, 4, 'Memory lifecycle tracked with timestamps (created_at, refreshed_at, expired_at)', 'pending'),
(90, 5, 'No cross-agent memory leakage — queries scoped by agent_id', 'pending'),
(90, 6, 'Memory vector index rebuilds automatically after bulk insert or cleanup', 'pending'),
(90, 7, 'Memory usage metrics tracked for per-agent quota monitoring', 'pending')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

COMMIT;

SELECT display_id, COUNT(*) as ac_items
FROM proposal p
JOIN proposal_acceptance_criteria pac ON pac.proposal_id = p.id
WHERE p.display_id IN ('P070','P071','P072')
GROUP BY p.display_id
ORDER BY p.display_id;
EOF