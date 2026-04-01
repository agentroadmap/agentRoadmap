/**
 * S147.1: Agent Startup Registration (ID + Channel Binding)
 * 
 * Handles agent registration, channel assignment, and lifecycle.
 * Uses MCP message tools for transport layer.
 */

import type { AgentRegistration, RegistrationRequest, RegistrationResponse, DeregisterRequest } from './types.ts';
import { randomUUID } from 'node:crypto';

const MCP_URL = process.env.MCP_URL || 'http://localhost:6421/mcp';

/** In-memory registry (persisted to SDB via MCP) */
const registry = new Map<string, AgentRegistration>();

/** Generate unique suffix for contract agents */
function uniqueSuffix(): string {
  return randomUUID().substring(0, 4);
}

/** Generate channel name for agent instance */
function agentChannel(instanceId: string): string {
  return `agent-${instanceId.toLowerCase()}`;
}

/** Determine if agent is permanent (Andy, Bob, Carter) */
const PERMANENT_AGENTS = new Set(['Andy', 'Bob', 'Carter']);
function isPermanent(agentId: string): boolean {
  return PERMANENT_AGENTS.has(agentId);
}

/**
 * Register agent on startup.
 * Creates/updates agent record, assigns channel, announces presence.
 */
export async function registerAgent(request: RegistrationRequest): Promise<RegistrationResponse> {
  const { agentId, capabilities = [], role } = request;
  const permanent = isPermanent(agentId);
  const agentType = request.agentType || (permanent ? 'permanent' : 'contract');
  
  // Contract agents get unique instance ID if not provided
  const instanceId = request.instanceId || (agentType === 'contract' 
    ? `${agentId}-${uniqueSuffix()}` 
    : agentId);
  
  const channel = request.channel || agentChannel(instanceId);
  
  const now = new Date().toISOString();
  const existing = registry.get(instanceId);
  
  const registration: AgentRegistration = {
    agentId,
    instanceId,
    agentType,
    role,
    capabilities,
    channel,
    status: 'online',
    registeredAt: existing?.registeredAt || now,
    lastSeen: now,
  };
  
  registry.set(instanceId, registration);
  
  // Announce presence to general channel
  await sendMessage('general', `[${agentId}] Registered and online. Channel: ${channel}`);
  
  return {
    success: true,
    agentId: instanceId,
    channel,
    message: existing ? 'Re-registered (preserved history)' : `Registered ${agentType} agent`,
  };
}

/**
 * Deregister agent on shutdown.
 * Marks as offline, preserves history.
 */
export async function deregisterAgent(request: DeregisterRequest): Promise<void> {
  const { agentId, reason = 'graceful shutdown' } = request;
  const agent = registry.get(agentId);
  
  if (agent) {
    agent.status = 'offline';
    agent.lastSeen = new Date().toISOString();
    registry.set(agentId, agent);
    
    await sendMessage('general', `[${agentId}] Offline: ${reason}`);
  }
}

/**
 * List all registered agents.
 */
export function listAgents(filter?: { status?: AgentRegistration['status'] }): AgentRegistration[] {
  const agents = Array.from(registry.values());
  if (filter?.status) {
    return agents.filter(a => a.status === filter.status);
  }
  return agents;
}

/**
 * Get agent by ID.
 */
export function getAgent(agentId: string): AgentRegistration | undefined {
  return registry.get(agentId);
}

/**
 * Update agent status.
 */
export function updateAgentStatus(agentId: string, status: AgentRegistration['status'], currentTask?: string): void {
  const agent = registry.get(agentId);
  if (agent) {
    agent.status = status;
    agent.lastSeen = new Date().toISOString();
    if (currentTask) agent.currentTask = currentTask;
    registry.set(agentId, agent);
  }
}

/** Send message via MCP (helper) */
async function sendMessage(channel: string, content: string): Promise<void> {
  try {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'message_send',
          arguments: { channel, content, msg_type: 'system' },
        },
      }),
    });
    await response.json();
  } catch (error) {
    console.error('Failed to send announcement:', error);
  }
}
