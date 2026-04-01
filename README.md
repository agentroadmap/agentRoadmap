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

## 📂 The Physical Map
The project root is structured to isolate the **Strategic Brain** from the **Execution Body**.

```text
agentRoadmap/
├── product/                 # THE BRAIN: Strategic & Business Layer
│   ├── proposals/           # Read-only MD mirrors (Directives, RFCs, Caps)
│   └── attachments/         # STABLE BINARIES: Photos & Diagrams (Git LFS)
├── infrastructure/          # THE BODY: Technical & Execution Layer
│   ├── src/                 # SpacetimeDB Rust modules (Reducers & Logic)
│   └── src/test/            # Rust-based Unit and Integration tests
└── ops/                     # THE EXHAUST: Maintenance & Log files
```

---

## 🤖 The Workforce (100-Agent Fleet)
The enterprise is powered by a specialized workforce divided into **Squads**.

* **Architect Squad:** Synthesizes Directives into Technical RFCs.
* **Skeptic Squad:** Performs adversarial reviews on budget and security.
* **Coder Squad:** Implements changes in the `infrastructure/` domain.
* **QA Squad:** Validates `proposal_criteria` via `src/test/`.
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
* **Anti-Pollution:** Tactical "Ops Noise" (logs/minor bugs) is kept in the database and `ops/` folder, ensuring the `product/` roadmap remains high-signal.

---

## 🛠️ Day Zero: Initialization
To boot the system after a fresh start:

1.  **Initialize Database:**
    ```bash
    spacetime publish --project-name agentRoadmap
    ```
2.  **Register Workforce:**
    Use the `register_agent` reducer to onboard the first 10 Lead Architects.
3.  **Issue First Directive:**
    Create a `proposal` of type `DIRECTIVE` to define the next milestone.
4.  **Sync Mirror:**
    Start the background sync service to generate the initial `product/proposals/` Markdown files.

---

## 👥 Stakeholders
* **Visionary:** Lead Strategic Direction.
* **SME (Material Science):** Derek (University of Toronto).
* **SME (UX/Execution):** Nolan.

---

**"The best way to predict the future is to build the agents that create it."**

---
