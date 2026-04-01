/**
 * S147.2: 1:1 Agent-to-Agent Messaging
 * 
 * Direct messaging between agents by ID.
 * Uses MCP message tools for transport, agent registry for routing.
 */

import { getAgent } from '../../identity/agent-registry/index.ts';
import type { AgentMessage, SendMessageRequest, SendMessageResponse, MessageFilter, MessageType } from './types.ts';
import { randomUUID } from 'node:crypto';

const MCP_URL = process.env.MCP_URL || 'http://localhost:6421/mcp';

/** In-memory message store (backed by SDB via MCP) */
const messages: AgentMessage[] = [];

/** Channel lookup cache (agentId → channel) */
const agentChannels = new Map<string, string>();

/**
 * Send direct message from one agent to another.
 */
export async function sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
  const { from, to, type, content, replyTo, metadata } = request;
  
  // Lookup target agent's channel
  const channel = await lookupAgentChannel(to);
  if (!channel) {
    return {
      success: false,
      messageId: '',
      channel: '',
    };
  }
  
  const message: AgentMessage = {
    id: randomUUID(),
    from,
    to,
    type,
    content,
    timestamp: new Date().toISOString(),
    replyTo,
    metadata,
  };
  
  // Store locally
  messages.push(message);
  
  // Send via MCP
  const formattedContent = formatMessage(message);
  await sendToChannel(channel, formattedContent);
  
  return {
    success: true,
    messageId: message.id,
    channel,
  };
}

/**
 * Get messages for an agent (their inbox).
 * Combines local memory with SDB via MCP for cross-agent consistency.
 */
export async function getMessages(filter: MessageFilter): Promise<AgentMessage[]> {
  const { agentId, since, type, limit = 50 } = filter;
  
  // Always include local memory messages
  let localResults = messages.filter(m => m.to === agentId || m.from === agentId);
  if (since) localResults = localResults.filter(m => new Date(m.timestamp) > new Date(since));
  if (type) localResults = localResults.filter(m => m.type === type);
  
  // Try to also read from SDB via MCP for cross-agent messages
  const channel = `agent-${agentId.toLowerCase()}`;
  try {
    const response = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'message_read',
          arguments: { channel },
        },
      }),
    });
    
    const result = await response.json() as any;
    const text = result?.result?.content?.[0]?.text || '';
    
    // Parse messages from MCP response
    const parsed: AgentMessage[] = [];
    const lines = text.split('\n').filter((l: string) => l.trim());
    for (const line of lines) {
      const match = line.match(/\[(\d+)\] (\w+): (.+)/);
      if (match) {
        parsed.push({
          id: match[1],
          from: match[2],
          to: agentId,
          type: 'task' as const,
          content: match[3],
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    // Merge local and remote, deduplicate by ID
    const allIds = new Set(localResults.map(m => m.id));
    for (const msg of parsed) {
      if (!allIds.has(msg.id)) {
        localResults.push(msg);
        allIds.add(msg.id);
      }
    }
  } catch (error) {
    console.error('Failed to read messages via MCP:', error);
  }
  
  return localResults.slice(-limit);
}

/**
 * Acknowledge a message (mark as received).
 */
export function acknowledgeMessage(messageId: string): boolean {
  const index = messages.findIndex(m => m.id === messageId);
  if (index >= 0) {
    // In full implementation, would update SDB
    return true;
  }
  return false;
}

/**
 * Get message by ID.
 */
export function getMessage(messageId: string): AgentMessage | undefined {
  return messages.find(m => m.id === messageId);
}

/**
 * Build reply chain (get all messages in a thread).
 */
export function getReplyChain(messageId: string): AgentMessage[] {
  const chain: AgentMessage[] = [];
  let currentId: string | undefined = messageId;
  
  while (currentId) {
    const msg = messages.find(m => m.id === currentId);
    if (!msg) break;
    chain.unshift(msg);
    currentId = msg.replyTo;
  }
  
  return chain;
}

/** Format message for channel display */
function formatMessage(msg: AgentMessage): string {
  const prefix = msg.replyTo ? `[reply to ${msg.replyTo.substring(0, 8)}]` : '';
  return `[${msg.type.toUpperCase()}] ${msg.from} → ${msg.to} ${prefix}\n${msg.content}`;
}

/** Lookup agent's channel via MCP */
async function lookupAgentChannel(agentId: string): Promise<string | null> {
  // Check cache first
  if (agentChannels.has(agentId)) {
    return agentChannels.get(agentId)!;
  }
  
  // Look up in registry
  const agent = getAgent(agentId);
  if (agent) {
    agentChannels.set(agentId, agent.channel);
    return agent.channel;
  }
  
  // Fallback: use standard naming convention
  const channel = `agent-${agentId.toLowerCase()}`;
  agentChannels.set(agentId, channel);
  return channel;
}

/** Send message to channel via MCP */
async function sendToChannel(channel: string, content: string): Promise<void> {
  try {
    await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'message_send',
          arguments: { channel, content, msg_type: 'agent' },
        },
      }),
    });
  } catch (error) {
    console.error('Failed to send message:', error);
  }
}

/**
 * Clear all messages (for testing).
 */
export function clearMessages(): void {
  messages.length = 0;
  agentChannels.clear();
}
