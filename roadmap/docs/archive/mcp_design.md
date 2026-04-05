In 2026, the Model Context Protocol (MCP) has become the "USB-C" for AI agents. For your agentRoadmap project, you shouldn't just "give" an agent a tool; you should allow the agent to discover it.
Here is how agents learn about MCP capabilities and how your platform should introduce them.
1. How Agents Learn (The Discovery Phase)
Agents don't "know" what an MCP server can do until they connect. The learning process follows a standardized three-step handshake:
 * The List Call: The agent sends a resources/list or tools/list request to the MCP server.
 * The Manifest: The server returns a JSON-RPC response containing every available tool, its description, and its JSON Schema (what inputs it needs).
 * Contextual Understanding: Modern LLMs (Claude 3.5+, Gemini 2.0+) are trained to parse these schemas. They "learn" by reading the tool descriptions. If a tool is named get_weather but the description says "Used to fetch financial data," the agent will trust the description over the name.
2. Introducing MCP to New Agents in agentRoadmap
For a 100-agent system, you want "Just-in-Time" discovery so you don't overwhelm an agent's context window with 500 tool definitions they don't need.
Strategy A: The "Welcome Package" (Onboarding)
When a new agent (e.g., a "Coder Agent") is spawned in your SpacetimeDB, your agentRoadmap platform should send an initial "Discovery Directive."
> "You have been granted access to the Project-Alpha MCP Server. Call list_tools to see your available capabilities for file editing and git sync."
> 
Strategy B: The "Librarian" Pattern (Scalable)
Instead of every agent connecting to every MCP server, use one Librarian Agent.
 * Registry: All your MCP servers (OpenClaw, Google Search, Filesystem) register their capabilities in a SpacetimeDB table called mcp_registry.
 * Lookup: When a "Research Agent" needs to find a tool for "scraping a JS-heavy site," it queries the Librarian: "Who has OpenClaw capabilities?"
 * Dynamic Connection: The Librarian provides the connection string, and the agent connects to that specific MCP server only for that task.
3. Best Practices for agentRoadmap MCP Design
1. Use "Semantic" Descriptions
Don't just name a tool sql_query. Name it query_project_database and add a description: "Use this to find agent budget balances or project status. Required for all financial RFCs." The more "human-like" the description, the faster the agent "learns" its usage.
2. The "Dry Run" Mode
Introduce a metadata flag in your MCP tools called is_destructive.
 * When a new agent joins, force it to use is_destructive: false for the first 5 calls.
 * This allows the agent to "test" its understanding of the tool without actually deleting files or spending real money.
3. Progressive Disclosure
If you have 100 tools, don't show them all.
 * Level 1: Show only the 5 most common tools.
 * Level 2: If the agent says "I don't have the right tool for this," provide a search_mcp_catalog tool that lets them find more specialized capabilities.
Summary Table: MCP Introduction
| Method | Best For | Token Efficiency |
|---|---|---|
| Direct Listing | Small teams (5-10 agents) | Low (Too much context) |
| Librarian Lookup | Large teams (100 agents) | High (Only loads needed tools) |
| Git-Config (.mcp) | Hardcoded workflows | High |
