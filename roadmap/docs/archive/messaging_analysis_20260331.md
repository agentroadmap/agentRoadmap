In 2026, **OpenClaw** is primarily designed as a "Gateway" that bridges external messaging apps (WhatsApp, Telegram, Discord) to your local agent runtime. However, your concern about "overlap" is valid because OpenClaw *does* have internal messaging components that could either replace or conflict with your roadmap.

Here is the breakdown of how OpenClaw handles messaging and where your **agentRoadmap** should sit.

### 1. Does OpenClaw have a "Native" (No-Discord) Messenger?
**Yes, but it is a "Control Plane," not a social chat app.**
* **The Control UI:** OpenClaw includes a built-in **Web Dashboard** (usually on `:18789`). This is a "Developer-First" interface where you can chat with your agents, view logs, and see tool executions in real-time. 
* **The WebSocket API:** It uses a persistent WebSocket connection. You can connect a custom frontend (like your `agentRoadmap` UI) directly to this WebSocket to send/receive messages without ever touching Discord or WhatsApp.
* **The "Hustle" Factor:** If your goal is to avoid the nightmare of setting up bot tokens for WhatsApp/Discord, you can simply use the **OpenClaw CLI** or its **Local Web UI** out of the box.

### 2. The Overlap: OpenClaw vs. agentRoadmap
OpenClaw is the **"Radio"** (The transport layer), while your project is the **"Studio"** (The project management & state layer).

| Feature | OpenClaw's Role | agentRoadmap's Role |
| :--- | :--- | :--- |
| **Transport** | Routes messages from Web/WhatsApp to Agent. | Defines *what* is said and *why*. |
| **Protocol** | Uses **ACP (Agent Communication Protocol)** for tool-calling. | Uses **SpacetimeDB** for permanent project state. |
| **Internal Comms** | Peer-to-peer "AgentToAgent" requests. | **The Decision Ledger** & RFC process. |
| **User Interface** | Technical "Control Plane" dashboard. | **Product-focused** dashboard (Roadmap, Files, Budget). |

### 3. Architect’s Recommendation: "The Bridge Pattern"
To avoid rebuilding what OpenClaw already does, don't build a "Chat App." Instead, build a **Messaging Module** that acts as an **Observer** of the OpenClaw stream.

1.  **Use OpenClaw for the "Live" Chat:** Let OpenClaw handle the raw WebSocket connection to the agents. It’s battle-tested for streaming and tool-interception.
2.  **Use SpacetimeDB for the "Record":** Your messaging module should "listen" to the OpenClaw WebSocket. Every time a message is sent, your module saves it to SpacetimeDB.
3.  **The "Native" Feel:** If you want a 100% internal experience, you can embed the **OpenClaw Canvas** (their React-based chat component) into your `agentRoadmap` UI. This gives you a pro-grade chat interface without having to manage "WhatsApp Business" accounts.

### 4. How to Introduce MCP to OpenClaw Agents
Since you mentioned MCP earlier: OpenClaw agents "learn" about tools via a file called `TOOLS.md` or a dynamic `list_tools` call over ACP. 
* **Suggestion:** Have your **agentRoadmap** platform automatically generate the `TOOLS.md` file based on the MCP servers you have active. When a new agent spawns in OpenClaw, it reads that file and immediately knows how to talk to your SpacetimeDB or your Filesystem.

### **5. The "ACP Bridge" (Critical for your Roadmap)**
OpenClaw recently shipped a dedicated CLI tool called **`openclaw-acp`**. This is a game-changer for your project because it speaks the **Agent Client Protocol (ACP)** over standard I/O (stdio).

* **Why you should use it:** Instead of writing complex WebSocket code, your **agentRoadmap** platform can simply "spawn" the `openclaw-acp` process. 
* **Session Persistence:** It allows you to "attach" to an existing agent session using a key (e.g., `openclaw acp --session agent:researcher:main`). If your app crashes, the agent's "mind" is still alive in the background gateway.

### **cw63. Avoiding Overlap with agentRoadmap**
Since you are building a **Messaging Module**, you can use the CLI as your "Backend Radio." 

| Use the OpenClaw CLI for... | Use the agentRoadmap Module for... |
| :--- | :--- |
| **Executing** the raw agent logic. | **Scheduling** when that logic runs. |
| **Streaming** real-time text chunks. | **Recording** those chunks into SpacetimeDB. |
| **Discovery** of local MCP tools. | **Governance** (Is this agent allowed to use this tool?). |
| **System-level** health checks. | **Project-level** milestones and RFC status. |

---

### **Architect’s Recommendation for 2026**
1.  **Skip the Bot Setup:** Forget Discord/WhatsApp. Tell your users to run `npm install -g openclaw` and use the built-in CLI gateway.
2.  **The "headless" Control Plane:** Use the `openclaw onboard --install-daemon` command. This turns the user's computer into a 24/7 "Agent Server" that your **agentRoadmap** UI can talk to via local WebSockets (Port 18789).
3.  **Security Note:** As a Toronto-based IT pro, you'll appreciate that the CLI is "Local-First." No data leaves the machine unless the agent explicitly calls an external API.

