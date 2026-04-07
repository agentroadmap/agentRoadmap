**agentRoadmap** **Agent-Native Enterprise Resource Planning (ERP)** 


# Design Document: agentRoadmap Architecture Overhaul (v2.0)
**Date:** 2026-03-31  
**Architect:** Gemini (AI Collaborator) & Gary (Visionary)  
**Core Stack:** Shared State Layer (State), Git (Artifacts), OpenClaw (Execution), MCP (Interface).

---

## 1. System Philosophy
The project operates on a **Dual-State Model**:
* **Active State Layer:** High-frequency coordination data (budgets, real-time messaging, active tasks).
* **Permanent Artifacts (Filesystem/Git):** Human-readable, versioned snapshots of the project's "Soul" and "Body."

---

## 2. Domain Directory Structure (The Artifact Layer)

### 🏗️ Strategy & Design
* **`product/`**: The "Why" and "What." Contains RFCs, finalized Decision Records (ADRs), and snapshots of the **DAG** (Directed Acyclic Graph) representing the product’s logical dependencies.
* **`business/`**: Business architecture and process mapping. Defines the value chain the agents are building within.
* **`context/`**: Managed in the active state layer but exported here. Defines how "Short-term" vs "Long-term" memory is partitioned for the agents.

### 🤖 Workforce & Orchestration
* **`workforce/`**: The Registry. Stores agent identities, skill matrices, and **status events** showing freshness and activity.
* **`project/`**: The "When" and "Who." Task boards, Issue trackers, and the Orchestration logic that moves a product from proposal to code.
* **`messaging/`**: Configs for Event-driven protocols. Defines the relays and "Rules of Engagement" for agent-to-agent talk.

### 💰 Resource & Model Management
* **`model/`**: Metadata for LLMs. Ratings, speed/cost attributes, and the **API Key Allocation** logic (mapping keys to specific agents/squads).
* **`spending/`**: The "Financial Firewall." Tracks USD/Token consumption, enforces rate limiting, and exposes human-approved circuit breakers when an agent behaves abnormally.
* **`mcp/`**: The interface layer. Standardized tool definitions that allow agents to interact with the OS, Web, and the active state layer.

### 🛠️ Engineering & Infrastructure
* **`pipeline/`**: Testing, regression, and promotion. Agents must "pass" through here to move code from `draft` to `main`.
* **`infrastructure/`**: Dependency trees, Docker/containerization configs, and networking protocols (state sync / WS).

---

## 3. Human Interface Layer
* **TUI (Terminal User Interface):** The "Engineer’s Console" for low-latency monitoring and local CLI control via OpenClaw.
* **WebSash:** The high-level Management Dashboard for visualizing the DAG, budget gauges, and workforce "Pulse."
* **Mobile App:** The "Visionary’s Remote." Used for approving RFCs or emergency spend-limit increases while on the go.

---

## 4. Operational Flow: The "Sync Loop"



1.  **Directive:** Human issues a Visionary Statement via **WebSash/TUI**.
2.  **State Change:** A `Task` is created in the active control plane (`project/`).
3.  **Execution:** An agent from the **`workforce/`** uses an **`mcp/`** tool to perform research via **OpenClaw**.
4.  **Spending Check:** Before the LLM call, the **`spending/`** module checks the **`model/`** allocation.
5.  **Artifact Generation:** Once the task hits a milestone, a "Sync Worker" exports the state to the relevant folder (e.g., an RFC in **`product/`**) and commits to Git.

---

## 5. Security & Governance
* **Access Control:** Managed in `workforce/`. Agents only see the sub-folders and MCP tools required for their specific Role/Squad.
* **Audit Trail:** Every Git commit linked to a workflow event ID ensures traceability of who spent what budget to make which decision.

---

### **Architect's Closing Suggestion:**
To avoid "Folder Fatigue," I recommend adding a **`.metadata.json`** in every subfolder. This file should describe to a *newly spawned agent* exactly what that domain is for. For example, `spending/.metadata.json` would tell an agent: *"You are authorized to read this to check your remaining balance, but you cannot write to it."*
