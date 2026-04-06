# Strategic Analysis: Autonomous Agent Product Lifecycle Architecture

## 1. Executive Summary

This document expands on the Product Manager's competitive analysis regarding the unique market opportunity for **agentRoadmap**. While platforms like Jira/Linear focus on human tracking and CrewAI/AutoGen focus on transient execution, agentRoadmap aims to provide a **deterministic, end-to-end autonomous product lifecycle**. To realize this vision and ensure the lifecycle "actually works" in a production environment, the system architecture must evolve to guarantee safety, reliability, and intelligent resource allocation.

## 2. Resolving Phantom Handoffs: Lease-Based Claiming

A critical failure mode in multi-agent systems is the "phantom handoff," where a state is permanently claimed by an agent that subsequently crashes, stalls, or disconnects.

**Current Solution:**
The architecture successfully addresses this via **Lease-Based Claiming** rather than permanent assignment.
* **Heartbeat Mechanism:** Agents must actively renew their lease on a state.
* **Auto-Recovery:** If an agent drops offline and misses its heartbeat window, the lease expires. The state is automatically returned to the `Ready` pool for another agent to pick up via the resource-aware pickup scorer.
* **Transactional Safety:** With the transition to Postgres, these leases are managed via atomic transactions, preventing race conditions during claim and release.

## 3. Agent Sandboxing & Containerization

Agents executing arbitrary code, installing dependencies, and running tests introduce massive security and stability risks if run directly on the host machine. To manage a potentially chaotic, multi-agent environment safely, strict isolation is required.

**Architectural Direction:**
* **Individual Isolated Sandboxes:** Every agent operates within its own isolated boundary.
* **Docker/Pod-Based Execution:** The major components (agents, language servers, test runners) will be deployed as isolated Docker containers or Kubernetes pods.
* **Ephemeral Workspaces:** Agents spin up inside a container, pull the required context via the Postgres/Daemon API, execute their tasks, and the container is destroyed or recycled.
* **Host Protection:** This guarantees that runaway processes, infinite loops, or malicious code modifications cannot damage the host system or cross-contaminate other active states.

## 4. Rich Agent Profiles (Building on `agency-agents`)

For the dynamic team builder and pickup scorer to function optimally, the system needs deep understanding of what each agent is capable of. 

**Architectural Direction:**
* **Foundation:** Incorporate the rich agent profile structures from the `agency-agents` ecosystem as a baseline.
* **Evolution:** Build on top of these profiles by adding dynamic, roadmap-specific metadata (e.g., current workload, historical success rate on specific labels, Postgres connection status).
* **Skill Matrix:** Profiles will clearly define capabilities (e.g., `typescript`, `testing`, `mcp`), cost classes, and availability, allowing the system to match the exact right agent persona to the specific demands of a state.

## 5. LLM Management & Capability Profiling

Treating all LLMs as interchangeable commodities leads to either overspending (using Opus for simple linting) or task failure (using Haiku for deep architectural refactoring). LLM management is partially in scope to ensure cost-efficiency and high success rates.

**Architectural Direction:**
* **Capability Profiling:** Actively profile the strengths, weaknesses, context window limits, and reasoning capabilities of various LLMs.
* **Intelligent Routing:** The dynamic team builder and pickup scorer will use this profiling to allocate tasks wisely. High-complexity `architect` states require high-tier reasoning models, while routine `tester` or `reviewer` states can be routed to faster, more economical models.
* **Cost vs. Priority Matrix:** Align the `costClass` of the agent's underlying LLM with the `priority` of the Roadmap state, ensuring budget is spent where it delivers the highest ROI.

## 6. Conclusion

To fulfill the promise of a true autonomous agent product lifecycle, the system must be more than just a task tracker. By combining **lease-based state management**, **containerized sandboxing**, **rich agency-agent profiles**, and **intelligent LLM routing**, agentRoadmap will create an unbreakable, highly resilient factory floor for AI software development.