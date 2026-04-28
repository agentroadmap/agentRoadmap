-- P675: Schema-drift monitor — fingerprint dedupe + hotfix proposal linkage.
--
-- Tracks every distinct (sqlstate, missing_name, query_excerpt) tuple the
-- monitor has seen so we don't file duplicate hotfix proposals or escalate
-- on every cycle. `hotfix_proposal_id` and `origin_proposal_id` link to
-- roadmap_proposal.proposal so the dashboard / gate flow can reason about
-- the cleanup chain.

BEGIN;

CREATE TABLE IF NOT EXISTS roadmap.schema_drift_seen (
	fingerprint        text PRIMARY KEY,
	error_code         text NOT NULL,                  -- e.g. '42703', '42P01'
	missing_name       text NOT NULL,                  -- column or relation
	query_excerpt      text,
	first_seen         timestamptz NOT NULL DEFAULT now(),
	last_seen          timestamptz NOT NULL DEFAULT now(),
	occurrence_count   integer NOT NULL DEFAULT 1,
	hotfix_proposal_id bigint REFERENCES roadmap_proposal.proposal(id) ON DELETE SET NULL,
	origin_proposal_id bigint REFERENCES roadmap_proposal.proposal(id) ON DELETE SET NULL,
	origin_commit_sha  text,
	resolved_at        timestamptz,
	last_escalated_at  timestamptz,
	notes              text
);

CREATE INDEX IF NOT EXISTS idx_schema_drift_seen_unresolved
	ON roadmap.schema_drift_seen (last_seen DESC)
	WHERE resolved_at IS NULL;

COMMENT ON TABLE roadmap.schema_drift_seen IS
	'P675: dedupe state for the schema-drift monitor. One row per (sqlstate, missing_name, normalized_query) fingerprint.';

COMMIT;
