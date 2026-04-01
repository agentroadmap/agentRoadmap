import { execSync } from 'child_process';
import { resolve } from 'path';

const projectRoot = process.cwd();

export const agentTools = [
  {
    name: "agent_register",
    description: "Register a new agent (human, agent, manager, worker)",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Agent ID (e.g., 'andy', 'carter')" },
        agentType: { type: "string", enum: ["human", "agent", "manager", "worker"], description: "Agent type" },
        name: { type: "string", description: "Display name" },
        reportsTo: { type: "string", description: "Manager's agent ID (optional)" }
      },
      required: ["id", "agentType", "name"]
    }
  },
  {
    name: "agent_update_reporting",
    description: "Update who an agent reports to",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID" },
        managerId: { type: "string", description: "New manager ID (null for top-level)" }
      },
      required: ["agentId"]
    }
  },
  {
    name: "privilege_grant",
    description: "Grant a privilege to an agent",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID" },
        permission: { type: "string", enum: ["read", "edit", "claim", "review", "admin", "budget"], description: "Permission to grant" },
        grantedBy: { type: "string", description: "Who is granting this" }
      },
      required: ["agentId", "permission", "grantedBy"]
    }
  },
  {
    name: "privilege_revoke",
    description: "Revoke a privilege",
    inputSchema: {
      type: "object",
      properties: {
        privilegeId: { type: "number", description: "Privilege ID to revoke" }
      },
      required: ["privilegeId"]
    }
  },
  {
    name: "agent_get",
    description: "Get agent details including reporting and privileges",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID" }
      },
      required: ["agentId"]
    }
  }
];

export function registerSdbAgentTools(server: any, projectRoot: string): void {
  // Register the basic tools
  for (const tool of agentTools) {
    server.addTool(tool);
  }
  console.log(`[Agents] Registered ${agentTools.length} SDB agent tools`);
}
