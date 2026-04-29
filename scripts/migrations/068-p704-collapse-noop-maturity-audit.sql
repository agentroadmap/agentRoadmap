-- Migration 068 — collapse no-op MaturityChange events in proposal.audit
--
-- Problem (audit 2026-04-28):
--   proposal-storage-v2.ts setMaturity() unconditionally appended a
--   MaturityChange audit entry on every call, even when maturity didn't
--   actually change. P184 alone has 25+ consecutive "new → new" entries
--   from a poll loop on 2026-04-21. The renderer also lacked `From`, so
--   even legitimate transitions render as "new → new" because the writer
--   never recorded the previous value.
--
-- Fix (code-side, separate commit): setMaturity() now reads current
-- maturity, skips UPDATE+audit if equal, and records From + To when
-- different.
--
-- Fix (data-side, here): walk every proposal's audit array, drop
-- consecutive MaturityChange events whose `To` equals the prior
-- maturity-defining event's `To` (or the running maturity baseline).
-- This collapses the 25+ "new → new" flood into a single legitimate
-- entry per real transition.
--
-- Idempotent: runs the same compaction every time; no-op once compacted.

BEGIN;

WITH expanded AS (
  SELECT p.id,
         e.elem,
         e.ord
    FROM roadmap_proposal.proposal p,
         LATERAL jsonb_array_elements(p.audit) WITH ORDINALITY AS e(elem, ord)
   WHERE jsonb_typeof(p.audit) = 'array'
),
maturity_only AS (
  SELECT id,
         ord,
         elem->>'To' AS to_val,
         LAG(elem->>'To') OVER (PARTITION BY id ORDER BY ord) AS prev_to
    FROM expanded
   WHERE elem->>'Activity' = 'MaturityChange'
),
keep AS (
  SELECT e.id, e.elem, e.ord
    FROM expanded e
    LEFT JOIN maturity_only m USING (id, ord)
   WHERE e.elem->>'Activity' <> 'MaturityChange'
      OR m.prev_to IS NULL
      OR m.prev_to IS DISTINCT FROM m.to_val
),
rebuilt AS (
  SELECT id,
         COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb) AS new_audit
    FROM keep
   GROUP BY id
)
UPDATE roadmap_proposal.proposal p
   SET audit = r.new_audit
  FROM rebuilt r
 WHERE p.id = r.id
   AND p.audit IS DISTINCT FROM r.new_audit;

COMMIT;
