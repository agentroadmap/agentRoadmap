-- =============================================================================
-- ROADMAP SCHEMA — v2 gap remediation
-- Applies on top of roadmap-ddl-v2.sql
-- Sections mirror the 4 pillars; within each: new tables first, then alters,
-- then triggers, then views, in dependency order.
-- =============================================================================

SET search_path TO roadmap, public;


-- =============================================================================
-- PILLAR 1 — PRODUCT DEVELOPMENT
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1a. maturity
-- Gives each integer maturity level a name and description so workflow_stages
-- .maturity_gate means something beyond a bare number.
-- We simplify the scale to 0-3, added 'Obsolete' as a possible state for 
--  old proposals that are no longer relevant. State should be changed accordingly.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.maturity (
    level        int4  NOT NULL,
    name         text  NOT NULL,
    description  text  NULL,
    CONSTRAINT maturity_pkey        PRIMARY KEY (level),
    CONSTRAINT maturity_name_key    UNIQUE (name),
    CONSTRAINT maturity_level_check CHECK (level >= 0)
);
COMMENT ON TABLE  roadmap.maturity IS 'Lookup defining what each integer maturity level means; referenced by workflow_stages.maturity_gate. We simplify the scale to 0-3, added ''Obsolete'' as a possible state for old proposals that are no longer relevant';

INSERT INTO roadmap.maturity (level, name, description) VALUES
    (0, 'New',      'Proposal just created; transit to a new state'),
    (1, 'Active',   'Author is actively research, enhance, develop, merge or fully integrated with other feature or components'),
    (2, 'Mature',   'Decision gating decide this is ready for next state'),
    (3, 'Obsolete', 'Regardless of state, this proposal is no longer relevant or valid, it could be replaced or superceded, this should be decided at the discretion of the governing body. State should be changed accordingly.');

-- Wire the FK from workflow_stages (column already exists, just adding the constraint)
ALTER TABLE roadmap.workflow_stages
    ADD CONSTRAINT workflow_stages_maturity_gate_fkey
    FOREIGN KEY (maturity_gate) REFERENCES roadmap.maturity (level)
    ON DELETE SET NULL;


-- ---------------------------------------------------------------------------
-- 1b. proposal_type_config — add required_fields / optional_fields
-- ---------------------------------------------------------------------------
ALTER TABLE roadmap.proposal_type_config
    ADD COLUMN required_fields text[] DEFAULT ARRAY[]::text[] NOT NULL,
    ADD COLUMN optional_fields text[] DEFAULT ARRAY[]::text[] NOT NULL;

COMMENT ON COLUMN roadmap.proposal_type_config.required_fields IS 'Proposal fields that must be non-null for this type, e.g. {motivation,design} for RFC';
COMMENT ON COLUMN roadmap.proposal_type_config.optional_fields IS 'Fields shown in the editor for this type but not mandatory';


-- ---------------------------------------------------------------------------
-- 1c. proposal_template
-- Type-specific content scaffolds; pre-fills new proposals on insert.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.proposal_template (
    id            int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    type          text        NOT NULL,
    version       int4        DEFAULT 1 NOT NULL,
    label         text        NOT NULL,
    is_default    bool        DEFAULT false NOT NULL,
    summary_md    text        NULL,
    motivation_md text        NULL,
    design_md     text        NULL,
    drawbacks_md  text        NULL,
    alternatives_md text      NULL,
    created_by    text        NOT NULL,
    created_at    timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT proposal_template_pkey         PRIMARY KEY (id),
    CONSTRAINT proposal_template_type_ver_key UNIQUE (type, version),
    CONSTRAINT proposal_template_type_fkey    FOREIGN KEY (type)
        REFERENCES roadmap.proposal_type_config (type) ON DELETE CASCADE,
    CONSTRAINT proposal_template_author_fkey  FOREIGN KEY (created_by)
        REFERENCES roadmap.agent_registry (agent_identity) ON DELETE RESTRICT
);
COMMENT ON TABLE  roadmap.proposal_template IS 'Versioned content scaffolds per proposal type; default template is pre-filled by fn_spawn_workflow on insert';
COMMENT ON COLUMN roadmap.proposal_template.is_default IS 'Only one default per type; enforced by partial unique index below';

CREATE UNIQUE INDEX idx_proposal_template_default
    ON roadmap.proposal_template (type)
    WHERE is_default = true;
CREATE INDEX idx_proposal_template_type ON roadmap.proposal_template (type);


-- ---------------------------------------------------------------------------
-- 1d. proposal_event (transactional outbox)
-- Written atomically by state-change trigger in the same transaction.
-- A dispatcher polls, delivers to subscribers / notification fan-out, marks
-- dispatched_at. Never updated after dispatch — append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.proposal_event (
    id            int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    proposal_id   int8        NOT NULL,
    event_type    text        NOT NULL,
    payload       jsonb       NOT NULL DEFAULT '{}',
    created_at    timestamptz DEFAULT now() NOT NULL,
    dispatched_at timestamptz NULL,
    CONSTRAINT proposal_event_pkey         PRIMARY KEY (id),
    CONSTRAINT proposal_event_type_check   CHECK (event_type IN (
        'status_changed','decision_made','lease_claimed','lease_released',
        'dependency_added','dependency_resolved','ac_updated','review_submitted',
        'maturity_changed','milestone_achieved')),
    CONSTRAINT proposal_event_proposal_fkey FOREIGN KEY (proposal_id)
        REFERENCES roadmap.proposal (id) ON DELETE CASCADE
);
CREATE INDEX idx_event_proposal     ON roadmap.proposal_event (proposal_id);
CREATE INDEX idx_event_undispatched ON roadmap.proposal_event (created_at)
    WHERE dispatched_at IS NULL;
CREATE INDEX idx_event_type         ON roadmap.proposal_event (event_type);

COMMENT ON TABLE  roadmap.proposal_event IS 'Transactional outbox: one row per domain event, written atomically with the mutation that caused it';
COMMENT ON COLUMN roadmap.proposal_event.dispatched_at IS 'Set by the dispatcher after successful delivery; NULL = pending';


-- ---------------------------------------------------------------------------
-- 1e. Trigger: write proposal_event on status change
-- Extends fn_log_proposal_state_change — adds outbox row alongside
-- the existing state_transitions insert and audit jsonb append.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION roadmap.fn_log_proposal_state_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_agent text;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_agent := COALESCE(current_setting('app.agent_identity', true), 'system');

        -- 1. Append to audit jsonb
        NEW.audit := NEW.audit || jsonb_build_object(
            'TS',       to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'Agent',    v_agent,
            'Activity', 'StatusChange',
            'From',     OLD.status,
            'To',       NEW.status
        );

        -- 2. State transitions ledger
        INSERT INTO roadmap.proposal_state_transitions
            (proposal_id, from_state, to_state, transition_reason, transitioned_by)
        VALUES (NEW.id, OLD.status, NEW.status, 'system', v_agent);

        -- 3. Outbox event
        INSERT INTO roadmap.proposal_event (proposal_id, event_type, payload)
        VALUES (
            NEW.id,
            'status_changed',
            jsonb_build_object(
                'from',  OLD.status,
                'to',    NEW.status,
                'agent', v_agent,
                'ts',    to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger already exists on proposal; replacing the function is sufficient.
-- No DROP/CREATE TRIGGER needed — the existing trg_proposal_state_change
-- calls this function by name and picks up the new body automatically.


-- ---------------------------------------------------------------------------
-- 1f. Trigger: validate required_fields per proposal type on insert/update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION roadmap.fn_validate_proposal_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_required text[];
    v_field     text;
    v_value     text;
BEGIN
    SELECT required_fields INTO v_required
    FROM   roadmap.proposal_type_config
    WHERE  type = NEW.type;

    IF v_required IS NULL THEN
        RETURN NEW;
    END IF;

    FOREACH v_field IN ARRAY v_required LOOP
        EXECUTE format('SELECT ($1).%I::text', v_field) INTO v_value USING NEW;
        IF v_value IS NULL OR trim(v_value) = '' THEN
            RAISE EXCEPTION 'Proposal type "%" requires field "%" to be non-empty',
                NEW.type, v_field
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_proposal_fields
    BEFORE INSERT OR UPDATE ON roadmap.proposal
    FOR EACH ROW
    EXECUTE FUNCTION roadmap.fn_validate_proposal_fields();


-- ---------------------------------------------------------------------------
-- 1g. Trigger: DAG cycle guard on proposal_dependencies
-- Walks ancestors of to_proposal_id; raises if from_proposal_id appears.
-- Only checks 'blocks' and 'depended_by' edges — 'supersedes' and 'relates'
-- are non-directional and don't participate in the queue DAG.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION roadmap.fn_check_dag_cycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_cycle_found bool;
BEGIN
    IF NEW.dependency_type NOT IN ('blocks', 'depended_by') THEN
        RETURN NEW;
    END IF;

    WITH RECURSIVE ancestors AS (
        SELECT to_proposal_id AS node
        FROM   roadmap.proposal_dependencies
        WHERE  from_proposal_id = NEW.to_proposal_id
          AND  dependency_type IN ('blocks','depended_by')
          AND  resolved = false
        UNION
        SELECT d.to_proposal_id
        FROM   roadmap.proposal_dependencies d
        JOIN   ancestors a ON d.from_proposal_id = a.node
        WHERE  d.dependency_type IN ('blocks','depended_by')
          AND  d.resolved = false
    )
    SELECT EXISTS (SELECT 1 FROM ancestors WHERE node = NEW.from_proposal_id)
    INTO   v_cycle_found;

    IF v_cycle_found THEN
        RAISE EXCEPTION
            'Adding dependency from P% to P% would create a cycle in the proposal DAG',
            NEW.from_proposal_id, NEW.to_proposal_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_dag_cycle
    BEFORE INSERT OR UPDATE ON roadmap.proposal_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION roadmap.fn_check_dag_cycle();


-- ---------------------------------------------------------------------------
-- 1h. Trigger: write proposal_event on lease claim/release
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION roadmap.fn_event_lease_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO roadmap.proposal_event (proposal_id, event_type, payload)
        VALUES (
            NEW.proposal_id, 'lease_claimed',
            jsonb_build_object(
                'agent',      NEW.agent_identity,
                'expires_at', NEW.expires_at
            )
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.released_at IS NULL AND NEW.released_at IS NOT NULL THEN
        INSERT INTO roadmap.proposal_event (proposal_id, event_type, payload)
        VALUES (
            NEW.proposal_id, 'lease_released',
            jsonb_build_object(
                'agent',          NEW.agent_identity,
                'release_reason', NEW.release_reason
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_lease_change
    AFTER INSERT OR UPDATE ON roadmap.proposal_lease
    FOR EACH ROW
    EXECUTE FUNCTION roadmap.fn_event_lease_change();


-- =============================================================================
-- PILLAR 2 — WORKFORCE MANAGEMENT
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2a. agent_capability
-- Structured rows replacing opaque skills jsonb on agent_registry.
-- Queryable: find agents with capability X at proficiency >= Y.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.agent_capability (
    id           int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    agent_id     int8        NOT NULL,
    capability   text        NOT NULL,
    proficiency  int4        DEFAULT 3 NOT NULL,
    verified_by  text        NULL,
    verified_at  timestamptz NULL,
    notes        text        NULL,
    created_at   timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT agent_capability_pkey           PRIMARY KEY (id),
    CONSTRAINT agent_capability_agent_cap_key  UNIQUE (agent_id, capability),
    CONSTRAINT agent_capability_proficiency_chk CHECK (proficiency BETWEEN 1 AND 5),
    CONSTRAINT agent_capability_agent_fkey     FOREIGN KEY (agent_id)
        REFERENCES roadmap.agent_registry (id) ON DELETE CASCADE,
    CONSTRAINT agent_capability_verifier_fkey  FOREIGN KEY (verified_by)
        REFERENCES roadmap.agent_registry (agent_identity) ON DELETE SET NULL
);
CREATE INDEX idx_capability_agent      ON roadmap.agent_capability (agent_id);
CREATE INDEX idx_capability_term       ON roadmap.agent_capability (capability);
CREATE INDEX idx_capability_proficiency ON roadmap.agent_capability (capability, proficiency);

COMMENT ON TABLE  roadmap.agent_capability IS 'Structured capability rows; replaces opaque skills jsonb for queryable routing';
COMMENT ON COLUMN roadmap.agent_capability.capability  IS 'Controlled term, e.g. python, architecture-review, security-audit, llm-prompting';
COMMENT ON COLUMN roadmap.agent_capability.proficiency IS '1=novice, 3=competent, 5=expert';


-- ---------------------------------------------------------------------------
-- 2b. agent_workload
-- Current capacity snapshot per agent; one row per agent, upserted by trigger.
-- Used by lease routing to pick the least-loaded capable agent.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.agent_workload (
    agent_id          int8  NOT NULL,
    active_lease_count int4 DEFAULT 0 NOT NULL,
    context_load_score numeric(6,2) DEFAULT 0 NOT NULL,
    updated_at        timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT agent_workload_pkey        PRIMARY KEY (agent_id),
    CONSTRAINT agent_workload_agent_fkey  FOREIGN KEY (agent_id)
        REFERENCES roadmap.agent_registry (id) ON DELETE CASCADE,
    CONSTRAINT agent_workload_count_check CHECK (active_lease_count >= 0)
);
COMMENT ON TABLE  roadmap.agent_workload IS 'Live capacity snapshot per agent; maintained by proposal_lease triggers';
COMMENT ON COLUMN roadmap.agent_workload.context_load_score IS 'Rolling estimate of context pressure (e.g. sum of open proposal body sizes); updated by application';


-- ---------------------------------------------------------------------------
-- 2c. Trigger: keep agent_workload.active_lease_count in sync
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION roadmap.fn_sync_workload()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_agent_id int8;
    v_delta    int4;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT id INTO v_agent_id FROM roadmap.agent_registry
        WHERE agent_identity = NEW.agent_identity;
        v_delta := 1;
    ELSIF TG_OP = 'UPDATE' AND OLD.released_at IS NULL AND NEW.released_at IS NOT NULL THEN
        SELECT id INTO v_agent_id FROM roadmap.agent_registry
        WHERE agent_identity = NEW.agent_identity;
        v_delta := -1;
    ELSE
        RETURN NEW;
    END IF;

    INSERT INTO roadmap.agent_workload (agent_id, active_lease_count, updated_at)
    VALUES (v_agent_id, GREATEST(0, v_delta), now())
    ON CONFLICT (agent_id) DO UPDATE
        SET active_lease_count = GREATEST(0, roadmap.agent_workload.active_lease_count + v_delta),
            updated_at         = now();

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_workload
    AFTER INSERT OR UPDATE ON roadmap.proposal_lease
    FOR EACH ROW
    EXECUTE FUNCTION roadmap.fn_sync_workload();


-- ---------------------------------------------------------------------------
-- 2d. acl — add expires_at and scope_ref
-- ---------------------------------------------------------------------------
ALTER TABLE roadmap.acl
    ADD COLUMN expires_at timestamptz NULL,
    ADD COLUMN scope_ref  text        NULL;

CREATE INDEX idx_acl_expires ON roadmap.acl (expires_at)
    WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN roadmap.acl.expires_at IS 'NULL = permanent grant; non-null = time-bounded permission, cleaned up by scheduled_job';
COMMENT ON COLUMN roadmap.acl.scope_ref  IS 'Optional scoping: proposal display_id, team name, or workflow name — narrows the grant';


-- ---------------------------------------------------------------------------
-- 2e. budget_allowance — add team_id FK
-- ---------------------------------------------------------------------------
ALTER TABLE roadmap.budget_allowance
    ADD COLUMN team_id int8 NULL
        REFERENCES roadmap.team (id) ON DELETE SET NULL;

CREATE INDEX idx_budget_team ON roadmap.budget_allowance (team_id)
    WHERE team_id IS NOT NULL;

COMMENT ON COLUMN roadmap.budget_allowance.team_id IS 'FK to team when scope=team; replaces opaque scope_ref text for team envelopes';


-- =============================================================================
-- PILLAR 3 — EFFICIENCY
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3a. run_log
-- Central run record. run_id is a text PK (UUID or caller-assigned key) so
-- the caller controls its value before any rows are written to spending_log etc.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.run_log (
    run_id        text        NOT NULL,
    agent_identity text       NOT NULL,
    proposal_id   int8        NULL,
    model_name    text        NULL,
    pipeline_stage text       NULL,
    status        text        DEFAULT 'running' NOT NULL,
    input_summary text        NULL,
    error_message text        NULL,
    started_at    timestamptz DEFAULT now() NOT NULL,
    finished_at   timestamptz NULL,
    CONSTRAINT run_log_pkey          PRIMARY KEY (run_id),
    CONSTRAINT run_log_status_check  CHECK (status IN ('running','success','error','cancelled')),
    CONSTRAINT run_log_agent_fkey    FOREIGN KEY (agent_identity)
        REFERENCES roadmap.agent_registry (agent_identity) ON DELETE RESTRICT,
    CONSTRAINT run_log_proposal_fkey FOREIGN KEY (proposal_id)
        REFERENCES roadmap.proposal (id) ON DELETE SET NULL,
    CONSTRAINT run_log_model_fkey    FOREIGN KEY (model_name)
        REFERENCES roadmap.model_metadata (model_name) ON DELETE SET NULL
);
CREATE INDEX idx_run_agent    ON roadmap.run_log (agent_identity);
CREATE INDEX idx_run_proposal ON roadmap.run_log (proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX idx_run_started  ON roadmap.run_log (started_at DESC);
CREATE INDEX idx_run_status   ON roadmap.run_log (status) WHERE status = 'running';

COMMENT ON TABLE  roadmap.run_log IS 'Central run record; run_id anchors spending_log, context_window_log, and cache_write_log';
COMMENT ON COLUMN roadmap.run_log.run_id IS 'Caller-assigned key (UUID recommended); set before writing any child log rows';
COMMENT ON COLUMN roadmap.run_log.input_summary IS 'Short description of what the run was asked to do; not the full prompt';


-- ---------------------------------------------------------------------------
-- 3b. Wire run_id FK on existing log tables
-- run_id was a free text field; now references run_log.
-- SET NULL on delete so old log rows survive run_log cleanup.
-- ---------------------------------------------------------------------------
ALTER TABLE roadmap.spending_log
    ADD CONSTRAINT spending_log_run_fkey
    FOREIGN KEY (run_id) REFERENCES roadmap.run_log (run_id) ON DELETE SET NULL;

ALTER TABLE roadmap.context_window_log
    ADD CONSTRAINT context_window_log_run_fkey
    FOREIGN KEY (run_id) REFERENCES roadmap.run_log (run_id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3c. cache_hit_log — replaces mutable hit_count / cost_saved_usd on
-- cache_write_log. Each cache hit becomes an append-only row.
-- Aggregates are derived; no race condition possible.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.cache_hit_log (
    id              int8          GENERATED ALWAYS AS IDENTITY NOT NULL,
    cache_write_id  int8          NOT NULL,
    run_id          text          NULL,
    agent_identity  text          NOT NULL,
    tokens_read     int4          NOT NULL,
    cost_saved_usd  numeric(14,6) NOT NULL,
    hit_at          timestamptz   DEFAULT now() NOT NULL,
    CONSTRAINT cache_hit_log_pkey             PRIMARY KEY (id),
    CONSTRAINT cache_hit_log_write_fkey       FOREIGN KEY (cache_write_id)
        REFERENCES roadmap.cache_write_log (id) ON DELETE CASCADE,
    CONSTRAINT cache_hit_log_run_fkey         FOREIGN KEY (run_id)
        REFERENCES roadmap.run_log (run_id) ON DELETE SET NULL,
    CONSTRAINT cache_hit_log_agent_fkey       FOREIGN KEY (agent_identity)
        REFERENCES roadmap.agent_registry (agent_identity) ON DELETE RESTRICT
);
CREATE INDEX idx_cache_hit_write ON roadmap.cache_hit_log (cache_write_id);
CREATE INDEX idx_cache_hit_agent ON roadmap.cache_hit_log (agent_identity);
CREATE INDEX idx_cache_hit_at    ON roadmap.cache_hit_log (hit_at DESC);

COMMENT ON TABLE  roadmap.cache_hit_log IS 'Append-only hit log per cache entry; replaces mutable hit_count/cost_saved_usd on cache_write_log';
COMMENT ON COLUMN roadmap.cache_hit_log.cost_saved_usd IS 'Saving for this specific hit = tokens_read * (normal_cost - cache_read_cost)';

-- Drop the now-redundant mutable columns from cache_write_log
ALTER TABLE roadmap.cache_write_log
    DROP COLUMN hit_count,
    DROP COLUMN cost_saved_usd,
    DROP COLUMN tokens_read,
    ADD COLUMN run_id text NOT NULL,
    DROP COLUMN last_hit_at;

COMMENT ON TABLE roadmap.cache_write_log IS 'Immutable record of a cache write event; hits tracked in cache_hit_log';

ALTER TABLE roadmap.cache_write_log
    ADD CONSTRAINT cache_write_log_run_fkey
    FOREIGN KEY (run_id) REFERENCES roadmap.run_log (run_id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3d. prompt_template
-- Versioned system prompt and context preamble store.
-- Agents retrieve highest active version matching their type + stage.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.prompt_template (
    id             int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    name           text        NOT NULL,
    version        int4        NOT NULL,
    proposal_type  text        NULL,   -- NULL = applies to all types
    pipeline_stage text        NULL,   -- NULL = applies to all stages
    content        text        NOT NULL,
    description    text        NULL,
    is_active      bool        DEFAULT true NOT NULL,
    created_by     text        NOT NULL,
    created_at     timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT prompt_template_pkey         PRIMARY KEY (id),
    CONSTRAINT prompt_template_name_ver_key UNIQUE (name, version),
    CONSTRAINT prompt_template_author_fkey  FOREIGN KEY (created_by)
        REFERENCES roadmap.agent_registry (agent_identity) ON DELETE RESTRICT
);
CREATE INDEX idx_prompt_template_lookup ON roadmap.prompt_template
    (proposal_type, pipeline_stage, is_active, version DESC);

COMMENT ON TABLE  roadmap.prompt_template IS 'Versioned system prompts and context preambles; agents resolve by type+stage, highest active version wins';
COMMENT ON COLUMN roadmap.prompt_template.proposal_type  IS 'NULL = default for all types; specific type overrides the default';
COMMENT ON COLUMN roadmap.prompt_template.pipeline_stage IS 'NULL = applies to all stages; specific stage overrides';


-- ---------------------------------------------------------------------------
-- 3e. embedding_index_registry
-- Tracks model + refresh timestamp for every body_vector column.
-- Stale embeddings are detectable after a model upgrade.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.embedding_index_registry (
    id            int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    table_name    text        NOT NULL,
    row_id        int8        NOT NULL,
    model_name    text        NOT NULL,
    embedding_dim int4        NOT NULL,
    refreshed_at  timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT embedding_index_registry_pkey         PRIMARY KEY (id),
    CONSTRAINT embedding_index_registry_table_row_key UNIQUE (table_name, row_id),
    CONSTRAINT embedding_index_registry_model_fkey   FOREIGN KEY (model_name)
        REFERENCES roadmap.model_metadata (model_name) ON DELETE RESTRICT
);
CREATE INDEX idx_embed_table   ON roadmap.embedding_index_registry (table_name);
CREATE INDEX idx_embed_model   ON roadmap.embedding_index_registry (model_name);
CREATE INDEX idx_embed_refresh ON roadmap.embedding_index_registry (refreshed_at);

COMMENT ON TABLE  roadmap.embedding_index_registry IS 'Tracks which model produced each body_vector and when; stale rows indicate a re-embed is needed after a model upgrade';
COMMENT ON COLUMN roadmap.embedding_index_registry.table_name IS 'e.g. proposal, proposal_discussions, agent_memory';


-- =============================================================================
-- PILLAR 4 — UTILITY
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4a. scheduled_job
-- Registry and execution log for all maintenance jobs.
-- Covers: lease reaper, memory TTL purge, agency_profile sync,
-- embedding refresh, ACL expiry cleanup, webhook dispatcher.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.scheduled_job (
    id             int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    job_name       text        NOT NULL,
    description    text        NULL,
    cron_expr      text        NOT NULL,
    is_enabled     bool        DEFAULT true NOT NULL,
    last_run_at    timestamptz NULL,
    last_status    text        NULL,
    last_error     text        NULL,
    last_duration_ms int4      NULL,
    next_run_at    timestamptz NULL,
    run_count      int4        DEFAULT 0 NOT NULL,
    CONSTRAINT scheduled_job_pkey         PRIMARY KEY (id),
    CONSTRAINT scheduled_job_name_key     UNIQUE (job_name),
    CONSTRAINT scheduled_job_status_check CHECK (
        last_status IS NULL OR last_status IN ('ok','error','running','skipped'))
);
COMMENT ON TABLE  roadmap.scheduled_job IS 'Registry and last-run state for all background maintenance jobs';
COMMENT ON COLUMN roadmap.scheduled_job.cron_expr IS 'Standard cron expression, e.g. 0 * * * * for hourly';

INSERT INTO roadmap.scheduled_job (job_name, description, cron_expr) VALUES
    ('lease_reaper',         'Release expired proposal leases',                    '*/15 * * * *'),
    ('memory_ttl_purge',     'Delete agent_memory rows past expires_at',           '0 * * * *'),
    ('agency_profile_sync',  'Re-sync agent profiles from GitHub',                 '0 6 * * *'),
    ('embedding_refresh',    'Re-embed rows whose model version is stale',         '0 2 * * *'),
    ('acl_expiry_cleanup',   'Remove ACL rows past expires_at',                    '0 1 * * *'),
    ('budget_rollover',      'Reset or roll over monthly budget_allowance caps',   '0 0 1 * *'),
    ('webhook_dispatcher',   'Deliver pending proposal_event rows to subscribers', '* * * * *');


-- ---------------------------------------------------------------------------
-- 4b. webhook_subscription
-- External systems register here to receive proposal_event deliveries.
-- The webhook_dispatcher scheduled job polls proposal_event.dispatched_at IS NULL
-- and POSTs to each matching subscriber.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.webhook_subscription (
    id              int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    label           text        NOT NULL,
    endpoint_url    text        NOT NULL,
    event_types     text[]      NOT NULL,
    secret_hash     text        NULL,   -- HMAC-SHA256 of shared secret; never store plaintext
    is_active       bool        DEFAULT true NOT NULL,
    last_delivery_at timestamptz NULL,
    last_status     text        NULL,
    failure_count   int4        DEFAULT 0 NOT NULL,
    created_by      text        NOT NULL,
    created_at      timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT webhook_subscription_pkey       PRIMARY KEY (id),
    CONSTRAINT webhook_subscription_url_key    UNIQUE (endpoint_url),
    CONSTRAINT webhook_subscription_agent_fkey FOREIGN KEY (created_by)
        REFERENCES roadmap.agent_registry (agent_identity) ON DELETE RESTRICT
);
CREATE INDEX idx_webhook_active ON roadmap.webhook_subscription (is_active)
    WHERE is_active = true;

COMMENT ON TABLE  roadmap.webhook_subscription IS 'External subscribers to proposal_event; delivered by webhook_dispatcher job';
COMMENT ON COLUMN roadmap.webhook_subscription.secret_hash  IS 'Store only the HMAC hash; plaintext secret lives only with the subscriber';
COMMENT ON COLUMN roadmap.webhook_subscription.failure_count IS 'Dispatcher increments on delivery failure; subscriber auto-disabled at threshold';
COMMENT ON COLUMN roadmap.webhook_subscription.event_types  IS 'Array of event_type values from proposal_event this subscriber wants, e.g. {status_changed,decision_made}';


-- ---------------------------------------------------------------------------
-- 4c. audit_log
-- Cross-entity audit trail for non-proposal mutations.
-- Triggered on: acl, spending_caps, agent_registry, resource_allocation.
-- proposal.audit jsonb handles proposal-specific history separately.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.audit_log (
    id          int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    entity_type text        NOT NULL,
    entity_id   text        NOT NULL,
    action      text        NOT NULL,
    changed_by  text        NULL,
    changed_at  timestamptz DEFAULT now() NOT NULL,
    before_json jsonb       NULL,
    after_json  jsonb       NULL,
    CONSTRAINT audit_log_pkey        PRIMARY KEY (id),
    CONSTRAINT audit_log_action_check CHECK (action IN ('insert','update','delete'))
);
CREATE INDEX idx_audit_entity  ON roadmap.audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_changed ON roadmap.audit_log (changed_at DESC);
CREATE INDEX idx_audit_who     ON roadmap.audit_log (changed_by) WHERE changed_by IS NOT NULL;

COMMENT ON TABLE  roadmap.audit_log IS 'Cross-entity before/after audit trail; covers ACL, budget, agent, and resource changes';
COMMENT ON COLUMN roadmap.audit_log.entity_id IS 'PK of the affected row cast to text (int8 or text PK both fit)';


-- ---------------------------------------------------------------------------
-- 4d. Trigger: fn_audit_sensitive_tables
-- Fires on acl, spending_caps, agent_registry, resource_allocation.
-- Uses to_jsonb(OLD/NEW) — no per-column enumeration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION roadmap.fn_audit_sensitive_tables()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_entity_id text;
    v_before    jsonb;
    v_after     jsonb;
    v_action    text;
BEGIN
    v_action := lower(TG_OP);

    IF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id::text;
        v_before    := to_jsonb(OLD);
        v_after     := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_entity_id := NEW.id::text;
        v_before    := NULL;
        v_after     := to_jsonb(NEW);
    ELSE
        v_entity_id := NEW.id::text;
        v_before    := to_jsonb(OLD);
        v_after     := to_jsonb(NEW);
    END IF;

    INSERT INTO roadmap.audit_log
        (entity_type, entity_id, action, changed_by, before_json, after_json)
    VALUES (
        TG_TABLE_NAME,
        v_entity_id,
        v_action,
        COALESCE(current_setting('app.agent_identity', true), session_user),
        v_before,
        v_after
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_acl
    AFTER INSERT OR UPDATE OR DELETE ON roadmap.acl
    FOR EACH ROW EXECUTE FUNCTION roadmap.fn_audit_sensitive_tables();

CREATE TRIGGER trg_audit_spending_caps
    AFTER INSERT OR UPDATE OR DELETE ON roadmap.spending_caps
    FOR EACH ROW EXECUTE FUNCTION roadmap.fn_audit_sensitive_tables();

CREATE TRIGGER trg_audit_agent_registry
    AFTER INSERT OR UPDATE OR DELETE ON roadmap.agent_registry
    FOR EACH ROW EXECUTE FUNCTION roadmap.fn_audit_sensitive_tables();

CREATE TRIGGER trg_audit_resource_allocation
    AFTER INSERT OR UPDATE OR DELETE ON roadmap.resource_allocation
    FOR EACH ROW EXECUTE FUNCTION roadmap.fn_audit_sensitive_tables();


-- ---------------------------------------------------------------------------
-- 4e. notification_delivery
-- Per-surface delivery receipt child of notification.
-- Replaces the single is_read / read_at on notification.
-- ---------------------------------------------------------------------------
CREATE TABLE roadmap.notification_delivery (
    id              int8        GENERATED ALWAYS AS IDENTITY NOT NULL,
    notification_id int8        NOT NULL,
    surface         text        NOT NULL,
    delivered_at    timestamptz NULL,
    acknowledged_at timestamptz NULL,
    failure_reason  text        NULL,
    CONSTRAINT notification_delivery_pkey          PRIMARY KEY (id),
    CONSTRAINT notification_delivery_notif_surf_key UNIQUE (notification_id, surface),
    CONSTRAINT notification_delivery_surface_check  CHECK (surface IN ('tui','web','mobile')),
    CONSTRAINT notification_delivery_notif_fkey    FOREIGN KEY (notification_id)
        REFERENCES roadmap.notification (id) ON DELETE CASCADE
);
CREATE INDEX idx_notif_delivery_notif     ON roadmap.notification_delivery (notification_id);
CREATE INDEX idx_notif_delivery_undelivered ON roadmap.notification_delivery (notification_id)
    WHERE delivered_at IS NULL;

COMMENT ON TABLE  roadmap.notification_delivery IS 'Per-surface delivery receipt; a notification can be delivered to web but pending on mobile';
COMMENT ON COLUMN roadmap.notification_delivery.acknowledged_at IS 'Set when user explicitly dismisses the notification on that surface';


-- Migrate existing is_read / read_at data into notification_delivery,
-- then drop the now-redundant columns from notification.
-- (Assuming notification.surface already encodes the target)
INSERT INTO roadmap.notification_delivery
    (notification_id, surface, delivered_at, acknowledged_at)
SELECT id,
       CASE WHEN surface = 'all' THEN 'web' ELSE surface END,
       CASE WHEN is_read THEN read_at ELSE NULL END,
       CASE WHEN is_read THEN read_at ELSE NULL END
FROM roadmap.notification
WHERE surface != 'all'
ON CONFLICT DO NOTHING;

ALTER TABLE roadmap.notification
    DROP COLUMN is_read,
    DROP COLUMN read_at;

-- Add source event linkage
ALTER TABLE roadmap.notification
    ADD COLUMN source_event_id int8 NULL
        REFERENCES roadmap.proposal_event (id) ON DELETE SET NULL;

COMMENT ON COLUMN roadmap.notification.source_event_id IS 'Links notification back to the proposal_event that generated it';


-- =============================================================================
-- NEW / REVISED VIEWS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- v_undelivered_notifications
-- Surfaces messages where no successful delivery exists for any surface.
-- Used by the push dispatcher and dead-letter monitor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW roadmap.v_undelivered_notifications AS
SELECT
    n.id,
    n.recipient,
    n.surface         AS target_surface,
    n.event_type,
    n.payload,
    n.proposal_id,
    n.created_at,
    nd.surface        AS delivery_surface,
    nd.delivered_at,
    nd.failure_reason
FROM roadmap.notification n
LEFT JOIN roadmap.notification_delivery nd
       ON nd.notification_id = n.id
      AND nd.delivered_at IS NOT NULL
WHERE nd.notification_id IS NULL
   OR nd.failure_reason  IS NOT NULL;

COMMENT ON VIEW roadmap.v_undelivered_notifications IS 'Notifications with no successful delivery on any surface; polled by push dispatcher';


-- ---------------------------------------------------------------------------
-- v_capable_agents
-- Finds available agents matching a capability + minimum proficiency.
-- Used by lease routing to pick the least-loaded qualified agent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW roadmap.v_capable_agents AS
SELECT
    ar.id,
    ar.agent_identity,
    ar.agent_type,
    ar.status,
    ac.capability,
    ac.proficiency,
    COALESCE(aw.active_lease_count, 0) AS active_leases,
    COALESCE(aw.context_load_score, 0) AS context_load
FROM roadmap.agent_registry ar
JOIN roadmap.agent_capability ac   ON ac.agent_id = ar.id
LEFT JOIN roadmap.agent_workload aw ON aw.agent_id = ar.id
WHERE ar.status = 'active';

COMMENT ON VIEW roadmap.v_capable_agents IS
    'Active agents with their capabilities and current workload; '
    'filter on capability + proficiency, order by active_leases ASC to route leases';


-- ---------------------------------------------------------------------------
-- v_pending_events
-- Undispatched outbox rows with subscriber counts — used by webhook_dispatcher.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW roadmap.v_pending_events AS
SELECT
    pe.id,
    pe.proposal_id,
    pe.event_type,
    pe.payload,
    pe.created_at,
    COUNT(ws.id) AS subscriber_count
FROM roadmap.proposal_event pe
JOIN roadmap.webhook_subscription ws
  ON ws.is_active = true
 AND pe.event_type = ANY(ws.event_types)
WHERE pe.dispatched_at IS NULL
GROUP BY pe.id, pe.proposal_id, pe.event_type, pe.payload, pe.created_at;

COMMENT ON VIEW roadmap.v_pending_events IS 'Undispatched outbox events with active subscriber count; polled by webhook_dispatcher job';


-- ---------------------------------------------------------------------------
-- v_stale_embeddings
-- Rows whose body_vector was produced by a model that is no longer active,
-- or that haven't been refreshed in the past 30 days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW roadmap.v_stale_embeddings AS
SELECT
    er.table_name,
    er.row_id,
    er.model_name,
    er.refreshed_at,
    mm.is_active       AS model_is_active,
    now() - er.refreshed_at AS age
FROM roadmap.embedding_index_registry er
JOIN roadmap.model_metadata mm ON mm.model_name = er.model_name
WHERE mm.is_active = false
   OR er.refreshed_at < now() - INTERVAL '30 days';

COMMENT ON VIEW roadmap.v_stale_embeddings IS 'Embeddings from inactive models or not refreshed in 30 days; consumed by embedding_refresh job';


-- ---------------------------------------------------------------------------
-- v_run_summary
-- Cross-table run summary joining run_log with aggregated child logs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW roadmap.v_run_summary AS
SELECT
    r.run_id,
    r.agent_identity,
    r.proposal_id,
    r.model_name,
    r.pipeline_stage,
    r.status,
    r.started_at,
    r.finished_at,
    r.finished_at - r.started_at                       AS duration,
    COALESCE(ctx.total_tokens, 0)                       AS total_tokens,
    COALESCE(ctx.was_truncated, false)                  AS was_truncated,
    COALESCE(sl.cost_usd, 0)                            AS cost_usd,
    COALESCE(ch.cache_hits, 0)                          AS cache_hits,
    COALESCE(ch.cache_saved_usd, 0)                     AS cache_saved_usd
FROM roadmap.run_log r
LEFT JOIN LATERAL (
    SELECT SUM(total_tokens) AS total_tokens,
           bool_or(was_truncated) AS was_truncated
    FROM   roadmap.context_window_log
    WHERE  run_id = r.run_id
) ctx ON true
LEFT JOIN LATERAL (
    SELECT SUM(cost_usd) AS cost_usd
    FROM   roadmap.spending_log
    WHERE  run_id = r.run_id
) sl ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*)         AS cache_hits,
           SUM(cost_saved_usd) AS cache_saved_usd
    FROM   roadmap.cache_hit_log chl
    JOIN   roadmap.cache_write_log cwl ON cwl.id = chl.cache_write_id
    WHERE  cwl.run_id = r.run_id
) ch ON true;

COMMENT ON VIEW roadmap.v_run_summary IS 'Per-run rollup joining tokens, cost, and cache savings; replaces ad-hoc cross-table joins on run_id';

-- ---------------------------------------------------------------------------
-- Add a PostgreSQL LISTEN/NOTIFY trigger directly onto the proposal_event table.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION roadmap.fn_notify_proposal_event() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('roadmap_events', jsonb_build_object('event_id', NEW.id, 'type', NEW.event_type, 'proposal', NEW.proposal_id)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_event AFTER INSERT ON roadmap.proposal_event FOR EACH ROW EXECUTE FUNCTION roadmap.fn_notify_proposal_event();
-- =============================================================================
-- END OF GAP REMEDIATION — roadmap schema v2 additions
-- =============================================================================
