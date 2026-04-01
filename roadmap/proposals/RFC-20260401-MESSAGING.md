---
id: RFC-20260401-MESSAGING
display_id: RFC-20260401-MESSAGING
proposal_type: COMPONENT
category: FEATURE
domain_id: 
title: "Messaging & Synchronization"
status: Draft
assignee: []
created_date: "2026-04-01 20:21"
updated_date: "2026-04-01 20:21"
labels: ["messaging", "sync", "communication"]
dependencies: ["RFC-20260401-DATA-MODEL", "RFC-20260401-MOBILE-VISIONARY"]
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Messaging domain for inter-agent communication. Manages message ledgers and synchronization via SpacetimeDB.
<!-- SECTION:DESCRIPTION:END -->

## SpacetimeDB Tables

### MessageLedger
```rust
#[table(name = message_ledger, accessor = messaging)]
pub struct MessageLedger {
    #[primarykey]
    pub id: u32,
    pub sender_id: u32,
    pub receiver_id: u32,
    pub channel: String,
    pub content: String,
    pub timestamp: Timestamp,
    pub read: bool,
}
```

### SyncLedger
```rust
#[table(name = sync_ledger, accessor = messaging)]
pub struct SyncLedger {
    #[primarykey]
    pub id: u32,
    pub agent_id: u32,
    pub last_sync: Timestamp,
    pub status: String, // online, offline, syncing
    pub pending_messages: u32,
}
```

## 📝 Decision Log
* **Human Feedback:** `[Inputs from TUI/WebSash]`
* **Final Consensus:** `[Approved/Rejected reasoning]`
* **Snapshot Hash:** `[Git commit SHA or SDB log ID]`
