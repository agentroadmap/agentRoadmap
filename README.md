# 🗺️ AgentRoadmap

**Autonomous AI Agent-Native Product Development Platform.**

Build your AI agent team. Turn your vision into your dream product — through continuous interaction, continuous research, refinement, and instant prototyping.

---

# 🚀 agentRoadmap V2 0.5.0: The Agentic Enterprise

**Visionary:** Gary  
**Core Stack:** SpacetimeDB 2.0 | OpenClaw CLI | Rust | Git LFS  
**Architecture:** Universal Entity Lifecycle (v2.5)

## 📌 Project Vision
`agentRoadmap` is a decentralized, agent-native project management engine. Unlike traditional tools that suffer from "Semantic Decay" and "Merge Conflict Hell," this system treats every business idea, technical RFC, and code component as a **Universal Proposal** managed in a real-time state engine.

### **The "Database-First" Doctrine**
* **Source of Truth:** SpacetimeDB (Memory-resident, ACID-compliant).
* **The Mirror:** Local Filesystem (Read-only Markdown for humans).
* **The Protocol:** Agents collaborate via Reducers; humans steer via Directives.

---

## 🛠️ Get Started
To boot the system after a fresh start:

1.  **Initialize Database:**
    ```bash
    cd spacetimedb-module
    spacetime publish --project-name agent-roadmap-v2
    ```
2.  **Generate Bindings:**
    ```bash
    spacetime generate --lang typescript --out-dir ../src/bindings
    ```
3.  **Onboard Agents:**
    Use the `register_agent` reducer to onboard the workforce pool.
4.  **Issue First Directive:**
    ```bash
    roadmap proposal create "Define Core Architecture" --domain CORE --type DIRECTIVE
    ```

---

## 📂 The Physical Map
The project is structured to isolate the **Strategic Brain** from the **Nervous System** and **Execution Body**.

```text
agentRoadmap/
├── roadmap/                 # THE BRAIN: Strategic & Business Layer
│   ├── business/            # Business Design, Strategy, and Financials
│   ├── dataModel/           # Canonical Schema (v2.5) & DDL
│   ├── product/             # State Machine definitions & RFC Templates
│   └── workforce/           # Agent Fleet profiles & squad definitions
├── spacetimedb-module/      # THE SOUL: Nervous System (Rust)
│   └── src/lib.rs           # 14 Tables & Reducers (The Source of Truth)
├── src/                     # THE BODY: Execution Layer (TypeScript)
│   ├── core/proposal/       # Unified Proposal Lifecycle Manager
│   ├── bindings/            # Auto-generated DB Interface
│   ├── mcp/                 # Model Context Protocol (LLM connectivity)
│   └── web/                 # Live Dashboard (WebSockets / Subscriptions)
└── package.json             # Enterprise-wide configuration
```

---

## 🤖 The Workforce (100-Agent Fleet)
The enterprise is powered by a specialized workforce divided into **Squads**.

* **Architect Squad:** Synthesizes Directives into Technical RFCs.
* **Skeptic Squad:** Performs adversarial reviews on budget and security.
* **Coder Squad:** Implements changes in the physical execution domains.
* **QA Squad:** Validates `proposal_criteria` via automated test suites.
* **Auditor Agent:** Monitors `spending_caps` and `security_acl` in real-time.

---

## 🏛️ Governance: The 9-Stage Lifecycle
Every entity (Directive, Capability, Technical RFC, Component) must progress through the unified state machine:

1.  **New:** Initial entry.
2.  **Draft:** Active development.
3.  **Review:** Peer and Skeptic analysis.
4.  **Active:** Execution/Coding phase.
5.  **Accepted:** Passes all `proposal_criteria`.
6.  **Complete:** Merged into the physical architecture.
7.  **Rejected / Abandoned / Replaced:** Historical archives.

---

## 🛡️ Security & Provenance
* **Zero-Trust:** Agents operate under strict `security_acl`. No agent has "root" access; everything is a requested permission.
* **Version Ledger:** Every change to a proposal is recorded in `proposal_version` with a Git-style delta and an actor identity.
* **Anti-Pollution:** Tactical "Ops Noise" (logs/minor bugs) is kept in the database, ensuring the `roadmap/` folder remains high-signal.

---

## 👥 Stakeholders
* **Visionary:** Lead Strategic Direction.
* **SME (Material Science):** Derek (University of Toronto).
* **SME (UX/Execution):** Nolan.

---

**"The best way to predict the future is to build the agents that create it."**

---
