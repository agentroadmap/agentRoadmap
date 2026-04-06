CREATE TABLE roadmap.proposal (
    id              int8 GENERATED ALWAYS AS IDENTITY NOT NULL,
    display_id      text NOT NULL,
	parent_id  		int8 NULL REFERENCES roadmap.proposal (id) ON DELETE SET NULL,
    type            text NOT NULL,
    status          text DEFAULT 'Draft'::text NOT NULL,
    maturity        jsonb DEFAULT '{"Draft":"New"}'::jsonb NOT NULL,
    title           text NOT NULL,
    summary         text NULL,
    motivation      text NULL,
    design          text NULL,
    drawbacks       text NULL,
    alternatives    text NULL,
    dependency      text NULL,
    priority        text NULL,
    body_vector  	public.vector NULL,
    tags            jsonb NULL,
    audit          	jsonb NOT NULL,
    CONSTRAINT proposal_display_id_key  UNIQUE (display_id),
    CONSTRAINT proposal_pkey PRIMARY KEY (id)
);

-- Indexes corrected to roadmap schema (were wrongly referencing public.proposal_1)
CREATE INDEX idx_proposal_status ON roadmap.proposal (status);
CREATE INDEX idx_proposal_type   ON roadmap.proposal (type);

-- Comments: fixed table name typo (proposa → proposal) and double-quote → single-quote
COMMENT ON COLUMN roadmap.proposal.id             IS 'Auto-generated identity; referenced by other objects';
COMMENT ON COLUMN roadmap.proposal.display_id     IS 'P+000-padded id used in lists/display for quick identification';
COMMENT ON COLUMN roadmap.proposal.parent_id      IS 'Parent proposal id; constructs a hierarchical relation';
COMMENT ON COLUMN roadmap.proposal.type           IS 'Controlled term for proposal type; dictates workflow and pipeline';
COMMENT ON COLUMN roadmap.proposal.status         IS 'Current state of the proposal within its state-machine workflow';
COMMENT ON COLUMN roadmap.proposal.title          IS 'Structured proposal content — markdown format';
COMMENT ON COLUMN roadmap.proposal.summary        IS 'Structured proposal content — markdown format';
COMMENT ON COLUMN roadmap.proposal.motivation     IS 'Structured proposal content — markdown format';
COMMENT ON COLUMN roadmap.proposal.design         IS 'Structured proposal content — markdown format';
COMMENT ON COLUMN roadmap.proposal.drawbacks      IS 'Structured proposal content — markdown format';
COMMENT ON COLUMN roadmap.proposal.alternatives   IS 'Structured proposal content — markdown format';
COMMENT ON COLUMN roadmap.proposal.dependency     IS 'Text described dependency, need to be resolved — markdown format';
COMMENT ON COLUMN roadmap.proposal.priority       IS 'Loosely described priority in markdown; may influence queue ranking';
COMMENT ON COLUMN roadmap.proposal.body_vector    IS 'pgvector embedding for semantic search (use TBD at proposal level)';
COMMENT ON COLUMN roadmap.proposal.tags           IS 'Search tags; may include category, domain, and intelligently identified keywords';

-- maturity: fixed missing opening quote and closing semicolon
COMMENT ON COLUMN roadmap.proposal.maturity       IS '{"Draft":"Mature","Review":"Mature","Develop":"Active"}';

-- audit: fixed Markdown fences → plain string, "TS"" → "TS":, removed stray NOT NULL
COMMENT ON COLUMN roadmap.proposal.audit          IS 'Array of audit events: [{"TS":"<iso8601>","Agent":"<name>","Activity":"<verb>","Reason":"<text>"}]';

CREATE OR REPLACE FUNCTION roadmap.fn_proposal_display_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
	NEW.display_id := 'P' || LPAD(NEW.id::text, 3, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_proposal_display_id
    BEFORE INSERT ON roadmap.proposal
    FOR EACH ROW
    WHEN (NEW.display_id IS NULL OR NEW.display_id = '')
    EXECUTE FUNCTION roadmap.fn_proposal_display_id();

CREATE TABLE roadmap.proposal_decision (
    id               int8 GENERATED ALWAYS AS IDENTITY NOT NULL,
    proposal_id      int8 NOT NULL,
    decision         text NOT NULL,   -- 'approved','rejected','deferred','escalated'
    authority        text NOT NULL,   -- agent_identity of decision maker
    rationale        text NULL,
    binding          bool DEFAULT true NOT NULL,
    decided_at       timestamptz DEFAULT now() NOT NULL,
    superseded_by    int8 NULL,       -- FK to self if decision is overturned
    CONSTRAINT proposal_decision_pkey PRIMARY KEY (id),
    CONSTRAINT proposal_decision_decision_check CHECK (decision = ANY (
        ARRAY['approved','rejected','deferred','escalated'])),
    CONSTRAINT fk_pd_proposal FOREIGN KEY (proposal_id)
        REFERENCES roadmap.proposal (id) ON DELETE CASCADE,
    CONSTRAINT fk_pd_superseded FOREIGN KEY (superseded_by)
        REFERENCES roadmap.proposal_decision (id) ON DELETE SET NULL
);