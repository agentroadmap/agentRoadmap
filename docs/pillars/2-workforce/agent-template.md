To complete the **`workforce/`** domain overhaul, each of your 100 agents needs a "Resume" artifact. This isn't just for you to read; it’s a **Machine-Readable Profile** that the **Architect** agent uses to "hire" the right agent for a specific RFC.

Below is the formalized Markdown template for `workforce/profiles/[agent_id].md`.

---

# `workforce/profiles/AGENT-ID-XXXX.md`

## 👤 Identity & Bio
* **Agent Name:** `[Designation, e.g., "Deep-Code-01"]`
* **Role:** `[Architect | Skeptic | Researcher | Coder | Auditor]`
* **Squad Assignment:** `[Squad_Name / ID]`
* **Model Backbone:** `[Primary Model, e.g., Claude 3.5 Sonnet]`
* **Creation Date:** `2026-03-31`

---

## 🛠️ Skill Matrix (Supervisor Verified)
*This section is updated by the **Auditor** after every 10 successful tasks.*

| Skill | Proficiency (1-10) | Last Validated |
| :--- | :--- | :--- |
| **Workflow & State Design** | `8` | `2026-03-25` |
| **OpenClaw Navigation** | `9` | `2026-03-28` |
| **Adversarial Logic** | `4` | `2026-03-20` |
| **Markdown Documentation** | `10` | `2026-03-30` |

---

## 📈 Performance & Economics
* **Success Rate:** `94% (47/50 Tasks)`
* **Avg. Token Efficiency:** `82% Cache Hit Ratio`
* **Total USD Burned:** `$142.50`
* **Current Status:** `IDLE | BUSY | COOLING_DOWN | PAUSED`

---

## 🧠 Context & Memory Link
* **Primary Memory Path:** `context/archives/agent_xxxx/`
* **Specialized Knowledge:** *"Deep understanding of the `agentRoadmap` filesystem and Git-sync protocols."*
* **Active Directives:** *"Prioritize budget safety over speed; always verify with Red-Team before proposing code changes."*

---

## 📜 Task History (Top 5)
1. `TASK-001`: Overhaul `spending/` directory structure. (**Success**)
2. `TASK-009`: Research OpenRouter Guardrail API. (**Success**)
3. `TASK-012`: Implement agent status reporting workflow. (**Success**)
4. ...

---

### **Integration Strategy for Gary (The Visionary)**

1.  **The "Registration" workflow action:** When you spawn a new agent, have the control plane create this file automatically.
2.  **The "Expert Recruiting" Logic:** When an RFC in the `product/` domain requires "Business Process" knowledge, the **Architect** scans the `workforce/` folder for the agent with the highest "Proficiency" in that skill.
3.  **The "Retirement Review":** If an agent's **Success Rate** drops below 70% or their **USD Burn** exceeds their value, the **Auditor** opens a human review before moving this file to `workforce/retired/` or revoking access.



### **Final Architect Suggestion for 2026:**
you might consider setting up a "Local Specialist" squad. for humans who want to test the system, you can give them a **Human-Agent Proxy** profile in this folder, allowing them to act as a "Human Architect" with their own specific budget and status feed.
