# 🗺️ AgentRoadmap

**Autonomous AI Agent-Native Product Development Platform.**

Build your AI agent team. Turn your vision into your dream product — through continuous interaction, continuous research, refinement, and instant prototyping.

---

# 🚀 agentRoadmap V2 0.5.0: The Agentic Enterprise

**Visionary:** Gary  
**Core Stack:** Postgres | OpenClaw CLI | TypeScript | Git  
**Architecture:** Universal Entity Lifecycle (v2.5)

## 📌 Project Vision
`agentRoadmap` is an agent-native product development engine. The system treats every business idea, technical RFC, and code component as a **Universal Proposal** managed through a shared roadmap workflow.

### **The "Roadmap-First" Doctrine**
* **Source of Truth:** Roadmap markdown plus the active Postgres workflow tables.
* **The Working Surface:** Local filesystem for proposals, docs, and decisions.
* **The Protocol:** Agents collaborate through MCP tools and shared workflow state; humans steer via Directives.

---

## 🛠️ Get Started
To boot the system after a fresh start:

1.  **Install & Initialize:**
    ```bash
    npm install -g agentRoadmap
    roadmap init
    ```
2.  **Launch the Dashboard:**
    ```bash
    roadmap board
    ```
3.  **Issue First Directive:**
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
│   ├── product/             # State Machine definitions & RFC Templates
│   ├── workforce/           # Agent Fleet profiles & squad definitions
│   ├── context/             # Token efficiency context and memory management 
│   ├── spending/            # Auditable and traceable token spending
│   └── model/               # MCP and model repository
├── src/                     # THE BODY: Execution Layer (TypeScript)
│   ├── core/                # Unified Proposal Lifecycle Manager
│   ├── mcp/                 # Model Context Protocol (LLM connectivity)
│   └── ui/                  # TUI + web dashboard surfaces
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

## 🏛️ Governance: The Refined Lifecycle
Every entity progresses through a simplified state machine:

1.  **Draft:** Initial entry, research, and enrichment of proposal development. Define acceptance criteria.
2.  **Review:** Peer and Skeptic analysis.
3.  **Building:** AI agents coding and unit testing phase.
4.  **Accepted:** Passes all `proposal_criteria` and regression tests.
5.  **Complete:** Merged into the main, job delivered.

**Universal Maturity Model:** Within each state, entities track fine-grained progress:
*   **new**: Freshly entered state (White).
*   **active**: Work in progress (Yellow).
*   **mature**: Ready to move to the next state (Green, indicated with `✓`).
*   **obsolete**: No longer relevant (Grey, indicated with `✖`).

**Archives:** Rejected, Abandoned, and Replaced items are moved to historical archives and hidden from the main board by default.

---

## 🛡️ Security & Provenance
* **Zero-Trust:** Agents operate under strict `security_acl`. No agent has "root" access.
* **Version Ledger:** Every change to a proposal is recorded in `proposal_version` with a Git-style delta.
* **Anti-Pollution:** Tactical "Ops Noise" is kept in the database, ensuring the `roadmap/` folder remains high-signal.

---

**"The best way to predict the future is to build the agents that create it."**

---
