---
id: RFC-20260401-SECURITY
display_id: RFC-20260401-SECURITY
proposal_type: TECHNICAL
category: SECURITY
domain_id: ENGINE
title: "Security & Access Control"
status: Draft
assignee: []
created_date: "2026-04-01 20:20"
updated_date: "2026-04-01 20:20"
labels: ["security", "acl", "audit"]
dependencies: ["RFC-20260401-DATA-MODEL", "RFC-20260401-WORKFORCE-CORE"]
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security domain for the 100-agent workforce. Manages access control lists and audit logging via SpacetimeDB.
<!-- SECTION:DESCRIPTION:END -->

## SpacetimeDB Tables

### SecurityAcl
```rust
#[table(name = security_acl, accessor = security)]
pub struct SecurityAcl {
    #[primarykey]
    pub id: u32,
    pub agent_id: u32,
    pub resource: String,
    pub permission: String, // read, write, admin
    pub granted_by: u32,
    pub granted_at: Timestamp,
}
```

### SecurityAuditLog
```rust
#[table(name = security_audit_log, accessor = security)]
pub struct SecurityAuditLog {
    #[primarykey]
    pub id: u32,
    pub actor_identity: Identity,
    pub action: String,
    pub severity: String, // info, warning, critical
    pub timestamp: Timestamp,
    pub details: String,
}
```

## 📝 Decision Log
* **Human Feedback:** `[Inputs from TUI/WebSash]`
* **Final Consensus:** `[Approved/Rejected reasoning]`
* **Snapshot Hash:** `[Git commit SHA or SDB log ID]`
