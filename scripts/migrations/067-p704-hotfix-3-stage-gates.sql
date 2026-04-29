-- Migration 067 — P704 hotfix is a 3-stage workflow
--
-- Problem (audit 2026-04-28):
--   Hotfix workflow_stages already correctly defines TRIAGE → FIX → DEPLOYED
--   (with terminals ESCALATE / WONT_FIX / NON_ISSUE). But:
--     1. orchestrator.ts inferGateForState() hardcoded the RFC pipeline, so
--        hotfix proposals at TRIAGE/FIX never had a gate fire (P689 stuck).
--     2. P704 was misrouted through DRAFT→REVIEW because of a manual reset.
--     3. gate_role rows for hotfix:D1/D2/D3/D4 reuse RFC personas that talk
--        about DRAFT→REVIEW, REVIEW→DEVELOP, etc. — wrong instructions for
--        a hotfix gate, and D2/D4 should not exist at all (no REVIEW, no
--        MERGE in the 3-stage flow).
--
-- Fix:
--   1. Rewrite hotfix:D1 persona for TRIAGE → FIX (defect investigation gate).
--   2. Rewrite hotfix:D3 persona for FIX → DEPLOYED (fix-verification gate).
--   3. Delete hotfix:D2 and hotfix:D4 rows so resolveGateRole can never pick
--      them; the orchestrator only requests D1 + D3 for hotfix anyway.
--   4. Backfill P704 from REVIEW → TRIAGE / mature so the rewritten D1
--      hotfix gate can advance it to FIX.
--
-- Idempotent: UPSERT semantics + safe DELETE.

BEGIN;

-- ─── 1. Hotfix D1: TRIAGE → FIX ─────────────────────────────────────────
-- This is the "is this a real defect, can we reproduce it, is the fix
-- scope clear?" gate. Mature TRIAGE means an agent has investigated and
-- proposed a fix plan; D1 confirms the plan and advances to FIX.
UPDATE roadmap_proposal.gate_role
   SET persona = 'You are SKEPTIC ALPHA gating a HOTFIX from TRIAGE → FIX. '
              || 'A hotfix is a fast-track defect — there is NO design RFC, NO architecture review, NO merge gate. '
              || 'The proposal is "mature" only after the agent has: (a) reproduced the defect or established it is system-created and self-evident, (b) located the offending code/log/config, and (c) sketched a concrete fix plan in the proposal body or AC list.\n\n'
              || 'What you check at TRIAGE → FIX:\n'
              || '  1. REPRODUCTION: the body or discussion thread cites a concrete trigger (logs, query, command, screenshot). "It feels slow" is a hold; "agenthive-orchestrator OOMs at 511M cap, see journalctl ts" is fine.\n'
              || '  2. SCOPE: the proposed fix is narrow and reversible. A hotfix that requires a schema migration, multi-service refactor, or new dependency is the wrong instrument — hold and ask the operator to refile as a feature/component.\n'
              || '  3. NON_ISSUE / WONT_FIX: if reproduction shows expected behavior or already-fixed-upstream, advance to NON_ISSUE / WONT_FIX terminal instead of FIX.\n'
              || '  4. AC: at least one AC describing the observable post-fix state (log line, exit code, query result). Vague "fix the bug" = hold.\n\n'
              || 'What you do NOT check (these belong in the FIX → DEPLOYED gate):\n'
              || '  - Whether the patch is committed.\n'
              || '  - Whether tests pass.\n'
              || 'If reproduction + narrow scope + measurable AC are all present, ADVANCE.',
       output_contract = 'Emit `## Failures` + `## Remediation` to stdout for non-advance. ADVANCE moves status to FIX; HOLD asks the agent to expand reproduction; NON_ISSUE / WONT_FIX route to terminal stages directly.',
       updated_at = now()
 WHERE proposal_type = 'hotfix' AND gate = 'D1';

-- ─── 2. Hotfix D3: FIX → DEPLOYED ───────────────────────────────────────
-- This is the "did the patch land and does it close the defect?" gate.
-- The mature FIX means an agent committed the patch and exercised it.
UPDATE roadmap_proposal.gate_role
   SET persona = 'You are SKEPTIC BETA gating a HOTFIX from FIX → DEPLOYED. '
              || 'The defect is reproduced, the fix is committed; you verify it actually closes the defect and is safe to deploy.\n\n'
              || 'What you check at FIX → DEPLOYED:\n'
              || '  - PATCH EXISTS: the commit referenced in the proposal lands in main (or the operator branch); verify with git log.\n'
              || '  - REGRESSION TEST: the trigger from D1 reproduction no longer fires. If automated, point at the test name and pass output. If manual, the discussion thread must show the post-fix log or query result.\n'
              || '  - NO COLLATERAL: the patch did not introduce new schema, broad refactors, or unrelated edits. A hotfix that grew into a feature must be re-routed.\n'
              || '  - ROLLBACK READY: the patch is reversible (single revert, config flip, or migration rollback noted).\n\n'
              || 'What you do NOT check:\n'
              || '  - Architectural fit (already implicitly accepted at TRIAGE — hotfixes are tactical).\n'
              || 'If patch landed, regression closed, no scope creep — ADVANCE to DEPLOYED. Otherwise HOLD with concrete remediation.',
       output_contract = 'Emit `## Failures` + `## Remediation` for non-advance. ADVANCE flips status to DEPLOYED (terminal). ESCALATE if the fix uncovered a deeper issue beyond hotfix scope.',
       updated_at = now()
 WHERE proposal_type = 'hotfix' AND gate = 'D3';

-- ─── 3. Drop unused hotfix gate rows ────────────────────────────────────
-- Hotfix has no REVIEW or MERGE stage. The orchestrator's
-- inferGateForState() (post-this-deploy) will never request D2/D4 for
-- hotfix, but resolveGateRole would still find these rows in the cache —
-- delete them so any stray code path also resolves to BUILTIN_FALLBACK
-- (which is RFC-flavoured and obviously wrong, surfacing the bug).
DELETE FROM roadmap_proposal.gate_role
 WHERE proposal_type = 'hotfix' AND gate IN ('D2', 'D4');

-- ─── 4. Backfill P704 ───────────────────────────────────────────────────
-- P704 was created at TRIAGE, manually flipped to DRAFT (operator error),
-- then advanced through the RFC pipeline to REVIEW. Reset it to TRIAGE so
-- the rewritten D1 hotfix gate can pick it up. Maturity stays 'mature'
-- because the proposal body already has reproduction + AC (this migration
-- is itself the proof of investigation).
UPDATE roadmap_proposal.proposal
   SET status = 'TRIAGE',
       maturity = 'mature',
       modified_at = now()
 WHERE display_id = 'P704';

-- Audit trail entry so the activity thread reflects the structural reset.
INSERT INTO roadmap_proposal.proposal_discussions
    (proposal_id, author_identity, context_prefix, body)
SELECT id,
       'system/reconciler',
       'gate-decision:',
       'P704 reset to TRIAGE/mature: hotfix is a 3-stage workflow (TRIAGE → FIX → DEPLOYED). Earlier transitions to DRAFT → REVIEW were a misroute through the RFC pipeline; orchestrator now dispatches D1 and D3 only for hotfix proposals.'
  FROM roadmap_proposal.proposal
 WHERE display_id = 'P704';

COMMIT;
