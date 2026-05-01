-- ============================================================
-- PM GATING SCRIPT — 2026-05-01
-- Author: product-manager (Alex)
-- Purpose: Advance DRAFT/mature → REVIEW and REVIEW → DEVELOP
-- Schema: roadmap_proposal.proposal | roadmap.gate_decision_log
--
-- Run with:
--   PGPASSWORD=YMA3peHGLi6shUTr psql -h 127.0.0.1 -p 5432 \
--     -U admin -d agenthive -f scripts/pm-gate-2026-05-01.sql
--
-- NOTE on gate_decision_log FK:
--   018-gate-decision-audit.sql defines:
--     FOREIGN KEY (proposal_id) REFERENCES roadmap.proposal (id)
--   The actual proposal table is roadmap_proposal.proposal.
--   If roadmap.proposal is a view (likely from schema migration), IDs match.
--   If the FK was never created (DDL error), INSERTs below work without issue.
--   If the FK exists and roadmap.proposal does NOT exist as a view, the INSERT
--   will fail with FK violation — fix by running:
--     CREATE OR REPLACE VIEW roadmap.proposal AS
--       SELECT * FROM roadmap_proposal.proposal;
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────
-- FK DIAGNOSTIC: check if roadmap.proposal view exists
-- ────────────────────────────────────────────
\echo '=== FK DIAGNOSTIC: roadmap.proposal view/table presence ==='
SELECT
    n.nspname AS schema,
    c.relname AS name,
    CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' ELSE c.relkind::text END AS kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'roadmap' AND c.relname = 'proposal';

-- ────────────────────────────────────────────────────────────────────────────
-- SAFETY: If roadmap.proposal view doesn't exist, create it now so the FK
-- on gate_decision_log can resolve. This is idempotent (CREATE OR REPLACE).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW roadmap.proposal AS
    SELECT * FROM roadmap_proposal.proposal;

-- ────────────────────────────────────────────
-- DIAGNOSTIC: Show current state before gating
-- ────────────────────────────────────────────
\echo '=== PRE-GATE STATUS ==='
SELECT status, maturity, COUNT(*) AS cnt
FROM roadmap_proposal.proposal
WHERE UPPER(status) IN ('DRAFT','REVIEW','DEVELOP')
GROUP BY status, maturity
ORDER BY status, maturity;

\echo ''
\echo '=== DRAFT/mature proposals to evaluate ==='
SELECT id, display_id, title,
       LENGTH(motivation) > 0 AS has_motivation,
       LENGTH(COALESCE(design,'')) > 50 AS has_design,
       LENGTH(COALESCE(alternatives,'')) > 20 AS has_alternatives,
       (SELECT COUNT(*) FROM roadmap_proposal.proposal_acceptance_criteria pac
        WHERE pac.proposal_id = p.id) AS ac_count
FROM roadmap_proposal.proposal p
WHERE UPPER(status) = 'DRAFT' AND maturity = 'mature'
ORDER BY id;

\echo ''
\echo '=== REVIEW proposals to evaluate ==='
SELECT id, display_id, title,
       LENGTH(COALESCE(motivation,'')) > 0 AS has_motivation,
       LENGTH(COALESCE(design,'')) > 50 AS has_design,
       (SELECT COUNT(*) FROM roadmap_proposal.proposal_acceptance_criteria pac
        WHERE pac.proposal_id = p.id) AS ac_count
FROM roadmap_proposal.proposal p
WHERE UPPER(status) = 'REVIEW'
ORDER BY id;

-- ────────────────────────────────────────────────────────────
-- PRIORITY 1: DRAFT/mature → REVIEW
-- Gate D1: motivation + design + ACs required
-- ────────────────────────────────────────────────────────────
\echo ''
\echo '=== GATING: DRAFT/mature → REVIEW (D1) ==='

-- ADVANCE: proposals with motivation, design, and at least 1 AC
-- Log gate decisions first
INSERT INTO roadmap.gate_decision_log
    (proposal_id, from_state, to_state, gate_level, decided_by, decision, rationale)
SELECT
    p.id,
    'DRAFT',
    'REVIEW',
    'D1',
    'product-manager',
    'approve',
    'Enhancement complete. Motivation, design, and acceptance criteria all present. ' ||
    'Proposal has ' || ac_counts.n || ' AC(s). Advancing to REVIEW for design scrutiny.'
FROM roadmap_proposal.proposal p
JOIN (
    SELECT proposal_id, COUNT(*) AS n
    FROM roadmap_proposal.proposal_acceptance_criteria
    GROUP BY proposal_id
) ac_counts ON ac_counts.proposal_id = p.id
WHERE UPPER(p.status) = 'DRAFT'
  AND p.maturity = 'mature'
  AND p.motivation IS NOT NULL AND LENGTH(p.motivation) > 20
  AND p.design IS NOT NULL AND LENGTH(p.design) > 50
  AND ac_counts.n >= 1;

-- Report how many were approved
\echo 'Approved for REVIEW advance:'
SELECT COUNT(*) FROM roadmap_proposal.proposal p
JOIN (SELECT proposal_id FROM roadmap_proposal.proposal_acceptance_criteria GROUP BY proposal_id HAVING COUNT(*) >= 1) ac ON ac.proposal_id = p.id
WHERE UPPER(p.status) = 'DRAFT'
  AND p.maturity = 'mature'
  AND p.motivation IS NOT NULL AND LENGTH(p.motivation) > 20
  AND p.design IS NOT NULL AND LENGTH(p.design) > 50;

-- DEFER: proposals missing key sections — log but do NOT change status
INSERT INTO roadmap.gate_decision_log
    (proposal_id, from_state, to_state, gate_level, decided_by, decision, rationale)
SELECT
    p.id,
    'DRAFT',
    'DRAFT',
    'D1',
    'product-manager',
    'defer',
    'Incomplete enhancement. Missing: ' ||
    CASE WHEN p.motivation IS NULL OR LENGTH(p.motivation) <= 20 THEN 'motivation ' ELSE '' END ||
    CASE WHEN p.design IS NULL OR LENGTH(p.design) <= 50 THEN 'design ' ELSE '' END ||
    CASE WHEN NOT EXISTS (SELECT 1 FROM roadmap_proposal.proposal_acceptance_criteria ac WHERE ac.proposal_id = p.id) THEN 'acceptance-criteria' ELSE '' END ||
    '. Left in DRAFT for enhancement agent to complete.'
FROM roadmap_proposal.proposal p
WHERE UPPER(p.status) = 'DRAFT'
  AND p.maturity = 'mature'
  AND (
      p.motivation IS NULL OR LENGTH(p.motivation) <= 20
      OR p.design IS NULL OR LENGTH(p.design) <= 50
      OR NOT EXISTS (
          SELECT 1 FROM roadmap_proposal.proposal_acceptance_criteria ac
          WHERE ac.proposal_id = p.id
      )
  );

-- NOW update status for approved proposals
UPDATE roadmap_proposal.proposal p
SET status = 'REVIEW', modified_at = NOW()
FROM (
    SELECT proposal_id FROM roadmap_proposal.proposal_acceptance_criteria
    GROUP BY proposal_id HAVING COUNT(*) >= 1
) ac
WHERE p.id = ac.proposal_id
  AND UPPER(p.status) = 'DRAFT'
  AND p.maturity = 'mature'
  AND p.motivation IS NOT NULL AND LENGTH(p.motivation) > 20
  AND p.design IS NOT NULL AND LENGTH(p.design) > 50;

-- ────────────────────────────────────────────────────────────
-- PRIORITY 2: REVIEW → DEVELOP
-- Gate D2: motivation + design + ACs required (3+ for DEVELOP)
-- ────────────────────────────────────────────────────────────
\echo ''
\echo '=== GATING: REVIEW → DEVELOP (D2) ==='

-- ADVANCE: REVIEW proposals with complete design (motivation + design + 3+ ACs)
INSERT INTO roadmap.gate_decision_log
    (proposal_id, from_state, to_state, gate_level, decided_by, decision, rationale)
SELECT
    p.id,
    'REVIEW',
    'DEVELOP',
    'D2',
    'product-manager',
    'approve',
    'Design review complete. ' || ac_counts.n || ' acceptance criteria defined. ' ||
    'Motivation and design sections are substantive. Ready to enter DEVELOP.'
FROM roadmap_proposal.proposal p
JOIN (
    SELECT proposal_id, COUNT(*) AS n
    FROM roadmap_proposal.proposal_acceptance_criteria
    GROUP BY proposal_id
) ac_counts ON ac_counts.proposal_id = p.id
WHERE UPPER(p.status) = 'REVIEW'
  AND p.motivation IS NOT NULL AND LENGTH(p.motivation) > 20
  AND p.design IS NOT NULL AND LENGTH(p.design) > 50
  AND ac_counts.n >= 3;

-- DEFER: REVIEW proposals with insufficient design
INSERT INTO roadmap.gate_decision_log
    (proposal_id, from_state, to_state, gate_level, decided_by, decision, rationale)
SELECT
    p.id,
    'REVIEW',
    'REVIEW',
    'D2',
    'product-manager',
    'defer',
    'Insufficient for DEVELOP. Missing: ' ||
    CASE WHEN p.motivation IS NULL OR LENGTH(p.motivation) <= 20 THEN 'motivation ' ELSE '' END ||
    CASE WHEN p.design IS NULL OR LENGTH(p.design) <= 50 THEN 'design ' ELSE '' END ||
    CASE WHEN COALESCE(ac_counts.n, 0) < 3
        THEN 'requires-3+-ACs(found:' || COALESCE(ac_counts.n, 0)::text || ') '
        ELSE '' END ||
    '. Held in REVIEW pending completion.'
FROM roadmap_proposal.proposal p
LEFT JOIN (
    SELECT proposal_id, COUNT(*) AS n
    FROM roadmap_proposal.proposal_acceptance_criteria
    GROUP BY proposal_id
) ac_counts ON ac_counts.proposal_id = p.id
WHERE UPPER(p.status) = 'REVIEW'
  AND (
      p.motivation IS NULL OR LENGTH(p.motivation) <= 20
      OR p.design IS NULL OR LENGTH(p.design) <= 50
      OR COALESCE(ac_counts.n, 0) < 3
  );

-- Update status for REVIEW → DEVELOP advances
UPDATE roadmap_proposal.proposal p
SET status = 'DEVELOP', modified_at = NOW()
FROM (
    SELECT proposal_id, COUNT(*) AS n
    FROM roadmap_proposal.proposal_acceptance_criteria
    GROUP BY proposal_id
    HAVING COUNT(*) >= 3
) ac
WHERE p.id = ac.proposal_id
  AND UPPER(p.status) = 'REVIEW'
  AND p.motivation IS NOT NULL AND LENGTH(p.motivation) > 20
  AND p.design IS NOT NULL AND LENGTH(p.design) > 50;

-- ────────────────────────────────────────────
-- FINAL REPORT
-- ────────────────────────────────────────────
\echo ''
\echo '=== POST-GATE STATUS SUMMARY ==='
SELECT status, maturity, COUNT(*) AS cnt
FROM roadmap_proposal.proposal
WHERE UPPER(status) IN ('DRAFT','REVIEW','DEVELOP')
GROUP BY status, maturity
ORDER BY status, maturity;

\echo ''
\echo '=== GATE DECISIONS LOGGED TODAY ==='
SELECT
    p.display_id,
    g.from_state,
    g.to_state,
    g.gate_level,
    g.decision,
    LEFT(g.rationale, 80) AS rationale_preview,
    g.created_at
FROM roadmap.gate_decision_log g
JOIN roadmap_proposal.proposal p ON p.id = g.proposal_id
WHERE g.decided_by = 'product-manager'
  AND g.created_at >= NOW() - INTERVAL '10 minutes'
ORDER BY g.created_at;

\echo ''
\echo '=== PROPOSALS ADVANCED TO REVIEW ==='
SELECT display_id, title, status, maturity
FROM roadmap_proposal.proposal
WHERE UPPER(status) = 'REVIEW'
ORDER BY id;

\echo ''
\echo '=== PROPOSALS ADVANCED TO DEVELOP ==='
SELECT display_id, title, status, maturity
FROM roadmap_proposal.proposal
WHERE UPPER(status) = 'DEVELOP'
ORDER BY id;

COMMIT;
\echo ''
\echo '=== GATE RUN COMPLETE ==='
