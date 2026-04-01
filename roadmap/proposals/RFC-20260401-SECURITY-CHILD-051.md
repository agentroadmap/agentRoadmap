---
id: RFC-20260401-SECURITY-CHILD-051
display_id: RFC-20260401-SECURITY-CHILD-051
proposal_type: TECHNICAL
title: "Agent Identity & Authentication Protocol"
status: Draft
category: child
domain_id: 
parent: RFC-20260401-SECURITY
assignee: []
created_date: "2026-04-01 20:30"
updated_date: "2026-04-01 20:30"
labels: ["security", "identity", "authentication"]
dependencies: ["RFC-20260401-SECURITY", "RFC-20260401-WORKFORCE-CORE"]
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Establishes cryptographic identity for every agent. Each agent receives an Ed25519 key pair and a unique API token (JWT) signed by the daemon. The token is used for all authenticated API requests. Key pairs are used for message signing (PROP-MSG-049) and host certificates (PROP-SEC-056).
<!-- SECTION:DESCRIPTION:END -->

## Old State Reference
- **PROP-SEC-051**: Agent Identity & Authentication Protocol
- **Dependencies**: PROP-REG-005 (Agent Registry), PROP-API-038 (Daemon API)
- **Blocks**: PROP-MSG-049 security, PROP-FED-046 security, PROP-SEC-052

## Acceptance Criteria
1. Every agent has a unique Ed25519 key pair
2. JWT tokens are issued by daemon and validated on every request
3. Token expiration and rotation mechanism exists
4. Identity verification for agent-to-agent communication

## 📝 Decision Log
* **Human Feedback:** `[Inputs from TUI/WebSash]`
* **Final Consensus:** `[Approved/Rejected reasoning]`
* **Snapshot Hash:** `[Git commit SHA or SDB log ID]`
