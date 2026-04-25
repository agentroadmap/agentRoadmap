# AgentHive Control Database DDL Sketch

**Status**: Architecture sketch for P410/P411 implementation  
**Scope**: Schema-qualified DDL for `agenthive_control` database across 10 schemas  
**Target**: Single Postgres instance with dedicated control DB + per-project databases  

---

## Schema: control_identity

Humans, service users, API clients, sessions, and cross-platform channel identity mapping.

```sql
-- control_identity.human_user
-- Human users with identity, email, authentication, and profile
CREATE TABLE control_identity.human_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    avatar_url TEXT,
    password_hash VARCHAR(255),  -- bcrypt hashed; NULL if using SSO/federated
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);
CREATE INDEX idx_human_user_email ON control_identity.human_user(email) WHERE status = 'active';
CREATE INDEX idx_human_user_updated_at ON control_identity.human_user(updated_at DESC);

-- control_identity.service_user
-- Service accounts and system users with API permissions, no password
CREATE TABLE control_identity.service_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    service_type VARCHAR(50) NOT NULL  -- mcp-server, orchestrator, scheduler, tool-agent
        CHECK (service_type IN ('mcp-server', 'orchestrator', 'scheduler', 'tool-agent', 'external-service')),
    created_by_user_id UUID REFERENCES control_identity.human_user(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled', 'deprecated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_service_user_type ON control_identity.service_user(service_type);

-- control_identity.api_key
-- API keys issued to human users and service users for external integrations
CREATE TABLE control_identity.api_key (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('human', 'service')),
    owner_id UUID NOT NULL,  -- FK either to human_user or service_user; no constraint here for flexibility
    key_hash VARCHAR(255) NOT NULL UNIQUE,  -- bcrypt hash of the full key
    key_prefix VARCHAR(16) NOT NULL,  -- first 16 chars shown to owner
    description VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb  -- permissions, scopes, restrictions
);
CREATE INDEX idx_api_key_hash ON control_identity.api_key(key_hash);
CREATE INDEX idx_api_key_owner ON control_identity.api_key(owner_type, owner_id) WHERE status = 'active';
CREATE INDEX idx_api_key_expires ON control_identity.api_key(expires_at) WHERE status = 'active';

-- control_identity.session
-- Login sessions for human users with token, expiration, and device tracking
CREATE TABLE control_identity.session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    human_user_id UUID NOT NULL REFERENCES control_identity.human_user(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(255) NOT NULL UNIQUE,  -- bcrypt hash
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb  -- device, location, geo
);
CREATE INDEX idx_session_user ON control_identity.session(human_user_id) WHERE status = 'active';
CREATE INDEX idx_session_expires ON control_identity.session(expires_at);
CREATE INDEX idx_session_last_activity ON control_identity.session(last_activity_at DESC);

-- control_identity.channel_identity
-- Maps external platform identities (Discord, Slack, GitHub, etc.) to internal user identities
-- Enables multi-platform agent identity bridging
CREATE TABLE control_identity.channel_identity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel VARCHAR(50) NOT NULL  -- discord, slack, github, matrix
        CHECK (channel IN ('discord', 'slack', 'github', 'matrix', 'email')),
    external_id VARCHAR(255) NOT NULL,  -- Discord user ID, GitHub login, etc.
    external_handle VARCHAR(255),  -- Display name on the external platform
    human_user_id UUID REFERENCES control_identity.human_user(id) ON DELETE SET NULL,
    agent_identity VARCHAR(255),  -- For non-human agents; e.g., 'hermes/worker-123'
    trust_tier VARCHAR(50) NOT NULL DEFAULT 'restricted'
        CHECK (trust_tier IN ('authority', 'trusted', 'known', 'restricted', 'blocked')),
    verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES control_identity.human_user(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,  -- Temporary bindings
    
    UNIQUE (channel, external_id),
    CONSTRAINT unique_binding CHECK (
        (human_user_id IS NOT NULL AND agent_identity IS NULL) OR
        (human_user_id IS NULL AND agent_identity IS NOT NULL)
    )
);
CREATE INDEX idx_channel_identity_user ON control_identity.channel_identity(human_user_id) WHERE human_user_id IS NOT NULL;
CREATE INDEX idx_channel_identity_agent ON control_identity.channel_identity(agent_identity) WHERE agent_identity IS NOT NULL;
CREATE INDEX idx_channel_identity_channel_external ON control_identity.channel_identity(channel, external_id);
```

---

## Schema: control_runtime

Host registry, systemd service registry, process health/heartbeats, host model policy, and service leases.

```sql
-- control_runtime.host
-- Physical or virtual hosts where agents and services run
CREATE TABLE control_runtime.host (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id VARCHAR(255) NOT NULL UNIQUE,  -- hostname or machine identifier
    host_name VARCHAR(255) NOT NULL,
    machine_label VARCHAR(255),  -- provider label (e.g., 'aws:us-west-2:t3.large')
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'draining', 'offline', 'decommissioned')),
    service_user_ref VARCHAR(255),  -- Linux user for service execution
    worktree_root TEXT,  -- Base path for git worktrees on this host
    allowed_route_providers TEXT NOT NULL DEFAULT 'anthropic,openai,google,xiaomi,nous'
        CHECK (allowed_route_providers ~ '^[a-z,]+$'),  -- CSV list
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb  -- resource_limits, network, region
);
CREATE INDEX idx_host_status ON control_runtime.host(status);
CREATE INDEX idx_host_last_seen ON control_runtime.host(last_seen_at DESC);
CREATE INDEX idx_host_updated_at ON control_runtime.host(updated_at DESC);

-- control_runtime.systemd_service
-- Registered systemd services managed by AgentHive
CREATE TABLE control_runtime.systemd_service (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES control_runtime.host(id),
    service_name VARCHAR(255) NOT NULL,  -- e.g., 'agenthive-mcp'
    service_type VARCHAR(50) NOT NULL  -- mcp-server, orchestrator, offer-provider, scheduler
        CHECK (service_type IN ('mcp-server', 'orchestrator', 'offer-provider', 'scheduler', 'monitor', 'tool-agent-host')),
    executable_path TEXT NOT NULL,
    cli_args TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'inactive'
        CHECK (status IN ('inactive', 'running', 'failed', 'restarting', 'dead-but-subsists')),
    created_by_user_id UUID REFERENCES control_identity.human_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked_at TIMESTAMP WITH TIME ZONE,
    check_interval_seconds INTEGER DEFAULT 30,
    auto_restart BOOLEAN DEFAULT TRUE,
    restart_policy VARCHAR(50) DEFAULT 'always'
        CHECK (restart_policy IN ('no', 'always', 'on-failure', 'unless-stopped')),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    UNIQUE (host_id, service_name)
);
CREATE INDEX idx_systemd_service_host_status ON control_runtime.systemd_service(host_id, status);
CREATE INDEX idx_systemd_service_type ON control_runtime.systemd_service(service_type);

-- control_runtime.process_heartbeat
-- Health signals from running processes (agents, services)
CREATE TABLE control_runtime.process_heartbeat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES control_runtime.systemd_service(id),
    agent_identity VARCHAR(255),  -- For non-service processes; e.g., 'hermes/worker-123'
    host_id UUID NOT NULL REFERENCES control_runtime.host(id),
    process_id INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'healthy'
        CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'dead')),
    cpu_percent NUMERIC(5,2),
    memory_mb NUMERIC(10,2),
    uptime_seconds BIGINT,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE NOT NULL,
    error_message TEXT,
    
    -- Older heartbeats are purged; keep only recent ~1000 per process
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_process_heartbeat_service_recent ON control_runtime.process_heartbeat(service_id, last_heartbeat_at DESC);
CREATE INDEX idx_process_heartbeat_agent_recent ON control_runtime.process_heartbeat(agent_identity, last_heartbeat_at DESC) WHERE agent_identity IS NOT NULL;
CREATE INDEX idx_process_heartbeat_status ON control_runtime.process_heartbeat(status);

-- control_runtime.host_model_policy
-- Per-host restrictions on which model routes can spawn on which hosts
CREATE TABLE control_runtime.host_model_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES control_runtime.host(id),
    route_provider VARCHAR(50) NOT NULL  -- anthropic, openai, google, xiaomi, nous, github
        CHECK (route_provider IN ('anthropic', 'openai', 'google', 'xiaomi', 'nous', 'github', 'local')),
    allowed BOOLEAN NOT NULL DEFAULT FALSE,
    priority INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (host_id, route_provider)
);
CREATE INDEX idx_host_model_policy_host_allowed ON control_runtime.host_model_policy(host_id, allowed);

-- control_runtime.service_lease
-- Lease/lock for exclusive access to service operations (e.g., only one orchestrator active per host)
CREATE TABLE control_runtime.service_lease (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES control_runtime.systemd_service(id),
    holder_identity VARCHAR(255) NOT NULL,  -- Agent or service holding the lock
    lease_type VARCHAR(50) NOT NULL  -- exclusive, shared
        CHECK (lease_type IN ('exclusive', 'shared')),
    acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    released_at TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    
    UNIQUE (service_id, holder_identity) WHERE released_at IS NULL
);
CREATE INDEX idx_service_lease_service_active ON control_runtime.service_lease(service_id) WHERE released_at IS NULL;
CREATE INDEX idx_service_lease_expires ON control_runtime.service_lease(expires_at) WHERE released_at IS NULL;
```

---

## Schema: control_project

Project registry with database DSN fields, git bindings, and project subscriptions.

```sql
-- control_project.project
-- Registry of all projects in the AgentHive system
CREATE TABLE control_project.project (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(255) NOT NULL UNIQUE,  -- alphanumeric slug, e.g., 'agenthive_main', 'project_alpha'
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'archived', 'deleted')),
    
    -- Project database location (may be same host, different host, or external)
    db_name VARCHAR(255) NOT NULL,
    db_host VARCHAR(255) DEFAULT '127.0.0.1',
    db_port INTEGER DEFAULT 5432,
    db_user_ref VARCHAR(255),  -- Credential reference; e.g., 'control_identity.service_user.name'
    db_password_ref VARCHAR(255),  -- Reference to encrypted credential storage
    
    -- Git configuration
    git_repo_id UUID,  -- FK to control_git.git_repo(id); can be NULL for non-git projects
    git_root TEXT,  -- Local path to cloned repo
    worktree_root TEXT,  -- Base path for per-agent worktrees
    default_branch VARCHAR(255) DEFAULT 'main',
    
    -- Platform integration
    discord_channel_id VARCHAR(255),
    slack_channel_id VARCHAR(255),
    
    -- Metadata
    created_by_user_id UUID REFERENCES control_identity.human_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb  -- custom fields, tags, labels
);
CREATE INDEX idx_project_status ON control_project.project(status);
CREATE INDEX idx_project_updated_at ON control_project.project(updated_at DESC);
CREATE INDEX idx_project_git_repo ON control_project.project(git_repo_id);

-- control_project.project_subscription
-- Which agencies and workers are allowed to work on which projects
CREATE TABLE control_project.project_subscription (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES control_project.project(id) ON DELETE CASCADE,
    agency_identity VARCHAR(255) NOT NULL,  -- e.g., 'hermes/agency-xiaomi'
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'revoked')),
    max_concurrent_claims INTEGER DEFAULT 5,  -- Ceiling on simultaneous work offers for this agency
    required_trust_tier VARCHAR(50),  -- NULL=all; or 'authority', 'trusted', 'known'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    UNIQUE (project_id, agency_identity)
);
CREATE INDEX idx_project_subscription_project ON control_project.project_subscription(project_id, status);
CREATE INDEX idx_project_subscription_agency ON control_project.project_subscription(agency_identity);

-- control_project.project_access_log
-- Audit log of which agents/users accessed which projects
CREATE TABLE control_project.project_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES control_project.project(id),
    accessor_type VARCHAR(20) NOT NULL CHECK (accessor_type IN ('human', 'agent', 'service')),
    accessor_identity VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL  -- read, write, admin, deploy, etc.
        CHECK (action IN ('read', 'write', 'admin', 'deploy', 'delete', 'exec')),
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    status VARCHAR(20) NOT NULL DEFAULT 'allowed'
        CHECK (status IN ('allowed', 'denied', 'audit-only'))
);
CREATE INDEX idx_project_access_log_project_time ON control_project.project_access_log(project_id, accessed_at DESC);
```

---

## Schema: control_git

Git repository registry, worktree tracking, and branch policy.

```sql
-- control_git.git_repo
-- Git repository registry (GitHub, GitLab, Gitea, local)
CREATE TABLE control_git.git_repo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id VARCHAR(255) NOT NULL UNIQUE,  -- Internal ID for the repo
    provider VARCHAR(50) NOT NULL  -- github, gitlab, gitea, local
        CHECK (provider IN ('github', 'gitlab', 'gitea', 'local')),
    remote_url TEXT NOT NULL,  -- e.g., 'git@github.com:org/repo.git' or 'file:///data/code/AgentHive'
    local_root TEXT NOT NULL UNIQUE,  -- Local filesystem path where repo is cloned
    default_branch VARCHAR(255) DEFAULT 'main',
    project_id UUID REFERENCES control_project.project(id) ON DELETE SET NULL,  -- NULL for shared repos
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'deleted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(20) DEFAULT 'idle'
        CHECK (sync_status IN ('idle', 'syncing', 'failed')),
    metadata JSONB DEFAULT '{}'::jsonb  -- credentials_ref, webhooks, ci_status
);
CREATE INDEX idx_git_repo_provider_status ON control_git.git_repo(provider, status);
CREATE INDEX idx_git_repo_project ON control_git.git_repo(project_id);

-- control_git.worktree
-- Per-agent isolated git working directories
CREATE TABLE control_git.worktree (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    git_repo_id UUID NOT NULL REFERENCES control_git.git_repo(id) ON DELETE CASCADE,
    agent_identity VARCHAR(255) NOT NULL,  -- e.g., 'hermes/worker-123'
    path TEXT NOT NULL UNIQUE,  -- Absolute path; e.g., '/data/code/worktree/xiaomi/branch-name'
    branch_name VARCHAR(255) NOT NULL,  -- HEAD branch in this worktree
    created_by_identity VARCHAR(255),  -- Dispatching agent or user
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'idle', 'stale', 'abandoned')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,  -- Clean up old worktrees
    proposal_id UUID,  -- Associated proposal being worked on
    dispatch_id UUID,  -- Associated dispatch
    metadata JSONB DEFAULT '{}'::jsonb  -- uncommitted changes, stash, rebase state
);
CREATE INDEX idx_worktree_agent ON control_git.worktree(agent_identity);
CREATE INDEX idx_worktree_repo_branch ON control_git.worktree(git_repo_id, branch_name);
CREATE INDEX idx_worktree_status ON control_git.worktree(status);
CREATE INDEX idx_worktree_expires ON control_git.worktree(expires_at) WHERE status != 'active';

-- control_git.branch_policy
-- Policies for branch naming, protection, and merge requirements
CREATE TABLE control_git.branch_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    git_repo_id UUID NOT NULL REFERENCES control_git.git_repo(id) ON DELETE CASCADE,
    branch_pattern VARCHAR(255) NOT NULL,  -- e.g., 'main', 'release/*', 'hotfix/*'
    protect_from_deletion BOOLEAN DEFAULT FALSE,
    require_pr_review BOOLEAN DEFAULT FALSE,
    min_reviewers INTEGER DEFAULT 0,
    require_status_checks BOOLEAN DEFAULT FALSE,
    allowed_to_merge_roles TEXT DEFAULT ''  -- CSV: 'maintainer,admin'
        CHECK (allowed_to_merge_roles ~ '^[a-z,]*$'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (git_repo_id, branch_pattern)
);
```

---

## Schema: control_workforce

Agencies, workers, capabilities, trust, and authority chains.

```sql
-- control_workforce.agency
-- Stable organizational units of agents sharing infrastructure and identity
CREATE TABLE control_workforce.agency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_identity VARCHAR(255) NOT NULL UNIQUE,  -- e.g., 'hermes/agency-xiaomi'
    provider_family VARCHAR(50) NOT NULL  -- hermes, codex, claude, copilot
        CHECK (provider_family IN ('hermes', 'codex', 'claude', 'copilot', 'custom')),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'deactivated')),
    host_affinity VARCHAR(255),  -- Preferred host; e.g., 'hermes'
    max_concurrent_claims INTEGER DEFAULT 10,
    default_worktree_policy VARCHAR(50) DEFAULT 'isolated'
        CHECK (default_worktree_policy IN ('isolated', 'shared', 'ephemeral')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb  -- contact, rate_limits, preferences
);
CREATE INDEX idx_agency_status ON control_workforce.agency(status);
CREATE INDEX idx_agency_provider ON control_workforce.agency(provider_family);

-- control_workforce.worker
-- Ephemeral per-dispatch worker identities (short-lived execution personas)
CREATE TABLE control_workforce.worker (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_identity VARCHAR(255) NOT NULL UNIQUE,  -- e.g., 'hermes/worker-11099'
    agency_id UUID NOT NULL REFERENCES control_workforce.agency(id) ON DELETE CASCADE,
    dispatch_id UUID,  -- FK to control_dispatch.squad_dispatch(id) or similar
    status VARCHAR(20) NOT NULL DEFAULT 'initialized'
        CHECK (status IN ('initialized', 'active', 'paused', 'completed', 'failed', 'terminated')),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb  -- capabilities advertised at claim time, run_id
);
CREATE INDEX idx_worker_agency ON control_workforce.worker(agency_id);
CREATE INDEX idx_worker_dispatch ON control_workforce.worker(dispatch_id);
CREATE INDEX idx_worker_status ON control_workforce.worker(status);

-- control_workforce.agent_capability
-- Structured skills/capabilities for agents, replacing opaque JSONB
CREATE TABLE control_workforce.agent_capability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID REFERENCES control_workforce.agency(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES control_workforce.worker(id) ON DELETE CASCADE,
    capability VARCHAR(255) NOT NULL  -- e.g., 'python', 'architecture-review', 'security-audit', 'llm-prompting'
        CHECK (capability ~ '^[a-z0-9\-_]+$'),
    proficiency INTEGER NOT NULL DEFAULT 3  -- 1=novice, 3=competent, 5=expert
        CHECK (proficiency BETWEEN 1 AND 5),
    verified BOOLEAN DEFAULT FALSE,
    verified_by VARCHAR(255),  -- Agent or user who verified
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT one_or_other CHECK (
        (agency_id IS NOT NULL AND worker_id IS NULL) OR
        (agency_id IS NULL AND worker_id IS NOT NULL)
    ),
    UNIQUE (agency_id, capability) WHERE agency_id IS NOT NULL,
    UNIQUE (worker_id, capability) WHERE worker_id IS NOT NULL
);
CREATE INDEX idx_agent_capability_agency ON control_workforce.agent_capability(agency_id);
CREATE INDEX idx_agent_capability_worker ON control_workforce.agent_capability(worker_id);
CREATE INDEX idx_agent_capability_name ON control_workforce.agent_capability(capability);

-- control_workforce.agent_trust
-- Pairwise trust relationships between agents
CREATE TABLE control_workforce.agent_trust (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_agency_id UUID NOT NULL REFERENCES control_workforce.agency(id) ON DELETE CASCADE,
    to_agency_id UUID NOT NULL REFERENCES control_workforce.agency(id) ON DELETE CASCADE,
    trust_level VARCHAR(50) NOT NULL DEFAULT 'known'
        CHECK (trust_level IN ('authority', 'trusted', 'known', 'restricted', 'blocked')),
    can_delegate BOOLEAN DEFAULT FALSE,
    can_override BOOLEAN DEFAULT FALSE,
    granted_by VARCHAR(255),  -- User or admin identity
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    
    CONSTRAINT no_self_trust CHECK (from_agency_id != to_agency_id),
    UNIQUE (from_agency_id, to_agency_id)
);
CREATE INDEX idx_agent_trust_from ON control_workforce.agent_trust(from_agency_id, trust_level);
CREATE INDEX idx_agent_trust_to ON control_workforce.agent_trust(to_agency_id);

-- control_workforce.authority_chain
-- Scoped delegation of authority for specific actions
CREATE TABLE control_workforce.authority_chain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority_agency_id UUID NOT NULL REFERENCES control_workforce.agency(id) ON DELETE CASCADE,
    scope_category VARCHAR(50) NOT NULL  -- proposal, project, deployment, security, financial
        CHECK (scope_category IN ('proposal', 'project', 'deployment', 'security', 'financial', 'governance')),
    scope_ref UUID,  -- ID of the scoped resource (e.g., proposal_id)
    authority_level VARCHAR(50) NOT NULL  -- authority (full), trusted (delegated), known (monitored)
        CHECK (authority_level IN ('authority', 'trusted', 'known')),
    can_override BOOLEAN DEFAULT FALSE,
    granted_by VARCHAR(255) NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_authority_chain_agency_scope ON control_workforce.authority_chain(authority_agency_id, scope_category, scope_ref);
CREATE INDEX idx_authority_chain_expires ON control_workforce.authority_chain(expires_at) WHERE expires_at IS NOT NULL;
```

---

## Schema: control_models

Model catalog, provider accounts with plan-type semantics, model routes, and context policy.

```sql
-- control_models.model_catalog
-- Inventory of available AI models with capabilities and pricing
CREATE TABLE control_models.model_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(255) NOT NULL UNIQUE,  -- e.g., 'claude-opus-4-6', 'gpt-4-turbo', 'xiaomi/mimo-v2-pro'
    model_provider VARCHAR(50) NOT NULL  -- anthropic, openai, google, xiaomi, nous, github, local
        CHECK (model_provider IN ('anthropic', 'openai', 'google', 'xiaomi', 'nous', 'github', 'local')),
    context_window INTEGER NOT NULL,  -- Maximum input tokens
    output_limit INTEGER NOT NULL,  -- Maximum output tokens
    cache_input_window INTEGER,  -- Prompt cache window size (if supported)
    capabilities TEXT NOT NULL DEFAULT ''
        CHECK (capabilities ~ '^[a-z0-9\-_,]*$'),  -- CSV: 'vision,file-upload,function-calling'
    objective_rating NUMERIC(3,1),  -- 1.0-5.0 quality rating for decision-making
    cost_per_million_input NUMERIC(10,4),  -- Input token cost (in USD per 1M tokens)
    cost_per_million_output NUMERIC(10,4),  -- Output token cost
    cost_per_million_cache_write NUMERIC(10,4),  -- Prompt cache write cost
    cost_per_million_cache_hit NUMERIC(10,4),  -- Prompt cache read cost
    status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'deprecated', 'retired', 'beta', 'unavailable')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_model_catalog_provider ON control_models.model_catalog(model_provider);
CREATE INDEX idx_model_catalog_status ON control_models.model_catalog(status);

-- control_models.provider_account
-- Credentials and billing arrangements for AI providers
-- plan_type distinguishes prepaid tokens, PAYG API keys, subscriptions, and local models
CREATE TABLE control_models.provider_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL  -- anthropic, openai, google, xiaomi, nous, github, local
        CHECK (provider IN ('anthropic', 'openai', 'google', 'xiaomi', 'nous', 'github', 'local')),
    account_name VARCHAR(255) NOT NULL,  -- Human-readable identifier
    plan_type VARCHAR(50) NOT NULL  -- How billing/credits work
        CHECK (plan_type IN ('token_plan', 'api_key_plan', 'subscription', 'local')),
    
    -- Credential reference (encrypted, stored elsewhere)
    credential_ref VARCHAR(255),  -- Path to encrypted credential store or env var name
    credential_type VARCHAR(50),  -- api_key, oauth_token, service_account_json, etc.
    
    -- Plan-specific metadata
    -- For token_plan: monthly token budget, remaining tokens, renewal date
    -- For api_key_plan: metered billing account, current balance, rate limits
    -- For subscription: tier (Pro/Max/etc), seat count, renewal date
    -- For local: model_path, quantization, resource_limits
    plan_metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Scope: who owns this account
    owner_scope VARCHAR(50) NOT NULL DEFAULT 'global'  -- global, project, agency
        CHECK (owner_scope IN ('global', 'project', 'agency')),
    owner_id UUID,  -- FK to project(id) or agency(id); NULL if global
    
    -- Status and lifecycle
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'suspended', 'archived')),
    created_by_user_id UUID REFERENCES control_identity.human_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    rotated_at TIMESTAMP WITH TIME ZONE,  -- Last credential rotation
    expires_at TIMESTAMP WITH TIME ZONE,  -- Account expiration
    
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_provider_account_provider_status ON control_models.provider_account(provider, status);
CREATE INDEX idx_provider_account_owner ON control_models.provider_account(owner_scope, owner_id);
CREATE INDEX idx_provider_account_expires ON control_models.provider_account(expires_at);

-- control_models.model_route
-- Executable routing policy: binds model × provider_account × agent_cli × base_url
-- This is the primary object used by resolveModelRoute()
CREATE TABLE control_models.model_route (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id VARCHAR(255) NOT NULL UNIQUE,  -- e.g., 'route-001', used in logs
    model_name VARCHAR(255) NOT NULL,  -- FK to model_catalog(model_name)
    route_provider VARCHAR(50) NOT NULL  -- anthropic, openai, google, xiaomi, nous, github, local
        CHECK (route_provider IN ('anthropic', 'openai', 'google', 'xiaomi', 'nous', 'github', 'local')),
    provider_account_id UUID REFERENCES control_models.provider_account(id),  -- NULL for local
    agent_provider VARCHAR(50) NOT NULL  -- which CLI can use this route: hermes, codex, claude, copilot
        CHECK (agent_provider IN ('hermes', 'codex', 'claude', 'copilot', 'any')),
    agent_cli VARCHAR(255) NOT NULL,  -- executable: 'hermes', 'codex', 'claude', etc.
    cli_path TEXT,  -- Absolute path to CLI binary; NULL if in PATH
    api_spec VARCHAR(255),  -- API version: 'openai-v1', 'anthropic-sdk', 'custom'
    base_url TEXT,  -- API endpoint (may differ from provider default)
    
    -- Routing priority and defaults
    priority INTEGER DEFAULT 100,  -- Lower = preferred
    is_default BOOLEAN DEFAULT FALSE,  -- Fallback route for this provider + agent_provider pair
    is_enabled BOOLEAN DEFAULT TRUE,
    
    -- Cost model (inherit from model_catalog, but may be overridden per route)
    cost_per_million_input NUMERIC(10,4),
    cost_per_million_output NUMERIC(10,4),
    cost_per_million_cache_write NUMERIC(10,4),
    cost_per_million_cache_hit NUMERIC(10,4),
    
    -- Spawn-time behavior
    spawn_toolsets TEXT DEFAULT ''  -- CSV: 'knowledge-base,file-upload'
        CHECK (spawn_toolsets ~ '^[a-z0-9\-_,]*$'),
    spawn_delegate VARCHAR(255),  -- Alternative route for tool fallback
    max_concurrent_spawns INTEGER DEFAULT 100,
    rate_limit_per_minute INTEGER,
    
    -- Metadata
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deprecated', 'testing', 'disabled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    FOREIGN KEY (model_name) REFERENCES control_models.model_catalog(model_name),
    -- Enforce model×provider×agent_provider uniqueness
    UNIQUE (model_name, route_provider, agent_provider, is_enabled)
);
CREATE INDEX idx_model_route_model_provider_agent ON control_models.model_route(model_name, agent_provider, is_enabled);
CREATE INDEX idx_model_route_provider ON control_models.model_route(route_provider);
CREATE INDEX idx_model_route_priority ON control_models.model_route(priority) WHERE is_enabled = TRUE;
CREATE INDEX idx_model_route_is_default ON control_models.model_route(route_provider, agent_provider) WHERE is_default = TRUE;

-- control_models.context_policy
-- Policy for selecting, summarizing, and budgeting context per project/agency/dispatch
CREATE TABLE control_models.context_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id VARCHAR(255) NOT NULL UNIQUE,
    scope_type VARCHAR(50) NOT NULL  -- global, project, agency, proposal, dispatch
        CHECK (scope_type IN ('global', 'project', 'agency', 'proposal', 'dispatch')),
    scope_id UUID,  -- FK to project/agency/proposal; NULL if global
    
    max_prompt_tokens INTEGER NOT NULL DEFAULT 100000,
    max_history_tokens INTEGER,  -- Limit previous messages; NULL = no limit
    max_attachments INTEGER DEFAULT 10,
    max_attachment_size_mb INTEGER DEFAULT 100,
    
    -- Document/knowledge retrieval
    retrieval_policy VARCHAR(50) NOT NULL DEFAULT 'none'  -- none, bm25, semantic, hybrid
        CHECK (retrieval_policy IN ('none', 'bm25', 'semantic', 'hybrid', 'rag')),
    retrieval_limit INTEGER DEFAULT 5,  -- Max documents to retrieve
    
    -- Summarization
    summarization_policy VARCHAR(50) DEFAULT 'none'  -- none, extractive, abstractive
        CHECK (summarization_policy IN ('none', 'extractive', 'abstractive', 'rolling-window')),
    
    -- Attachment handling
    attachment_policy VARCHAR(50) DEFAULT 'inline'  -- inline, file-uri, processing
        CHECK (attachment_policy IN ('inline', 'file-uri', 'processing')),
    
    -- Overflow behavior
    truncation_behavior VARCHAR(50) NOT NULL DEFAULT 'drop-oldest'
        CHECK (truncation_behavior IN ('drop-oldest', 'summarize-oldest', 'error', 'defer')),
    
    created_by_user_id UUID REFERENCES control_identity.human_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_context_policy_scope ON control_models.context_policy(scope_type, scope_id);
```

---

## Schema: control_budget

Budget caps, spending ledger, and budget enforcement at multiple scopes.

```sql
-- control_budget.budget_allowance
-- Hierarchical budget caps: global, project, agency, route, proposal, dispatch, run
CREATE TABLE control_budget.budget_allowance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type VARCHAR(50) NOT NULL  -- global, project, repo, agency, provider_account, model_route, proposal, dispatch, run
        CHECK (scope_type IN ('global', 'project', 'repo', 'agency', 'provider_account', 'model_route', 'proposal', 'dispatch', 'run')),
    scope_id UUID,  -- FK to appropriate resource; NULL if global
    
    -- Hard caps (fail-closed if exceeded)
    daily_limit_usd NUMERIC(12,2),
    weekly_limit_usd NUMERIC(12,2),
    monthly_limit_usd NUMERIC(12,2),
    total_limit_usd NUMERIC(12,2),  -- Lifetime cap
    
    -- Soft warnings
    soft_warning_percent NUMERIC(5,2) DEFAULT 80,  -- Alert at 80%
    
    -- Per-run limits
    max_per_run_tokens INTEGER,  -- Hard ceiling on input+output per run
    context_truncation_threshold NUMERIC(5,2) DEFAULT 85,  -- Truncate if context > 85%
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'frozen', 'deleted')),
    freeze_reason VARCHAR(255),
    frozen_by_identity VARCHAR(255),
    frozen_at TIMESTAMP WITH TIME ZONE,
    
    created_by_user_id UUID REFERENCES control_identity.human_user(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb  -- period_start, period_end, notes
);
CREATE INDEX idx_budget_allowance_scope ON control_budget.budget_allowance(scope_type, scope_id);
CREATE INDEX idx_budget_allowance_frozen ON control_budget.budget_allowance(status) WHERE status = 'frozen';

-- control_budget.spending_log
-- Append-only record of every charge incurred
CREATE TABLE control_budget.spending_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type VARCHAR(50) NOT NULL  -- Redundant denormalization for fast queries
        CHECK (scope_type IN ('global', 'project', 'repo', 'agency', 'provider_account', 'model_route', 'proposal', 'dispatch', 'run')),
    scope_id UUID,  -- Redundant denormalization
    
    run_id UUID,  -- Associated run
    dispatch_id UUID,  -- Associated dispatch
    proposal_id UUID,  -- Associated proposal
    
    agent_identity VARCHAR(255),
    model_name VARCHAR(255),
    route_provider VARCHAR(50),
    
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    cache_read_tokens BIGINT NOT NULL DEFAULT 0,
    cache_write_tokens BIGINT NOT NULL DEFAULT 0,
    
    cost_usd NUMERIC(10,4),
    
    charge_category VARCHAR(50) NOT NULL  -- inference, cache-write, cache-read, api-call
        CHECK (charge_category IN ('inference', 'cache-write', 'cache-read', 'api-call', 'other')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_spending_log_run ON control_budget.spending_log(run_id);
CREATE INDEX idx_spending_log_dispatch ON control_budget.spending_log(dispatch_id);
CREATE INDEX idx_spending_log_proposal ON control_budget.spending_log(proposal_id);
CREATE INDEX idx_spending_log_scope_time ON control_budget.spending_log(scope_type, scope_id, created_at DESC);
CREATE INDEX idx_spending_log_agent ON control_budget.spending_log(agent_identity);

-- control_budget.budget_ledger
-- Running balance of consumed budget per scope and period
CREATE TABLE control_budget.budget_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    allowance_id UUID NOT NULL REFERENCES control_budget.budget_allowance(id) ON DELETE CASCADE,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    
    consumed_usd NUMERIC(12,2) DEFAULT 0,
    remaining_usd NUMERIC(12,2),
    
    token_count BIGINT DEFAULT 0,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (allowance_id, billing_period_start)
);
CREATE INDEX idx_budget_ledger_allowance_period ON control_budget.budget_ledger(allowance_id, billing_period_start);

-- control_budget.plan_token_balance
-- For token_plan provider accounts: track prepaid token balance
CREATE TABLE control_budget.plan_token_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_account_id UUID NOT NULL REFERENCES control_models.provider_account(id) ON DELETE CASCADE,
    
    billing_period_start DATE,
    billing_period_end DATE,
    
    total_tokens_allocated BIGINT NOT NULL,
    tokens_consumed BIGINT DEFAULT 0,
    tokens_remaining BIGINT,
    
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (provider_account_id, billing_period_start)
);

-- control_budget.api_key_credit
-- For api_key_plan provider accounts: track metered billing balance
CREATE TABLE control_budget.api_key_credit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_account_id UUID NOT NULL REFERENCES control_models.provider_account(id) ON DELETE CASCADE,
    
    prepaid_usd NUMERIC(12,2) DEFAULT 0,
    used_usd NUMERIC(12,2) DEFAULT 0,
    remaining_usd NUMERIC(12,2),
    
    rate_limit_per_minute INTEGER,
    rate_limit_tokens_used_this_minute INTEGER DEFAULT 0,
    
    last_charge_at TIMESTAMP WITH TIME ZONE,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (provider_account_id)
);
```

---

## Schema: control_dispatch

Squad dispatch, work offers, claims, claim tokens, and retry policy.

```sql
-- control_dispatch.squad_dispatch
-- Central table: proposal → work offer → claim → lease → execution
-- One active dispatch per (project_id, proposal_id, workflow_state, role) unless multi-agent configured
CREATE TABLE control_dispatch.squad_dispatch (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Proposal context (required)
    project_id UUID NOT NULL REFERENCES control_project.project(id),
    proposal_id UUID NOT NULL,  -- Metadata only; real proposals in control_workflow
    workflow_state VARCHAR(50),  -- DRAFT, REVIEW, DEVELOP, MERGE, COMPLETE
    
    -- Dispatch identification
    dispatch_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),  -- Stable identifier for idempotency
    squad_name VARCHAR(255),  -- e.g., 'gate-review', 'code-implement'
    dispatch_role VARCHAR(50) NOT NULL,  -- architect, coder, reviewer, tester, gate-agent
        CHECK (dispatch_role IN ('architect', 'coder', 'reviewer', 'tester', 'gate-agent', 'operator', 'other')),
    
    -- Work offer state machine
    offer_status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (offer_status IN ('open', 'claimed', 'activated', 'delivered', 'failed', 'expired', 'cancelled')),
    dispatch_status VARCHAR(20) NOT NULL DEFAULT 'assigned'
        CHECK (dispatch_status IN ('assigned', 'active', 'paused', 'blocked', 'completed', 'failed', 'cancelled', 'abandoned')),
    
    -- Claiming
    agent_identity VARCHAR(255),  -- NULL if open offer
    claim_token UUID,  -- HMAC-secured token proving claim
    claim_expires_at TIMESTAMP WITH TIME ZONE,  -- Offer TTL
    claimed_at TIMESTAMP WITH TIME ZONE,
    
    -- Capability matching
    required_capabilities JSONB,  -- { "capability": min_proficiency }
    
    -- Lease link
    proposal_lease_id UUID,  -- FK to control_workflow.proposal_lease
    
    -- Assignment tracking
    assigned_by VARCHAR(255),  -- User/agent making the offer
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,  -- task, phase, model_hint, timeout_seconds, notes
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Deduplication: one active dispatch per (project, proposal, workflow_state, role)
    UNIQUE (project_id, proposal_id, workflow_state, dispatch_role) WHERE dispatch_status IN ('assigned', 'active', 'completed')
);
CREATE INDEX idx_squad_dispatch_project_proposal ON control_dispatch.squad_dispatch(project_id, proposal_id);
CREATE INDEX idx_squad_dispatch_agent ON control_dispatch.squad_dispatch(agent_identity) WHERE agent_identity IS NOT NULL;
CREATE INDEX idx_squad_dispatch_offer_status ON control_dispatch.squad_dispatch(offer_status);
CREATE INDEX idx_squad_dispatch_claim_expires ON control_dispatch.squad_dispatch(claim_expires_at) WHERE offer_status = 'open';
CREATE INDEX idx_squad_dispatch_dispatch_status ON control_dispatch.squad_dispatch(dispatch_status);

-- control_dispatch.work_offer
-- (Deprecated: squad_dispatch is now the primary offer table)
-- Kept for backward compatibility and detailed offer metadata
CREATE TABLE control_dispatch.work_offer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES control_dispatch.squad_dispatch(id) ON DELETE CASCADE,
    
    -- Offer lifecycle
    offer_status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (offer_status IN ('open', 'claimed', 'activated', 'delivered', 'failed', 'expired')),
    
    -- Claim proof
    claim_token UUID,
    claim_expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_work_offer_dispatch ON control_dispatch.work_offer(dispatch_id);
CREATE INDEX idx_work_offer_status ON control_dispatch.work_offer(offer_status);

-- control_dispatch.retry_policy
-- Retry strategy for failed dispatches
CREATE TABLE control_dispatch.retry_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_id UUID NOT NULL REFERENCES control_dispatch.squad_dispatch(id) ON DELETE CASCADE,
    
    max_retries INTEGER DEFAULT 3,
    current_attempt INTEGER DEFAULT 0,
    backoff_strategy VARCHAR(50) NOT NULL DEFAULT 'exponential'
        CHECK (backoff_strategy IN ('none', 'fixed', 'linear', 'exponential')),
    initial_delay_seconds INTEGER DEFAULT 60,
    max_delay_seconds INTEGER DEFAULT 3600,
    
    last_failed_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,
    
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (dispatch_id)
);
CREATE INDEX idx_retry_policy_next_retry ON control_dispatch.retry_policy(next_retry_at) WHERE current_attempt < max_retries;

-- control_dispatch.transition_queue
-- (Legacy, partially superseded by implicit maturity gating)
-- Retained for scheduler wakeups and diagnostics
CREATE TABLE control_dispatch.transition_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL,
    source_state VARCHAR(50),
    target_state VARCHAR(50),
    
    dispatch_id UUID REFERENCES control_dispatch.squad_dispatch(id),
    
    enqueued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    reason TEXT,  -- e.g., 'mature proposal', 'gate decision ready', 'manual advance'
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_transition_queue_proposal ON control_dispatch.transition_queue(proposal_id);
CREATE INDEX idx_transition_queue_processed ON control_dispatch.transition_queue(processed_at) WHERE processed_at IS NULL;
```

---

## Schema: control_workflow

Workflow definitions, state machines, transitions, and proposal_lease (moved from proposals).

```sql
-- control_workflow.workflow_template
-- Named state-machine definitions
CREATE TABLE control_workflow.workflow_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    proposal_type VARCHAR(50) NOT NULL  -- product, component, feature, issue, hotfix
        CHECK (proposal_type IN ('product', 'component', 'feature', 'issue', 'hotfix')),
    
    states TEXT NOT NULL,  -- CSV: DRAFT,REVIEW,DEVELOP,MERGE,COMPLETE
    initial_state VARCHAR(50),
    
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'draft')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- control_workflow.workflow_state
-- State definitions with maturity rules
CREATE TABLE control_workflow.workflow_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) NOT NULL,
    state_name VARCHAR(50) NOT NULL,
    
    phase VARCHAR(50),  -- architecture, gating, building, integration, stable
    description TEXT,
    
    allows_maturity_new BOOLEAN DEFAULT TRUE,
    allows_maturity_active BOOLEAN DEFAULT TRUE,
    allows_maturity_mature BOOLEAN DEFAULT TRUE,
    allows_maturity_obsolete BOOLEAN DEFAULT TRUE,
    
    is_gateable BOOLEAN DEFAULT FALSE,  -- Can transition via gate decision?
    is_terminal BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (workflow_id, state_name),
    FOREIGN KEY (workflow_id) REFERENCES control_workflow.workflow_template(workflow_id)
);

-- control_workflow.workflow_transition
-- Valid state transitions (versioned)
CREATE TABLE control_workflow.workflow_transition (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) NOT NULL,
    from_state VARCHAR(50) NOT NULL,
    to_state VARCHAR(50) NOT NULL,
    
    allowed_roles TEXT NOT NULL DEFAULT 'gate-agent,admin'  -- CSV
        CHECK (allowed_roles ~ '^[a-z\-_,]*$'),
    
    requires_ac_verification BOOLEAN DEFAULT FALSE,
    requires_dependency_check BOOLEAN DEFAULT FALSE,
    requires_design_review BOOLEAN DEFAULT FALSE,
    requires_reason BOOLEAN DEFAULT FALSE,
    
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (workflow_id, from_state, to_state, version),
    FOREIGN KEY (workflow_id) REFERENCES control_workflow.workflow_template(workflow_id)
);

-- control_workflow.proposal_type_config
-- Maps proposal types to workflows and defaults
CREATE TABLE control_workflow.proposal_type_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_type VARCHAR(50) NOT NULL UNIQUE
        CHECK (proposal_type IN ('product', 'component', 'feature', 'issue', 'hotfix')),
    
    workflow_id VARCHAR(255) NOT NULL,
    
    default_maturity VARCHAR(20) DEFAULT 'new'
        CHECK (default_maturity IN ('new', 'active', 'mature', 'obsolete')),
    
    default_status VARCHAR(50) DEFAULT 'DRAFT',
    
    metadata JSONB DEFAULT '{}'::jsonb,
    
    FOREIGN KEY (workflow_id) REFERENCES control_workflow.workflow_template(workflow_id)
);

-- control_workflow.proposal_lease
-- Exclusive work claim on a proposal; moved here from project schemas
CREATE TABLE control_workflow.proposal_lease (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL,  -- Metadata; real proposal stored in project DB
    project_id UUID NOT NULL REFERENCES control_project.project(id),
    
    agent_identity VARCHAR(255) NOT NULL,  -- Claiming agent
    worker_identity VARCHAR(255),  -- Ephemeral worker (if dispatched)
    
    lease_type VARCHAR(50) NOT NULL DEFAULT 'exclusive'
        CHECK (lease_type IN ('exclusive', 'collaborative')),
    
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,  -- TTL; NULL = indefinite
    released_at TIMESTAMP WITH TIME ZONE,
    release_reason VARCHAR(255),  -- 'completed', 'abandoned', 'reassigned', 'expired'
    
    dispatch_id UUID REFERENCES control_dispatch.squad_dispatch(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Deduplication: one active exclusive lease per proposal (multiple collaborators okay)
    UNIQUE (proposal_id, agent_identity) WHERE lease_type = 'exclusive' AND released_at IS NULL
);
CREATE INDEX idx_proposal_lease_proposal ON control_workflow.proposal_lease(proposal_id);
CREATE INDEX idx_proposal_lease_agent ON control_workflow.proposal_lease(agent_identity) WHERE released_at IS NULL;
CREATE INDEX idx_proposal_lease_active ON control_workflow.proposal_lease(expires_at) WHERE released_at IS NULL;
CREATE INDEX idx_proposal_lease_project ON control_workflow.proposal_lease(project_id);
```

---

## Schema: control_audit

Proposal events (outbox), gate decisions, escalations, policy violations, and operator actions.

```sql
-- control_audit.proposal_event
-- Append-only outbox of proposal state changes for downstream consumers
CREATE TABLE control_audit.proposal_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES control_project.project(id),
    
    event_type VARCHAR(50) NOT NULL  -- created, maturity_changed, status_changed, lease_claimed, lease_released, etc.
        CHECK (event_type IN ('created', 'maturity_changed', 'status_changed', 'lease_claimed', 'lease_released', 
                             'dependency_added', 'dependency_resolved', 'ac_added', 'ac_verified', 
                             'review_submitted', 'gate_decision_made', 'dispatched', 'completed')),
    
    source_agent VARCHAR(255),  -- Agent that triggered the event
    
    before_json JSONB,  -- Previous state
    after_json JSONB,   -- New state
    
    event_metadata JSONB DEFAULT '{}'::jsonb,  -- Additional context
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE  -- When downstream consumer processed it
);
CREATE INDEX idx_proposal_event_proposal ON control_audit.proposal_event(proposal_id);
CREATE INDEX idx_proposal_event_project ON control_audit.proposal_event(project_id);
CREATE INDEX idx_proposal_event_type ON control_audit.proposal_event(event_type);
CREATE INDEX idx_proposal_event_created ON control_audit.proposal_event(created_at DESC);
CREATE INDEX idx_proposal_event_processed ON control_audit.proposal_event(processed_at) WHERE processed_at IS NULL;

-- control_audit.gate_decision_log
-- Structured record of all gate decisions and their rationale
CREATE TABLE control_audit.gate_decision_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES control_project.project(id),
    
    gate_label VARCHAR(50) NOT NULL,  -- D1, D2, D3, D4, custom
    from_state VARCHAR(50),
    to_state VARCHAR(50),
    
    decision VARCHAR(50) NOT NULL  -- advance, send_back, hold, obsolete
        CHECK (decision IN ('advance', 'send_back', 'hold', 'obsolete', 'escalate')),
    
    decided_by VARCHAR(255) NOT NULL,  -- Gate agent or human
    decided_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Verification details
    ac_verification_status VARCHAR(50),  -- pass, fail, partial, waived
    ac_verification_notes TEXT,
    
    dependency_check_status VARCHAR(50),  -- pass, fail, partial, blocked
    dependency_check_notes TEXT,
    
    design_review_status VARCHAR(50),  -- pass, fail, partial, blocker
    design_review_notes TEXT,
    
    -- Decision rationale
    rationale TEXT,
    
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_gate_decision_log_proposal ON control_audit.gate_decision_log(proposal_id);
CREATE INDEX idx_gate_decision_log_date ON control_audit.gate_decision_log(decided_at DESC);

-- control_audit.escalation_log
-- Record of escalations to humans or higher-authority agents
CREATE TABLE control_audit.escalation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID,  -- NULL for non-proposal escalations
    project_id UUID REFERENCES control_project.project(id),
    
    obstacle_type VARCHAR(50) NOT NULL  -- BUDGET_EXHAUSTED, LOOP_DETECTED, CYCLE_DETECTED, AGENT_DEAD, etc.
        CHECK (obstacle_type IN ('BUDGET_EXHAUSTED', 'LOOP_DETECTED', 'CYCLE_DETECTED', 'AGENT_DEAD', 
                               'PIPELINE_BLOCKED', 'AC_GATE_FAILED', 'DEPENDENCY_UNRESOLVED', 
                               'SPAWN_POLICY_VIOLATION', 'RESOURCE_UNAVAILABLE', 'MANUAL')),
    
    severity VARCHAR(20) NOT NULL  -- info, warning, error, critical
        CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    
    escalated_by VARCHAR(255) NOT NULL,  -- Agent or system raising the escalation
    escalated_to VARCHAR(255),  -- Assigned escalation owner (human or higher agent)
    
    description TEXT NOT NULL,
    context_json JSONB,  -- Detailed context for humans to understand
    
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'dismissed')),
    
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_escalation_log_status ON control_audit.escalation_log(status);
CREATE INDEX idx_escalation_log_type ON control_audit.escalation_log(obstacle_type);
CREATE INDEX idx_escalation_log_created ON control_audit.escalation_log(created_at DESC);

-- control_audit.policy_violation
-- Record of policy breaches (budget, access, capability, etc.)
CREATE TABLE control_audit.policy_violation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_domain VARCHAR(50) NOT NULL  -- budget, access, capability, workflow, security
        CHECK (policy_domain IN ('budget', 'access', 'capability', 'workflow', 'security', 'other')),
    
    violator_identity VARCHAR(255) NOT NULL,  -- Agent or user
    
    policy_rule VARCHAR(255) NOT NULL,  -- Human-readable rule name
    
    violation_details TEXT,
    
    action_taken VARCHAR(50) NOT NULL DEFAULT 'denied'  -- denied, logged, warned, blocked, frozen
        CHECK (action_taken IN ('denied', 'logged', 'warned', 'blocked', 'frozen', 'escalated')),
    
    context_json JSONB,  -- Request/state at time of violation
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_policy_violation_domain ON control_audit.policy_violation(policy_domain);
CREATE INDEX idx_policy_violation_violator ON control_audit.policy_violation(violator_identity);
CREATE INDEX idx_policy_violation_created ON control_audit.policy_violation(created_at DESC);

-- control_audit.operator_action_log
-- Manual interventions by humans (pause, resume, cancel, reassign, override)
CREATE TABLE control_audit.operator_action_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_identity VARCHAR(255) NOT NULL,  -- Human or admin agent
    
    action_type VARCHAR(50) NOT NULL  -- pause, resume, cancel, reassign, override, acknowledge, approve
        CHECK (action_type IN ('pause', 'resume', 'cancel', 'reassign', 'override', 'acknowledge', 'approve', 'deny', 'freeze', 'unfreeze')),
    
    target_type VARCHAR(50) NOT NULL  -- proposal, dispatch, agent, service, budget, project
        CHECK (target_type IN ('proposal', 'dispatch', 'agent', 'service', 'budget', 'project', 'other')),
    
    target_id VARCHAR(255),  -- ID of the affected resource
    
    justification TEXT NOT NULL,
    
    expected_outcome TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_operator_action_log_operator ON control_audit.operator_action_log(operator_identity);
CREATE INDEX idx_operator_action_log_target ON control_audit.operator_action_log(target_type, target_id);
```

---

## Views for Common Queries

```sql
-- v_active_dispatches
-- All currently active dispatches with dispatch status and offer status
CREATE VIEW control_dispatch.v_active_dispatches AS
SELECT
    d.id,
    d.dispatch_id,
    d.project_id,
    d.proposal_id,
    d.dispatch_role,
    d.agent_identity,
    d.dispatch_status,
    d.offer_status,
    d.claim_expires_at,
    d.assigned_at,
    p.project_id AS project_slug,
    d.metadata
FROM control_dispatch.squad_dispatch d
JOIN control_project.project p ON d.project_id = p.id
WHERE d.dispatch_status IN ('assigned', 'active', 'paused', 'blocked');

-- v_eligible_agencies_for_project
-- Agencies subscribed to a project with active status
CREATE VIEW control_project.v_eligible_agencies_for_project AS
SELECT
    ps.project_id,
    ps.agency_identity,
    a.provider_family,
    ps.max_concurrent_claims,
    COUNT(CASE WHEN sd.dispatch_status IN ('assigned', 'active') THEN 1 END) AS active_claim_count,
    (ps.max_concurrent_claims - COUNT(CASE WHEN sd.dispatch_status IN ('assigned', 'active') THEN 1 END)) AS available_slots
FROM control_project.project_subscription ps
JOIN control_workforce.agency a ON ps.agency_identity = a.agency_identity
LEFT JOIN control_dispatch.squad_dispatch sd ON sd.project_id = ps.project_id 
    AND sd.dispatch_role IN ('architect', 'coder', 'reviewer', 'tester', 'gate-agent')
WHERE ps.status = 'active'
    AND a.status = 'active'
GROUP BY ps.project_id, ps.agency_identity, a.provider_family, ps.max_concurrent_claims;

-- v_budget_status
-- Current budget consumption across all scopes
CREATE VIEW control_budget.v_budget_status AS
SELECT
    ba.scope_type,
    ba.scope_id,
    ba.daily_limit_usd,
    ba.monthly_limit_usd,
    SUM(bl.consumed_usd) AS consumed_usd,
    ba.monthly_limit_usd - COALESCE(SUM(bl.consumed_usd), 0) AS remaining_usd,
    ROUND(100.0 * COALESCE(SUM(bl.consumed_usd), 0) / NULLIF(ba.monthly_limit_usd, 0), 1) AS percent_used
FROM control_budget.budget_allowance ba
LEFT JOIN control_budget.budget_ledger bl ON ba.id = bl.allowance_id
WHERE ba.status = 'active'
GROUP BY ba.id, ba.scope_type, ba.scope_id, ba.daily_limit_usd, ba.monthly_limit_usd;
```

---

## Open Questions for Implementation

1. **Proposal table placement**: Should the `proposal` entity live in `control_workflow` or its own `control_proposal` schema? Current sketch assumes proposals are lightweight metadata rows in the dispatch/workflow flow, with full details in project databases. Clarify schema ownership.

2. **Worker lifecycle and purging**: Should `worker` rows be auto-purged after N days (e.g., 90 days), or kept forever for audit? Propose: keep indefinitely but partition by year for performance.

3. **Multi-agency dispatch**: Should one dispatch allow multiple agent claims (e.g., parallel code review), or strictly one agent per dispatch? Current sketch enforces one active claim per dispatch via unique constraint; relax if multi-agent needed.

4. **Provider account credential storage**: Should encrypted credentials live in the control database as a separate `encrypted_credential` table with key rotation, or externally in a secrets vault? Current sketch uses `credential_ref` pointers; clarify full solution.

5. **Scope hierarchy for budget checks**: Should budget enforcement recursively check parent scopes (e.g., dispatch → proposal → project → global), or flat lookup? Recommend: recursive with short-circuit on first breach.

6. **Model route versioning**: Should `model_route` rows be immutable (create new rows for changes) or mutable? Recommend: immutable + version field for auditability.

7. **Host affinity for worktrees**: Should worktrees be tied to a specific host, or portable across hosts? Current sketch allows path-based portability; clarify.

8. **Project database schema names**: Should project DBs use identical schema names (e.g., both named `roadmap`) for backward compatibility, or distinct names (e.g., `project_alpha_domain` vs `project_beta_domain`)? Recommend: distinct for clarity.

9. **Cascading service restarts**: When control DB migrations complete, which services must restart? Propose: MCP server, orchestrator, offer-provider, pipeline-cron.

10. **Audit retention**: How long should audit tables (events, decisions, escalations, violations, actions) be retained? Recommend: 1 year in hot storage, archive to cold storage after 1 year, keep indefinitely.

