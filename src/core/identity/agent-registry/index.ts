/**
 * S147.1: Agent Registration Module
 * 
 * Exports for agent registration functionality.
 */

export { registerAgent, deregisterAgent, listAgents, getAgent, updateAgentStatus } from './registry.ts';
export type { AgentRegistration, RegistrationRequest, RegistrationResponse, DeregisterRequest } from './types.ts';
