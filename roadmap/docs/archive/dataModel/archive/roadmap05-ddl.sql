-- DROP TABLE agent_memory;

CREATE TABLE agent_memory (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	agent_identity text NOT NULL,
	layer text NOT NULL,
	"key" text NOT NULL,
	value text NULL,
	metadata jsonb NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	body_embedding public.vector NULL,
	CONSTRAINT agent_memory_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_memory_agent ON public.agent_memory USING btree (agent_identity);
CREATE INDEX idx_memory_embedding ON public.agent_memory USING hnsw (body_embedding vector_cosine_ops);
CREATE INDEX idx_memory_layer ON public.agent_memory USING btree (layer);


-- public.model_metadata definition

-- Drop table

-- DROP TABLE model_metadata;

CREATE TABLE model_metadata (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	model_name text NOT NULL,
	provider text NULL,
	cost_per_1k_input numeric(10, 6) NULL,
	cost_per_1k_output numeric(10, 6) NULL,
	max_tokens int4 NULL,
	capabilities jsonb NULL,
	rating int4 NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT model_metadata_model_name_key UNIQUE (model_name),
	CONSTRAINT model_metadata_pkey PRIMARY KEY (id)
);


-- public.spending_caps definition

-- Drop table

-- DROP TABLE spending_caps;

CREATE TABLE spending_caps (
	agent_identity text NOT NULL,
	daily_limit_usd numeric(12, 2) NULL,
	total_spent_today_usd numeric(12, 2) NULL,
	is_frozen bool DEFAULT false NULL,
	CONSTRAINT spending_caps_pkey PRIMARY KEY (agent_identity)
);


-- public.team definition

-- Drop table

-- DROP TABLE team;

CREATE TABLE team (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	team_name text NOT NULL,
	team_type text NULL,
	status text DEFAULT 'active'::text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT team_pkey PRIMARY KEY (id),
	CONSTRAINT team_team_name_key UNIQUE (team_name)
);


-- public.workflow_templates definition

-- Drop table

-- DROP TABLE workflow_templates;

CREATE TABLE workflow_templates (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"name" text NOT NULL,
	description text NULL,
	is_default bool DEFAULT false NULL,
	stage_count int4 NULL,
	created_at timestamptz DEFAULT now() NULL,
	smdl_id text NULL,
	smdl_definition jsonb NULL,
	"version" text DEFAULT '1.0.0'::text NULL,
	is_system bool DEFAULT false NULL,
	modified_at timestamptz DEFAULT now() NULL,
	CONSTRAINT workflow_templates_name_key UNIQUE (name),
	CONSTRAINT workflow_templates_pkey PRIMARY KEY (id)
);


-- public.agent_registry definition

-- Drop table

-- DROP TABLE agent_registry;

CREATE TABLE agent_registry (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	agent_identity text NOT NULL,
	agent_type text NULL,
	"role" text NULL,
	skills jsonb NULL,
	status text DEFAULT 'active'::text NULL,
	spending_cap_id text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT agent_registry_agent_identity_key UNIQUE (agent_identity),
	CONSTRAINT agent_registry_pkey PRIMARY KEY (id),
	CONSTRAINT agent_registry_spending_cap_id_fkey FOREIGN KEY (spending_cap_id) REFERENCES spending_caps(agent_identity)
);


-- public.proposal_valid_transitions definition

-- Drop table

-- DROP TABLE proposal_valid_transitions;

CREATE TABLE proposal_valid_transitions (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	from_state text NOT NULL,
	to_state text NOT NULL,
	allowed_reasons _text NULL,
	allowed_roles _text NULL,
	requires_ac text NULL,
	workflow_name text DEFAULT 'RFC 5-Stage'::text NULL,
	CONSTRAINT proposal_valid_transitions_pkey PRIMARY KEY (id),
	CONSTRAINT proposal_valid_transitions_requires_ac_check CHECK ((requires_ac = ANY (ARRAY['none'::text, 'all'::text, 'critical'::text]))),
	CONSTRAINT proposal_valid_transitions_wf_from_to_key UNIQUE (workflow_name, from_state, to_state),
	CONSTRAINT fk_pvt_workflow FOREIGN KEY (workflow_name) REFERENCES workflow_templates("name") ON DELETE RESTRICT
);
CREATE INDEX idx_valid_transitions_from ON public.proposal_valid_transitions USING btree (from_state);
CREATE INDEX idx_valid_transitions_to ON public.proposal_valid_transitions USING btree (to_state);


-- public.team_member definition

-- Drop table

-- DROP TABLE team_member;

CREATE TABLE team_member (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	team_id int8 NULL,
	agent_id int8 NULL,
	"role" text NULL,
	joined_at timestamptz DEFAULT now() NULL,
	CONSTRAINT team_member_pkey PRIMARY KEY (id),
	CONSTRAINT team_member_team_id_agent_id_key UNIQUE (team_id, agent_id),
	CONSTRAINT team_member_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agent_registry(id),
	CONSTRAINT team_member_team_id_fkey FOREIGN KEY (team_id) REFERENCES team(id)
);


-- public.workflow_roles definition

-- Drop table

-- DROP TABLE workflow_roles;

CREATE TABLE workflow_roles (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	template_id int8 NOT NULL,
	role_name text NOT NULL,
	description text NULL,
	clearance int4 DEFAULT 1 NULL,
	is_default bool DEFAULT false NULL,
	CONSTRAINT workflow_roles_pkey PRIMARY KEY (id),
	CONSTRAINT workflow_roles_template_id_role_name_key UNIQUE (template_id, role_name),
	CONSTRAINT workflow_roles_template_id_fkey FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
);


-- public.workflow_stages definition

-- Drop table

-- DROP TABLE workflow_stages;

CREATE TABLE workflow_stages (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	template_id int8 NOT NULL,
	stage_name text NOT NULL,
	stage_order int4 NOT NULL,
	maturity_gate int4 DEFAULT 2 NULL,
	requires_ac bool DEFAULT false NULL,
	gating_config jsonb NULL,
	CONSTRAINT workflow_stages_pkey PRIMARY KEY (id),
	CONSTRAINT workflow_stages_template_id_stage_name_key UNIQUE (template_id, stage_name),
	CONSTRAINT workflow_stages_template_id_stage_order_key UNIQUE (template_id, stage_order),
	CONSTRAINT workflow_stages_template_id_fkey FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
);


-- public.workflow_transitions definition

-- Drop table

-- DROP TABLE workflow_transitions;

CREATE TABLE workflow_transitions (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	template_id int8 NOT NULL,
	from_stage text NOT NULL,
	to_stage text NOT NULL,
	labels _text NULL,
	allowed_roles _text NULL,
	requires_ac bool DEFAULT false NULL,
	gating_rules jsonb NULL,
	CONSTRAINT workflow_transitions_pkey PRIMARY KEY (id),
	CONSTRAINT workflow_transitions_template_id_from_stage_to_stage_key UNIQUE (template_id, from_stage, to_stage),
	CONSTRAINT workflow_transitions_template_id_fkey FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
);


-- public.attachment_registry definition

-- Drop table

-- DROP TABLE attachment_registry;

CREATE TABLE attachment_registry (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	proposal_id int8 NULL,
	file_name text NULL,
	relative_path text NULL,
	content_hash text NULL,
	vision_summary text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT attachment_registry_pkey PRIMARY KEY (id)
);


-- public.message_ledger definition

-- Drop table

-- DROP TABLE message_ledger;

CREATE TABLE message_ledger (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	from_agent text NOT NULL,
	to_agent text NULL,
	channel text NULL,
	message_content text NULL,
	message_type text NULL,
	proposal_id int8 NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT message_ledger_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_message_created ON public.message_ledger USING btree (created_at);
CREATE INDEX idx_message_from ON public.message_ledger USING btree (from_agent);


-- public.proposal definition

-- Drop table

-- DROP TABLE proposal;

CREATE TABLE proposal (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	display_id text NULL,
	parent_id int8 NULL,
	proposal_type text NOT NULL,
	category text NULL,
	domain_id text NULL,
	title text NULL,
	body_markdown text NULL,
	body_embedding public.vector NULL,
	process_logic text NULL,
	maturity_level int4 DEFAULT 0 NULL,
	status text DEFAULT 'NEW'::text NULL,
	budget_limit_usd numeric(12, 2) NULL,
	tags jsonb NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	rfc_state text NULL,
	maturity_queue_position int4 DEFAULT 0 NULL,
	blocked_by_dependencies bool DEFAULT false NULL,
	accepted_criteria_count int4 DEFAULT 0 NULL,
	required_criteria_count int4 DEFAULT 0 NULL,
	priority int4 DEFAULT 5 NULL,
	workflow_name text DEFAULT 'RFC 5-Stage'::text NULL,
	workflow_id int8 NULL,
	assigned_to varchar(50) NULL,
	assigned_at timestamptz NULL,
	CONSTRAINT proposal_display_id_key UNIQUE (display_id),
	CONSTRAINT proposal_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_proposal_maturity ON public.proposal USING btree (maturity_level);
CREATE INDEX idx_proposal_status ON public.proposal USING btree (status);
CREATE INDEX idx_proposal_type ON public.proposal USING btree (proposal_type);
CREATE INDEX idx_proposal_workflow ON public.proposal USING btree (workflow_name);

-- Table Triggers

create trigger trg_proposal_state_change before
update
    of status on
    public.proposal for each row execute function log_proposal_state_change();


-- public.proposal_acceptance_criteria definition

-- Drop table

-- DROP TABLE proposal_acceptance_criteria;

CREATE TABLE proposal_acceptance_criteria (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	proposal_id int8 NOT NULL,
	item_number int4 NOT NULL,
	criterion_text text NOT NULL,
	status text DEFAULT 'pending'::text NOT NULL,
	verified_by text NULL,
	verification_notes text NULL,
	verified_at timestamptz NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	CONSTRAINT proposal_acceptance_criteria_item_number_check CHECK ((item_number > 0)),
	CONSTRAINT proposal_acceptance_criteria_pkey PRIMARY KEY (id),
	CONSTRAINT proposal_acceptance_criteria_proposal_id_item_number_key UNIQUE (proposal_id, item_number),
	CONSTRAINT proposal_acceptance_criteria_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'pass'::text, 'fail'::text, 'blocked'::text, 'waived'::text])))
);
CREATE INDEX idx_ac_proposal ON public.proposal_acceptance_criteria USING btree (proposal_id);
CREATE INDEX idx_ac_status ON public.proposal_acceptance_criteria USING btree (status);
CREATE UNIQUE INDEX idx_ac_unique_per_proposal ON public.proposal_acceptance_criteria USING btree (proposal_id, item_number);


-- public.proposal_dependencies definition

-- Drop table

-- DROP TABLE proposal_dependencies;

CREATE TABLE proposal_dependencies (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	from_proposal_id int8 NOT NULL,
	to_proposal_id int8 NOT NULL,
	dependency_type text DEFAULT 'blocks'::text NOT NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	resolved bool DEFAULT false NULL,
	resolved_at timestamptz NULL,
	CONSTRAINT proposal_dependencies_dep_dependency_type_check CHECK ((dependency_type = ANY (ARRAY['blocks'::text, 'depended_by'::text, 'supersedes'::text, 'relates'::text]))),
	CONSTRAINT proposal_dependencies_dep_from_to_key UNIQUE (from_proposal_id, to_proposal_id),
	CONSTRAINT proposal_dependencies_dep_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_dependees_from ON public.proposal_dependencies USING btree (from_proposal_id);
CREATE INDEX idx_dependees_to ON public.proposal_dependencies USING btree (to_proposal_id);
CREATE INDEX idx_deps_from ON public.proposal_dependencies USING btree (from_proposal_id) WHERE (resolved = false);
CREATE INDEX idx_deps_to ON public.proposal_dependencies USING btree (to_proposal_id);


-- public.proposal_discussions definition

-- Drop table

-- DROP TABLE proposal_discussions;

CREATE TABLE proposal_discussions (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	proposal_id int8 NOT NULL,
	parent_id int8 NULL,
	author_identity text NOT NULL,
	context_prefix text NULL,
	body text NOT NULL,
	body_embedding public.vector NULL,
	created_at timestamptz DEFAULT now() NULL,
	updated_at timestamptz DEFAULT now() NULL,
	body_markdown text NULL,
	CONSTRAINT proposal_discussions_context_prefix_check CHECK ((context_prefix = ANY (ARRAY['arch:'::text, 'team:'::text, 'critical:'::text, 'security:'::text, 'general:'::text, 'feedback:'::text, 'concern:'::text, 'poc:'::text]))),
	CONSTRAINT proposal_discussions_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_discussion_author ON public.proposal_discussions USING btree (author_identity);
CREATE INDEX idx_discussion_context ON public.proposal_discussions USING btree (context_prefix) WHERE (context_prefix IS NOT NULL);
CREATE INDEX idx_discussion_created ON public.proposal_discussions USING btree (created_at DESC);
CREATE INDEX idx_discussion_embedding ON public.proposal_discussions USING hnsw (body_embedding vector_cosine_ops) WITH (m='16', ef_construction='64');
CREATE INDEX idx_discussion_parent ON public.proposal_discussions USING btree (parent_id) WHERE (parent_id IS NOT NULL);
CREATE INDEX idx_discussion_proposal ON public.proposal_discussions USING btree (proposal_id);


-- public.proposal_labels definition

-- Drop table

-- DROP TABLE proposal_labels;

CREATE TABLE proposal_labels (
	proposal_id int8 NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT proposal_labels_pkey PRIMARY KEY (proposal_id, label)
);
CREATE INDEX idx_labels_label ON public.proposal_labels USING btree (label);


-- public.proposal_reviews definition

-- Drop table

-- DROP TABLE proposal_reviews;

CREATE TABLE proposal_reviews (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	proposal_id int8 NOT NULL,
	reviewer_identity text NOT NULL,
	verdict text NOT NULL,
	findings jsonb NULL,
	notes text NULL,
	reviewed_at timestamptz DEFAULT now() NULL,
	"comment" text NULL,
	is_blocking bool DEFAULT false NULL,
	CONSTRAINT proposal_reviews_pkey PRIMARY KEY (id),
	CONSTRAINT proposal_reviews_unique_reviewer UNIQUE NULLS NOT DISTINCT (proposal_id, reviewer_identity),
	CONSTRAINT proposal_reviews_verdict_check CHECK ((verdict = ANY (ARRAY['approve'::text, 'request_changes'::text, 'reject'::text])))
);
CREATE INDEX idx_reviews_blocking ON public.proposal_reviews USING btree (proposal_id) WHERE (is_blocking = true);
CREATE INDEX idx_reviews_findings ON public.proposal_reviews USING gin (findings);
CREATE INDEX idx_reviews_proposal ON public.proposal_reviews USING btree (proposal_id);
CREATE INDEX idx_reviews_reviewer ON public.proposal_reviews USING btree (reviewer_identity);
CREATE INDEX idx_reviews_verdict ON public.proposal_reviews USING btree (verdict);


-- public.proposal_state_transitions definition

-- Drop table

-- DROP TABLE proposal_state_transitions;

CREATE TABLE proposal_state_transitions (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	proposal_id int8 NOT NULL,
	from_state text NOT NULL,
	to_state text NOT NULL,
	transition_reason text NOT NULL,
	emoji bpchar(4) NULL,
	depends_on_display_id text NULL,
	transitioned_by text NULL,
	notes text NULL,
	transitioned_at timestamptz DEFAULT now() NULL,
	CONSTRAINT proposal_state_transitions_pkey PRIMARY KEY (id),
	CONSTRAINT proposal_state_transitions_transition_reason_check CHECK ((transition_reason = ANY (ARRAY['mature'::text, 'decision'::text, 'iteration'::text, 'depend'::text, 'discard'::text, 'rejected'::text, 'research'::text, 'division'::text, 'submit'::text])))
);
CREATE INDEX idx_state_transitions_created ON public.proposal_state_transitions USING btree (transitioned_at DESC);
CREATE INDEX idx_state_transitions_from_state ON public.proposal_state_transitions USING btree (from_state);
CREATE INDEX idx_state_transitions_proposal ON public.proposal_state_transitions USING btree (proposal_id);
CREATE INDEX idx_state_transitions_reason ON public.proposal_state_transitions USING btree (transition_reason);
CREATE INDEX idx_state_transitions_state ON public.proposal_state_transitions USING btree (to_state);
CREATE INDEX idx_state_transitions_time ON public.proposal_state_transitions USING btree (transitioned_at DESC);
CREATE INDEX idx_state_transitions_to_state ON public.proposal_state_transitions USING btree (to_state);


-- public.proposal_version definition

-- Drop table

-- DROP TABLE proposal_version;

CREATE TABLE proposal_version (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	proposal_id int8 NULL,
	author_identity text NULL,
	version_number int4 NULL,
	change_summary text NULL,
	body_delta text NULL,
	metadata_delta_json jsonb NULL,
	git_commit_sha text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT proposal_version_pkey PRIMARY KEY (id)
);


-- public.spending_log definition

-- Drop table

-- DROP TABLE spending_log;

CREATE TABLE spending_log (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	proposal_id int8 NULL,
	agent_identity text NULL,
	cost_usd numeric(12, 2) NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT spending_log_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_spending_agent ON public.spending_log USING btree (agent_identity);


-- public.workflows definition

-- Drop table

-- DROP TABLE workflows;

CREATE TABLE workflows (
	id int8 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
	template_id int8 NOT NULL,
	proposal_id int8 NOT NULL,
	current_stage text NOT NULL,
	started_at timestamptz DEFAULT now() NULL,
	completed_at timestamptz NULL,
	CONSTRAINT workflows_pkey PRIMARY KEY (id),
	CONSTRAINT workflows_proposal_id_key UNIQUE (proposal_id)
);
CREATE INDEX idx_workflows_stage ON public.workflows USING btree (current_stage);
CREATE INDEX idx_workflows_template ON public.workflows USING btree (template_id);


-- public.attachment_registry foreign keys

ALTER TABLE public.attachment_registry ADD CONSTRAINT attachment_registry_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id);


-- public.message_ledger foreign keys

ALTER TABLE public.message_ledger ADD CONSTRAINT message_ledger_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id);


-- public.proposal foreign keys

ALTER TABLE public.proposal ADD CONSTRAINT fk_proposal_workflow FOREIGN KEY (workflow_name) REFERENCES workflow_templates("name") ON DELETE SET DEFAULT;
ALTER TABLE public.proposal ADD CONSTRAINT proposal_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES proposal(id);
ALTER TABLE public.proposal ADD CONSTRAINT proposal_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL;


-- public.proposal_acceptance_criteria foreign keys

ALTER TABLE public.proposal_acceptance_criteria ADD CONSTRAINT proposal_acceptance_criteria_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id) ON DELETE CASCADE;


-- public.proposal_dependencies foreign keys

ALTER TABLE public.proposal_dependencies ADD CONSTRAINT proposal_dependencies_from_proposal_id_fkey FOREIGN KEY (from_proposal_id) REFERENCES proposal(id) ON DELETE CASCADE;
ALTER TABLE public.proposal_dependencies ADD CONSTRAINT proposal_dependencies_to_proposal_id_fkey FOREIGN KEY (to_proposal_id) REFERENCES proposal(id) ON DELETE CASCADE;


-- public.proposal_discussions foreign keys

ALTER TABLE public.proposal_discussions ADD CONSTRAINT proposal_discussions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES proposal_discussions(id) ON DELETE SET NULL;
ALTER TABLE public.proposal_discussions ADD CONSTRAINT proposal_discussions_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id) ON DELETE CASCADE;


-- public.proposal_labels foreign keys

ALTER TABLE public.proposal_labels ADD CONSTRAINT proposal_labels_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id) ON DELETE CASCADE;


-- public.proposal_reviews foreign keys

ALTER TABLE public.proposal_reviews ADD CONSTRAINT proposal_reviews_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id) ON DELETE CASCADE;


-- public.proposal_state_transitions foreign keys

ALTER TABLE public.proposal_state_transitions ADD CONSTRAINT proposal_state_transitions_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id) ON DELETE CASCADE;


-- public.proposal_version foreign keys

ALTER TABLE public.proposal_version ADD CONSTRAINT proposal_version_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id);


-- public.spending_log foreign keys

ALTER TABLE public.spending_log ADD CONSTRAINT spending_log_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id);


-- public.workflows foreign keys

ALTER TABLE public.workflows ADD CONSTRAINT workflows_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposal(id) ON DELETE CASCADE;
ALTER TABLE public.workflows ADD CONSTRAINT workflows_template_id_fkey FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE RESTRICT;