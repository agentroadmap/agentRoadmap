-- P306: Normalize proposal.status to UPPERCASE
-- Fixes 44 mixed-case proposals causing filtering bugs.
-- Migration 044

BEGIN;

-- 1. Normalize existing data
UPDATE roadmap_proposal.proposal SET status = 'DRAFT'    WHERE status = 'Draft';
UPDATE roadmap_proposal.proposal SET status = 'REVIEW'   WHERE status = 'Review';
UPDATE roadmap_proposal.proposal SET status = 'DEVELOP'  WHERE status = 'Develop';
UPDATE roadmap_proposal.proposal SET status = 'MERGE'    WHERE status = 'Merge';
UPDATE roadmap_proposal.proposal SET status = 'COMPLETE' WHERE status = 'Complete';

-- 2. Trigger function: auto-uppercase status on INSERT/UPDATE
CREATE OR REPLACE FUNCTION roadmap_proposal.fn_normalize_proposal_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.status := UPPER(NEW.status);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger
DROP TRIGGER IF EXISTS trg_normalize_proposal_status ON roadmap_proposal.proposal;
CREATE TRIGGER trg_normalize_proposal_status
  BEFORE INSERT OR UPDATE OF status ON roadmap_proposal.proposal
  FOR EACH ROW
  EXECUTE FUNCTION roadmap_proposal.fn_normalize_proposal_status();

-- 4. CHECK constraint — all 28 reference_terms proposal_state values
-- Must match: SELECT term_value FROM roadmap.reference_terms WHERE term_category = 'proposal_state';
-- The trigger runs BEFORE CHECK, so uppercase reaches the constraint.
ALTER TABLE roadmap_proposal.proposal
  DROP CONSTRAINT IF EXISTS proposal_status_canonical;
ALTER TABLE roadmap_proposal.proposal
  ADD CONSTRAINT proposal_status_canonical
  CHECK (status IN (
    'Abandoned', 'APPROVED', 'CLOSED', 'Complete', 'COMPLETE',
    'DEPLOYED', 'Develop', 'DEVELOP', 'DISCARDED', 'DONE',
    'Draft', 'DRAFT', 'ESCALATE', 'FIX', 'FIXING',
    'Merge', 'MERGE', 'MERGED', 'NON_ISSUE', 'OPEN',
    'Rejected', 'REJECTED', 'Replaced', 'Review', 'REVIEW',
    'REVIEWING', 'TRIAGE', 'WONT_FIX'
  ));

COMMIT;

-- Verification:
-- SELECT status, COUNT(*) FROM roadmap_proposal.proposal GROUP BY status ORDER BY status;
-- Expected: 6 distinct statuses (DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE, DEPLOYED)
-- SELECT COUNT(*) FROM roadmap_proposal.proposal WHERE status != UPPER(status);
-- Expected: 0
