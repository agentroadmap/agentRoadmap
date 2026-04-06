For a 100-agent enterprise operating on **OpenClaw** and a shared control plane, a shared vocabulary is the only thing preventing "Agent Hallucination" and "Human Confusion." 

This **`glossary.md`** should be placed in your `business/` or `product/` directory so SMEs and your agents (Workforce) use the same definitions.

---

# `glossary.md`

## 🏗️ Architectural Terms

* **ACP (Agent Communication Protocol):** The standard JSON-RPC protocol used by **OpenClaw** to bridge human messages, tool calls, and agent responses.
* **Artifact:** Any permanent, versioned file (Markdown, JSON, Code) exported from the control plane to the Git-synced filesystem.
* **DAG (Directed Acyclic Graph):** The logical structure of the **agentRoadmap**, where nodes represent RFCs or Tasks, and edges represent dependencies.
* **MCP (Model Context Protocol):** The interface layer that allows agents to safely interact with local tools (filesystem, state, browser) without direct OS access.
* **NNL (Neural Network Ledger):** A snapshot of the internal state and "weights" of a specific project's decision history within the control plane.

---

## 🤖 Workforce & Governance

* **Adversarial Review:** A mandatory step in the RFC lifecycle where a **Skeptic Agent** attempts to find flaws, security risks, or budget inefficiencies in a proposal.
* **Agent Identity (Identity):** A cryptographic public key in the control plane that uniquely identifies an agent and governs its access permissions.
* **HITL (Human-in-the-Loop):** A governance checkpoint (usually Gary, Derek, or Nolan) required to move an RFC from *Review* to *Active*.
* **Pulse:** A best-effort freshness signal emitted by agents to report health, latency, and current task status. Missing pulses are advisory and must not trigger automatic punishment on their own.
* **RFC (Request for Comments):** The primary unit of work. A 9-stage document that defines a proposed change to the Product or Business domain.
* **Squad:** A logical grouping of agents (e.g., "Infra Squad") sharing a specific budget and specialized MCP tools.

---

## 💰 Economics & Performance

* **Burn Rate:** The real-time USD velocity of the workforce, measured in tokens per minute/hour.
* **Cache Hit Ratio:** The percentage of agent queries resolved using local **Context** or shared memory rather than expensive, fresh LLM tokens.
* **Circuit Breaker:** A human-controlled pause used to stop an agent or squad during an anomaly. It must never fire automatically from missed telemetry alone.
* **Token ROI:** A business metric calculating the value of a generated Artifact relative to the cost of the LLM tokens used to create it.

---

## 🛠️ Pipeline & Execution

* **Pre-flight Check:** A local, low-cost verification script (Linting, Security scan) that a **Coder Agent** must pass before promoting an artifact to Staging.
* **Promotion:** The act of moving an artifact from a "Draft" state in the control plane to the `main` branch in the Git repository.
* **Staging:** An isolated environment in the `pipeline/` domain where **QA Agents** run regressions before human approval.

---

### **Implementation Note for Gary:**
I recommend adding a "Glossary Look-up" tool to your **MCP Server**. This allows an agent to call `get_definition("NNL")` if it encounters an unfamiliar term in an RFC. This reduces "semantic drift" across your 100-agent team.

**Would you like me to add any specific terms related to your "Material Science" or "IT Integration" expertise to this glossary?**
