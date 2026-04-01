/**
 * SpacetimeDB-backed Message Tools
 * Replaces file-based messaging with stdb tables: chan, msg, sub, note
 */

import type { McpServer } from "../../server.ts";
import type { McpToolHandler } from "../../types.ts";
import { createSimpleValidatedTool } from "../../validation/tool-wrapper.ts";
import type { JsonSchema } from "../../validation/validators.ts";
import { SdbMessageHandlers } from "./sdb-handlers.ts";

const messageChannelsSchema: JsonSchema = {
  type: "object",
  properties: {},
  required: [],
};

const messageReadSchema: JsonSchema = {
  type: "object",
  properties: {
    channel: { type: "string", description: "Channel name to read from (e.g., 'public', 'general')" },
    since: { type: "string", description: "ISO 8061 timestamp. Only return messages after this time." },
  },
  required: ["channel"],
};

const messageSendSchema: JsonSchema = {
  type: "object",
  properties: {
    from: { type: "string", description: "Your agent name" },
    message: { type: "string", description: "Message content" },
    channel: { type: "string", description: "Channel name (default: 'general')" },
    to: { type: "string", description: "Recipient agent name (optional)" },
  },
  required: ["from", "message"],
};

const messageSubscribeSchema: JsonSchema = {
  type: "object",
  properties: {
    channel: { type: "string", description: "Channel name" },
    from: { type: "string", description: "Agent identity" },
    subscribe: { type: "boolean", description: "True to subscribe, false to unsubscribe" },
  },
  required: ["channel", "from"],
};

export function registerSdbMessageTools(server: McpServer, projectRoot: string): void {
  const handlers = new SdbMessageHandlers(server, projectRoot);

  server.addTool(createSimpleValidatedTool(
    { name: "message_channels", description: "List all chat channels", inputSchema: messageChannelsSchema },
    messageChannelsSchema,
    () => handlers.listChannels(),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "message_read", description: "Read messages from a channel", inputSchema: messageReadSchema },
    messageReadSchema,
    (input) => handlers.readMessages(input as { channel: string; since?: string }),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "message_send", description: "Send a message to a channel", inputSchema: messageSendSchema },
    messageSendSchema,
    (input) => handlers.sendMessage(input as { from: string; message: string; channel?: string; to?: string }),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "message_subscribe", description: "Subscribe to a channel", inputSchema: messageSubscribeSchema },
    messageSubscribeSchema,
    (input) => handlers.subscribe(input as { channel: string; from: string; subscribe?: boolean }),
  ));

  console.log('[Messaging] Registered 4 SDB tools: message_channels, message_read, message_send, message_subscribe');
}
