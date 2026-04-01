/**
 * SpacetimeDB-backed Proposal Tools
 */

import type { McpServer } from "../../server.ts";
import type { McpToolHandler } from "../../types.ts";
import { createSimpleValidatedTool } from "../../validation/tool-wrapper.ts";
import type { JsonSchema } from "../../validation/validators.ts";
import { SdbProposalHandlers } from "./sdb-handlers.ts";

const proposalListSchema: JsonSchema = {
  type: "object",
  properties: {
    status: { type: "string", description: "Filter by status (active, complete, potential)" },
    assignee: { type: "string", description: "Filter by assignee" },
    limit: { type: "number", description: "Max results" },
  },
  required: [],
};

const proposalGetSchema: JsonSchema = {
  type: "object",
  properties: {
    proposalId: { type: "string", description: "Proposal ID (e.g., STATE-090)" },
  },
  required: ["proposalId"],
};

const proposalCreateSchema: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Proposal title" },
    description: { type: "string", description: "Detailed description" },
    status: { type: "string", description: "Initial status" },
    assignee: { type: "string", description: "Assigned agent" },
    priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority level" },
    labels: { type: "array", items: { type: "string" }, description: "Labels" },
  },
  required: ["title"],
};

const proposalCompleteSchema: JsonSchema = {
  type: "object",
  properties: {
    proposalId: { type: "string", description: "Proposal ID to complete" },
  },
  required: ["proposalId"],
};

export function registerSdbProposalTools(server: McpServer, projectRoot: string): void {
  const handlers = new SdbProposalHandlers(server, projectRoot);

  server.addTool(createSimpleValidatedTool(
    { name: "proposal_list", description: "List proposals from SpacetimeDB", inputSchema: proposalListSchema },
    proposalListSchema,
    (input) => handlers.listProposals(input as { status?: string; assignee?: string; limit?: number }),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "proposal_get", description: "Get a proposal by ID", inputSchema: proposalGetSchema },
    proposalGetSchema,
    (input) => handlers.getProposal(input as { proposalId: string }),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "proposal_create", description: "Create a new proposal", inputSchema: proposalCreateSchema },
    proposalCreateSchema,
    (input) => handlers.createProposal(input as { title: string; description?: string; status?: string; assignee?: string; priority?: string; labels?: string[] }),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "proposal_complete", description: "Mark a proposal as complete", inputSchema: proposalCompleteSchema },
    proposalCompleteSchema,
    (input) => handlers.completeProposal(input as { proposalId: string }),
  ));

  console.log('[Proposals] Registered 4 SDB tools: proposal_list, proposal_get, proposal_create, proposal_complete');
}
