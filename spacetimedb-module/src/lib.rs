use spacetimedb::*;

// ─────────────────────────────────────────────────────────────
// DOMAIN: THE UNIVERSAL ENTITY (The "Everything" Table)
// ─────────────────────────────────────────────────────────────

#[table(accessor = proposal, public)]
pub struct Proposal {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub display_id: String,             // Human-readable ID (e.g., 'DIR-001', 'RFC-105')
    pub parent_id: Option<u64>,         // Hierarchy glue (Parent Directive -> Child RFC)
    
    // Discriminators
    pub proposal_type: String,          // DIRECTIVE, CAPABILITY, TECHNICAL, COMPONENT, OPS_ISSUE
    pub category: String,               // FEATURE, BUG, RESEARCH, SECURITY, INFRA
    
    // Strategic Context
    pub domain_id: String,              // Business silo (e.g., 'FINOPS', 'ENGINE')
    pub title: String,
    pub status: String,                 // New, Draft, Review, Active, Accepted, Complete, Rejected
    pub priority: String,               // Strategic, High, Medium, Low
    
    // Content & Logic
    pub body_markdown: Option<String>,  // The primary text (Idea, RFC Spec, or Issue details)
    pub process_logic: Option<String>,  // Descriptive business process for Directives
    pub maturity_level: Option<u32>,    // 0-3 (Universal scale: 0=New, 1=Active, 2=Complete, 3=Mature)
    pub repository_path: Option<String>, // Physical Git path (For COMPONENT/SRC types)
    
    // Economics & Search
    pub budget_limit_usd: f64,
    pub tags: Option<String>,           // JSON/Comma-separated metadata
    
    pub created_at: u64,
    pub updated_at: u64,
}

// ─────────────────────────────────────────────────────────────
// DOMAIN: PROVENANCE & LIFECYCLE (The Logic)
// ─────────────────────────────────────────────────────────────

#[table(accessor = proposal_version, public)]
pub struct ProposalVersion {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub proposal_id: u64,
    pub author_identity: String,        // SDB Identity of the agent/human
    pub version_number: u32,
    pub change_summary: String,         // "Commit Message"
    pub body_delta: Option<String>,     // Unified Diff of the markdown
    pub metadata_delta_json: String,    // Changes to status, priority, etc.
    pub git_commit_sha: Option<String>, // Pointer to the read-only MD mirror commit
    pub timestamp: u64,
}

#[table(accessor = proposal_criteria, public)]
pub struct ProposalCriteria {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub proposal_id: u64,
    pub description: String,
    pub is_verified: bool,              // Must be true for 'Complete' status
}

#[table(accessor = proposal_decision, public)]
pub struct ProposalDecision {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub proposal_id: u64,
    pub title: String,
    pub decision_summary: String,
    pub rationale: String,              // Formal ADR format
    pub status: String,                 // Accepted, Superseded
    pub created_at: u64,
}

// ─────────────────────────────────────────────────────────────
// DOMAIN: ASSETS (Multimedia & Binary Store)
// ─────────────────────────────────────────────────────────────

#[table(accessor = attachment_registry, public)]
pub struct AttachmentRegistry {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub proposal_id: u64,
    pub display_id: String,             // Used for folder pathing
    pub file_name: String,
    pub relative_path: String,          // Path: 'product/attachments/[display_id]/file'
    pub file_type: String,              // PHOTO, DIAGRAM, MOCKUP
    pub content_hash: String,           // SHA-256 for integrity
    pub vision_summary: Option<String>, // AI-generated description for text agents
    pub timestamp: u64,
}

// ─────────────────────────────────────────────────────────────
// DOMAIN: WORKFORCE & ECONOMY (The Guardrails)
// ─────────────────────────────────────────────────────────────

#[table(accessor = workforce_registry, public)]
pub struct WorkforceRegistry {
    pub identity: String,               // Cryptographic SDB Identity
    #[primary_key]
    pub agent_id: String,               // Readable ID (e.g., 'CODE-01')
    pub name: String,                   // Human-readable name
    pub role: String,
    pub clearance_level: u8,            // 1-5 (5 = Human-Level)
    #[auto_inc]
    pub squad_id: u32,                  // Team assignment
    pub workspace: String,              // Assigned workspace path
    pub api_key: String,                // Authentication key
    pub is_active: bool,
}

#[table(accessor = workforce_pulse, public)]
pub struct WorkforcePulse {
    #[primary_key]
    pub identity: String,
    pub active_proposal_id: Option<u64>, // Current tactical focus
    pub last_seen_at: u64,
    pub status_message: String,         // "Drafting RFC-105..."
    pub is_zombie: bool,
}

#[table(accessor = spending_caps, public)]
pub struct SpendingCaps {
    #[primary_key]
    pub agent_identity: String,
    pub daily_limit_usd: f64,
    pub total_spent_today_usd: f64,
    pub is_frozen: bool,                // System-wide kill switch for the agent
}

#[table(accessor = spending_log, public)]
pub struct SpendingLog {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub proposal_id: u64,               // All costs linked to a specific entity
    pub agent_identity: String,
    pub cost_usd: f64,
    pub timestamp: u64,
}

// ─────────────────────────────────────────────────────────────
// DOMAIN: SECURITY & KNOWLEDGE (The Vault)
// ─────────────────────────────────────────────────────────────

#[table(accessor = security_acl, public)]
pub struct SecurityAcl {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub agent_identity: String,
    pub target_proposal_id: u64,        // Access to specific Directives or Components
    pub permission_id: String,          // READ, WRITE, EXECUTE
}

#[table(accessor = security_audit_log, public)]
pub struct SecurityAuditLog {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub actor_identity: String,
    pub action: String,                 // e.g., 'SDB_REDUCER_CALL'
    pub severity: String,
    pub timestamp: u64,
}

#[table(accessor = agent_memory, public)]
pub struct AgentMemory {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub agent_identity: String,
    pub scope_proposal_id: u64,         // Memory limited to specific proposal context
    pub key: String,
    pub val: String,
    pub updated_at: u64,
}

#[table(accessor = message_ledger, public)]
pub struct MessageLedger {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub channel_name: String,
    pub sender_identity: String,
    pub content: String,
    pub timestamp: u64,
}

#[table(accessor = subscription, public)]
pub struct Subscription {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub agent_identity: String,
    pub channel_name: String,
    pub subscribed_at: u64,
}

// ─────────────────────────────────────────────────────────────
// DOMAIN: SYNC & EXPORT (DB ↔ Git Traceability)
// ─────────────────────────────────────────────────────────────

#[table(accessor = sync_ledger, public)]
pub struct SyncLedger {
    #[primary_key]
    pub artifact_path: String,      // e.g., "product/proposals/RFC-001.md"
    pub proposal_id: u64,           // Link to the proposal being exported
    pub last_sdb_hash: String,      // SHA-256 hash of the proposal data at last sync
    pub last_git_commit: String,    // Git SHA of the commit after export
    pub sync_status: String,        // SYNCED, PENDING, ERROR
    pub last_synced_at: u64,
    pub error_message: Option<String>,
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/// Check if an agent has budget remaining for an estimated cost.
/// Returns Ok(()) if allowed, Err(message) if blocked.
fn check_budget(ctx: &ReducerContext, estimated_cost: f64) -> Result<(), String> {
    let agent = ctx.sender().to_string();
    match ctx.db.spending_caps().agent_identity().find(&agent) {
        None => Ok(()), // No caps configured = unlimited (safe default for local dev)
        Some(caps) if caps.is_frozen => Err(format!(
            "Agent '{}' spending is frozen",
            agent
        )),
        Some(caps) if caps.total_spent_today_usd + estimated_cost > caps.daily_limit_usd => {
            Err(format!(
                "Budget exceeded for '{}': ${:.2} spent of ${:.2} daily limit (need ${:.2})",
                agent, caps.total_spent_today_usd, caps.daily_limit_usd, estimated_cost
            ))
        }
        Some(_) => Ok(()),
    }
}

// ─────────────────────────────────────────────────────────────
// REDUCERS
// ─────────────────────────────────────────────────────────────

// ── Proposal Lifecycle ──

#[reducer]
pub fn create_proposal(
    ctx: &ReducerContext,
    proposal_type: String,
    category: String,
    domain_id: String,
    title: String,
    priority: String,
    body_markdown: Option<String>,
    parent_id: Option<u64>,
    budget_limit_usd: f64,
) {
    // Budget guard: reject if agent is frozen or over daily limit
    if let Err(msg) = check_budget(ctx, budget_limit_usd) {
        log::warn!("{}", msg);
        return;
    }

    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;
    let proposal = ctx.db.proposal().insert(Proposal {
        id: 0,
        display_id: String::new(), // Will be set after insert
        parent_id,
        proposal_type,
        category,
        domain_id,
        title,
        status: "New".to_string(),
        priority,
        body_markdown: body_markdown.clone(),
        process_logic: None,
        maturity_level: Some(0), // Default maturity: 0=New
        repository_path: None,
        budget_limit_usd,
        tags: None,
        created_at: now,
        updated_at: now,
    });
    
    // Auto-generate display_id as P### (0-padded)
    let display_id = format!("P{:03}", proposal.id);
    ctx.db.proposal().id().update(Proposal {
        id: proposal.id,
        display_id: display_id.clone(),
        ..proposal
    });
    
    let proposal_id = proposal.id;

    // Auto-create initial version
    ctx.db.proposal_version().insert(ProposalVersion {
        id: 0,
        proposal_id,
        author_identity: ctx.sender().to_string(),
        version_number: 1,
        change_summary: "Initial creation".to_string(),
        body_delta: body_markdown,
        metadata_delta_json: "{}".to_string(),
        git_commit_sha: None,
        timestamp: now,
    });
}

#[reducer]
pub fn update_proposal(
    ctx: &ReducerContext,
    proposal_id: u64,
    title: Option<String>,
    body_markdown: Option<String>,
    priority: Option<String>,
    maturity_level: Option<u32>,
    tags: Option<String>,
    change_summary: String,
) {
    let mut proposal = match ctx.db.proposal().id().find(proposal_id) {
        Some(p) => p,
        None => return,
    };
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;

    // Track changes for version delta
    let mut metadata_changes = String::from("{");

    if let Some(t) = title {
        proposal.title = t;
    }
    if let Some(p) = priority {
        metadata_changes.push_str(&format!("\"priority\":\"{}\",", p));
        proposal.priority = p;
    }
    if let Some(m) = maturity_level {
        metadata_changes.push_str(&format!("\"maturity_level\":{},", m));
        proposal.maturity_level = Some(m);
    }
    if let Some(ref tags) = tags {
        proposal.tags = Some(tags.clone());
    }

    let old_body = proposal.body_markdown.clone();
    let mut new_body_delta: Option<String> = None;
    if let Some(b) = body_markdown {
        if old_body.as_ref() != Some(&b) {
            new_body_delta = Some(b.clone());
        }
        proposal.body_markdown = Some(b);
    }

    metadata_changes.push('}');
    proposal.updated_at = now;
    ctx.db.proposal().id().update(proposal);

    // Get next version number
    let version_number = ctx
        .db
        .proposal_version()
        .iter()
        .filter(|v| v.proposal_id == proposal_id)
        .map(|v| v.version_number)
        .max()
        .unwrap_or(0)
        + 1;

    ctx.db.proposal_version().insert(ProposalVersion {
        id: 0,
        proposal_id,
        author_identity: ctx.sender().to_string(),
        version_number,
        change_summary,
        body_delta: new_body_delta,
        metadata_delta_json: metadata_changes,
        git_commit_sha: None,
        timestamp: now,
    });
}

#[reducer]
pub fn transition_proposal(ctx: &ReducerContext, proposal_id: u64, new_status: String) {
    let proposal = match ctx.db.proposal().id().find(proposal_id) {
        Some(p) => p,
        None => {
            log::warn!("Proposal {} not found", proposal_id);
            return;
        }
    };

    let old_status = proposal.status.clone();

    // ── Lifecycle Guards ─────────────────────────────────────────

    // Guard: Cannot transition from terminal states
    if old_status == "Complete" || old_status == "Rejected" || old_status == "Abandoned" {
        if new_status != "Complete" && new_status != "Rejected" && new_status != "Abandoned" {
            log::warn!(
                "Cannot transition {} from terminal status '{}' to '{}'",
                proposal.display_id, old_status, new_status
            );
            return;
        }
    }

    // Guard: MUST_HAVE_AC — Cannot move to Active without at least one AC
    if new_status == "Active" {
        let ac_count = ctx
            .db
            .proposal_criteria()
            .iter()
            .filter(|ac| ac.proposal_id == proposal_id)
            .count();
        if ac_count == 0 {
            log::warn!(
                "Cannot activate {}: must have at least one acceptance criterion",
                proposal.display_id
            );
            return;
        }
    }

    // Guard: MUST_HAVE_BODY — Cannot move to Active without body_markdown
    if new_status == "Active" {
        if proposal.body_markdown.is_none() || proposal.body_markdown.as_ref().unwrap().is_empty()
        {
            log::warn!(
                "Cannot activate {}: body_markdown is required",
                proposal.display_id
            );
            return;
        }
    }

    // Guard: BUDGET_CHECK — Cannot move to Active if agent has no budget remaining
    if new_status == "Active" {
        if let Err(msg) = check_budget(ctx, proposal.budget_limit_usd) {
            log::warn!("Cannot activate {}: {}", proposal.display_id, msg);
            return;
        }
    }

    // Guard: ALL_AC_VERIFIED — Cannot move to Complete without all ACs verified
    if new_status == "Complete" {
        let all_verified = ctx
            .db
            .proposal_criteria()
            .iter()
            .filter(|ac| ac.proposal_id == proposal_id)
            .all(|ac| ac.is_verified);

        if !all_verified {
            log::warn!(
                "Cannot complete {}: not all acceptance criteria are verified",
                proposal.display_id
            );
            return;
        }
    }

    // Guard: MUST_HAVE_DECISION — Cannot move to Accepted without a decision
    if new_status == "Accepted" {
        let has_decision = ctx
            .db
            .proposal_decision()
            .iter()
            .any(|d| d.proposal_id == proposal_id && d.status == "Accepted");
        if !has_decision {
            log::warn!(
                "Cannot accept {}: must have an accepted decision recorded",
                proposal.display_id
            );
            return;
        }
    }

    // ── Apply Transition ──────────────────────────────────────────

    let mut proposal = proposal;
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;
    proposal.status = new_status.clone();
    proposal.updated_at = now;
    ctx.db.proposal().id().update(proposal);

    // Auto-version on status change
    let version_number = ctx
        .db
        .proposal_version()
        .iter()
        .filter(|v| v.proposal_id == proposal_id)
        .map(|v| v.version_number)
        .max()
        .unwrap_or(0)
        + 1;

    ctx.db.proposal_version().insert(ProposalVersion {
        id: 0,
        proposal_id,
        author_identity: ctx.sender().to_string(),
        version_number,
        change_summary: format!("Status: {} → {}", old_status, new_status),
        body_delta: None,
        metadata_delta_json: format!("{{\"status\":\"{}\"}}", new_status),
        git_commit_sha: None,
        timestamp: now,
    });

    log::info!(
        "Transitioned {}: {} → {}",
        proposal_id,
        old_status,
        new_status
    );
}

// ── Proposal Criteria ──

#[reducer]
pub fn add_criteria(ctx: &ReducerContext, proposal_id: u64, description: String) {
    ctx.db.proposal_criteria().insert(ProposalCriteria {
        id: 0,
        proposal_id,
        description,
        is_verified: false,
    });
}

#[reducer]
pub fn check_criteria(ctx: &ReducerContext, proposal_id: u64, criteria_id: u64) {
    if let Some(mut criteria) = ctx.db.proposal_criteria().id().find(criteria_id) {
        if criteria.proposal_id == proposal_id {
            criteria.is_verified = true;
            ctx.db.proposal_criteria().id().update(criteria);
        }
    }
}

#[reducer]
pub fn remove_criteria(ctx: &ReducerContext, criteria_id: u64) {
    ctx.db.proposal_criteria().id().delete(criteria_id);
}

// ── Proposal Decision ──

#[reducer]
pub fn record_decision(
    ctx: &ReducerContext,
    proposal_id: u64,
    title: String,
    decision_summary: String,
    rationale: String,
    status: String,
) {
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;
    ctx.db.proposal_decision().insert(ProposalDecision {
        id: 0,
        proposal_id,
        title,
        decision_summary,
        rationale,
        status,
        created_at: now,
    });
}

// ── Workforce ──

#[reducer]
pub fn register_agent(ctx: &ReducerContext, agent_id: String, name: String, role: String, clearance_level: u8, squad_id: u32, workspace: String, api_key: String) {
    let identity = ctx.sender().to_string();
    ctx.db.workforce_registry().insert(WorkforceRegistry {
        identity,
        agent_id,
        name,
        role,
        clearance_level: clearance_level.min(5), // Max 5
        squad_id,
        workspace,
        api_key,
        is_active: true,
    });
}

#[reducer]
pub fn update_pulse(
    ctx: &ReducerContext,
    active_proposal_id: Option<u64>,
    status_message: String,
) {
    let identity = ctx.sender().to_string();
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;

    if let Some(mut pulse) = ctx.db.workforce_pulse().identity().find(&identity) {
        pulse.active_proposal_id = active_proposal_id;
        pulse.last_seen_at = now;
        pulse.status_message = status_message;
        pulse.is_zombie = false;
        ctx.db.workforce_pulse().identity().update(pulse);
    } else {
        ctx.db.workforce_pulse().insert(WorkforcePulse {
            identity,
            active_proposal_id,
            last_seen_at: now,
            status_message,
            is_zombie: false,
        });
    }
}

#[reducer]
pub fn retire_agent(ctx: &ReducerContext) {
    let identity = ctx.sender().to_string();
    if let Some(mut agent) = ctx.db.workforce_registry().agent_id().find(&identity) {
        agent.is_active = false;
        ctx.db.workforce_registry().agent_id().update(agent);
    }
}

// ── Claim & Budget ──

#[reducer]
pub fn claim_proposal(
    ctx: &ReducerContext,
    proposal_id: u64,
    agent_identity: String,
    cost_estimate_usd: f64,
) {
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;

    // Guard: Proposal must exist and be in 'Accepted' or 'Draft' status
    let proposal = match ctx.db.proposal().id().find(proposal_id) {
        Some(p) => p,
        None => {
            log::warn!("Proposal {} not found", proposal_id);
            return;
        }
    };

    if proposal.status != "Accepted" && proposal.status != "Draft" && proposal.status != "New" {
        log::warn!(
            "Cannot claim {}: status '{}' is not claimable (must be Accepted, Draft, or New)",
            proposal.display_id,
            proposal.status
        );
        return;
    }

    // Guard: Check agent budget (from spending_caps)
    if let Some(caps) = ctx
        .db
        .spending_caps()
        .agent_identity()
        .find(&agent_identity)
    {
        if caps.is_frozen {
            log::warn!(
                "Cannot claim {} for {}: agent is frozen",
                proposal.display_id,
                agent_identity
            );
            return;
        }

        let remaining_budget = caps.daily_limit_usd - caps.total_spent_today_usd;
        if cost_estimate_usd > remaining_budget {
            log::warn!(
                "Cannot claim {} for {}: estimate ${} exceeds remaining budget ${}",
                proposal.display_id,
                agent_identity,
                cost_estimate_usd,
                remaining_budget
            );
            return;
        }
    }

    // Guard: Check proposal budget limit
    if cost_estimate_usd > proposal.budget_limit_usd {
        log::warn!(
            "Cannot claim {}: estimate ${} exceeds proposal budget ${}",
            proposal.display_id,
            cost_estimate_usd,
            proposal.budget_limit_usd
        );
        return;
    }

    // Claim: log the spending and activate the proposal
    ctx.db.spending_log().insert(SpendingLog {
        id: 0,
        proposal_id,
        agent_identity: agent_identity.clone(),
        cost_usd: cost_estimate_usd,
        timestamp: now,
    });

    // Update spending caps
    if let Some(mut caps) = ctx
        .db
        .spending_caps()
        .agent_identity()
        .find(&agent_identity)
    {
        caps.total_spent_today_usd += cost_estimate_usd;
        if caps.total_spent_today_usd >= caps.daily_limit_usd {
            caps.is_frozen = true;
            log::warn!(
                "Auto-frozen {}: daily limit reached after claim",
                agent_identity
            );
        }
        ctx.db.spending_caps().agent_identity().update(caps);
    }

    // Transition to Active
    let mut proposal = proposal;
    proposal.status = "Active".to_string();
    proposal.updated_at = now;
    let display_id = proposal.display_id.clone();
    ctx.db.proposal().id().update(proposal);

    // Auto-version
    let version_number = ctx
        .db
        .proposal_version()
        .iter()
        .filter(|v| v.proposal_id == proposal_id)
        .map(|v| v.version_number)
        .max()
        .unwrap_or(0)
        + 1;

    ctx.db.proposal_version().insert(ProposalVersion {
        id: 0,
        proposal_id,
        author_identity: agent_identity.clone(),
        version_number,
        change_summary: format!("Claimed by {} (budget: ${})", agent_identity, cost_estimate_usd),
        body_delta: None,
        metadata_delta_json: format!(
            "{{\"status\":\"Active\",\"claimed_by\":\"{}\",\"budget_estimate\":{}}}",
            agent_identity, cost_estimate_usd
        ),
        git_commit_sha: None,
        timestamp: now,
    });

    log::info!(
        "Claimed {}: {} → Active (budget: ${})",
        display_id,
        agent_identity,
        cost_estimate_usd
    );
}

// ── Spending ──

#[reducer]
pub fn log_spending(
    ctx: &ReducerContext,
    proposal_id: u64,
    agent_identity: String,
    cost_usd: f64,
) {
    // Guard: Check if agent is frozen
    if let Some(caps) = ctx
        .db
        .spending_caps()
        .agent_identity()
        .find(&agent_identity)
    {
        if caps.is_frozen {
            log::warn!(
                "Cannot log spending for {}: agent is frozen",
                agent_identity
            );
            return;
        }
        // Guard: Check daily limit
        if caps.total_spent_today_usd + cost_usd > caps.daily_limit_usd {
            log::warn!(
                "Cannot log spending for {}: would exceed daily limit (${} + ${} > ${})",
                agent_identity,
                caps.total_spent_today_usd,
                cost_usd,
                caps.daily_limit_usd
            );
            return;
        }
    }

    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;
    ctx.db.spending_log().insert(SpendingLog {
        id: 0,
        proposal_id,
        agent_identity: agent_identity.clone(),
        cost_usd,
        timestamp: now,
    });

    // Update daily total
    if let Some(mut caps) = ctx.db.spending_caps().agent_identity().find(&agent_identity) {
        caps.total_spent_today_usd += cost_usd;
        // Auto-freeze if limit exceeded
        if caps.total_spent_today_usd >= caps.daily_limit_usd {
            caps.is_frozen = true;
            log::warn!(
                "Auto-frozen {}: daily limit reached (${})",
                agent_identity,
                caps.total_spent_today_usd
            );
        }
        ctx.db.spending_caps().agent_identity().update(caps);
    }
}

#[reducer]
pub fn set_spending_caps(
    ctx: &ReducerContext,
    agent_identity: String,
    daily_limit_usd: f64,
) {
    if let Some(mut caps) = ctx
        .db
        .spending_caps()
        .agent_identity()
        .find(&agent_identity)
    {
        caps.daily_limit_usd = daily_limit_usd;
        ctx.db.spending_caps().agent_identity().update(caps);
    } else {
        ctx.db.spending_caps().insert(SpendingCaps {
            agent_identity,
            daily_limit_usd,
            total_spent_today_usd: 0.0,
            is_frozen: false,
        });
    }
}

#[reducer]
pub fn freeze_spending(ctx: &ReducerContext, agent_identity: String, is_frozen: bool) {
    if let Some(mut caps) = ctx
        .db
        .spending_caps()
        .agent_identity()
        .find(&agent_identity)
    {
        caps.is_frozen = is_frozen;
        ctx.db.spending_caps().agent_identity().update(caps);
    }
}

// ── Security ──

#[reducer]
pub fn grant_acl(
    ctx: &ReducerContext,
    agent_identity: String,
    target_proposal_id: u64,
    permission_id: String,
) {
    ctx.db.security_acl().insert(SecurityAcl {
        id: 0,
        agent_identity,
        target_proposal_id,
        permission_id,
    });
}

#[reducer]
pub fn revoke_acl(ctx: &ReducerContext, acl_id: u64) {
    ctx.db.security_acl().id().delete(acl_id);
}

#[reducer]
pub fn audit_log(ctx: &ReducerContext, action: String, severity: String) {
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;
    ctx.db.security_audit_log().insert(SecurityAuditLog {
        id: 0,
        actor_identity: ctx.sender().to_string(),
        action,
        severity,
        timestamp: now,
    });
}

// ── Memory ──

#[reducer]
pub fn set_memory(
    ctx: &ReducerContext,
    scope_proposal_id: u64,
    key: String,
    val: String,
) {
    let identity = ctx.sender().to_string();
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;

    // Upsert: find existing and update, or insert new
    let existing = ctx
        .db
        .agent_memory()
        .iter()
        .find(|m| m.agent_identity == identity && m.scope_proposal_id == scope_proposal_id && m.key == key);

    if let Some(mut mem) = existing {
        mem.val = val;
        mem.updated_at = now;
        ctx.db.agent_memory().id().update(mem);
    } else {
        ctx.db.agent_memory().insert(AgentMemory {
            id: 0,
            agent_identity: identity,
            scope_proposal_id,
            key,
            val,
            updated_at: now,
        });
    }
}

#[reducer]
pub fn wipe_memory(ctx: &ReducerContext, scope_proposal_id: Option<u64>) {
    let identity = ctx.sender().to_string();
    let ids_to_delete: Vec<u64> = ctx
        .db
        .agent_memory()
        .iter()
        .filter(|m| {
            m.agent_identity == identity
                && scope_proposal_id.map_or(true, |s| m.scope_proposal_id == s)
        })
        .map(|m| m.id)
        .collect();

    for id in ids_to_delete {
        ctx.db.agent_memory().id().delete(id);
    }
}

// ── Messaging ──

#[reducer]
pub fn send_message(ctx: &ReducerContext, channel: String, content: String) {
    let sender = ctx.sender().to_string();
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;
    ctx.db.message_ledger().insert(MessageLedger {
        id: 0,
        channel_name: channel,
        sender_identity: sender,
        content,
        timestamp: now,
    });
}

#[reducer]
pub fn subscribe_channel(ctx: &ReducerContext, channel: String, subscribe: bool) {
    let identity = ctx.sender().to_string();
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;
    
    // Store subscription in agent_memory for now
    let key = format!("subscribed_to_{}", channel);
    if subscribe {
        ctx.db.agent_memory().insert(AgentMemory {
            id: 0,
            agent_identity: identity,
            scope_proposal_id: 0,
            key,
            val: "true".to_string(),
            updated_at: now,
        });
    } else {
        // Remove subscription
        let ids_to_delete: Vec<u64> = ctx
            .db
            .agent_memory()
            .iter()
            .filter(|m| m.agent_identity == identity && m.key == key)
            .map(|m| m.id)
            .collect();

        for id in ids_to_delete {
            ctx.db.agent_memory().id().delete(id);
        }
    }
}

// ── Proposal Deletion ──

#[reducer]
pub fn delete_proposal(ctx: &ReducerContext, proposal_id: u64) {
    // Guard: Only allow deletion of test proposals
    let proposal = match ctx.db.proposal().id().find(proposal_id) {
        Some(p) => p,
        None => {
            log::warn!("Proposal {} not found", proposal_id);
            return;
        }
    };

    // Only allow deletion of test proposals
    if !proposal.display_id.starts_with("TEST") && !proposal.display_id.starts_with("DIR-001") {
        log::warn!(
            "Cannot delete {}: not a test proposal",
            proposal.display_id
        );
        return;
    }

    // Delete associated records
    let criteria_ids: Vec<u64> = ctx
        .db
        .proposal_criteria()
        .iter()
        .filter(|c| c.proposal_id == proposal_id)
        .map(|c| c.id)
        .collect();

    for id in criteria_ids {
        ctx.db.proposal_criteria().id().delete(id);
    }

    let decision_ids: Vec<u64> = ctx
        .db
        .proposal_decision()
        .iter()
        .filter(|d| d.proposal_id == proposal_id)
        .map(|d| d.id)
        .collect();

    for id in decision_ids {
        ctx.db.proposal_decision().id().delete(id);
    }

    let version_ids: Vec<u64> = ctx
        .db
        .proposal_version()
        .iter()
        .filter(|v| v.proposal_id == proposal_id)
        .map(|v| v.id)
        .collect();

    for id in version_ids {
        ctx.db.proposal_version().id().delete(id);
    }

    // Delete the proposal
    ctx.db.proposal().id().delete(proposal_id);

    log::info!("Deleted proposal: {}", proposal.display_id);
}

// ── Sync & Export ──

#[reducer]
pub fn record_sync(
    ctx: &ReducerContext,
    artifact_path: String,
    proposal_id: u64,
    sdb_hash: String,
    git_commit_sha: String,
    status: String,
    error_message: Option<String>,
) {
    let now = ctx.timestamp.to_micros_since_unix_epoch() as u64;

    if let Some(mut entry) = ctx.db.sync_ledger().artifact_path().find(&artifact_path) {
        entry.last_sdb_hash = sdb_hash;
        entry.last_git_commit = git_commit_sha;
        entry.sync_status = status;
        entry.last_synced_at = now;
        entry.error_message = error_message;
        ctx.db.sync_ledger().artifact_path().update(entry);
    } else {
        ctx.db.sync_ledger().insert(SyncLedger {
            artifact_path,
            proposal_id,
            last_sdb_hash: sdb_hash,
            last_git_commit: git_commit_sha,
            sync_status: status,
            last_synced_at: now,
            error_message,
        });
    }
}

#[reducer]
pub fn mark_sync_error(ctx: &ReducerContext, artifact_path: String, error_message: String) {
    if let Some(mut entry) = ctx.db.sync_ledger().artifact_path().find(&artifact_path) {
        entry.sync_status = "ERROR".to_string();
        entry.error_message = Some(error_message);
        entry.last_synced_at = ctx.timestamp.to_micros_since_unix_epoch() as u64;
        ctx.db.sync_ledger().artifact_path().update(entry);
    }
}
