/**
 * S147.2: Agent Messaging Module
 */

export { sendMessage, getMessages, acknowledgeMessage, getMessage, getReplyChain, clearMessages } from './messaging.ts';
export type { AgentMessage, SendMessageRequest, SendMessageResponse, MessageFilter, MessageType } from './types.ts';
