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
    proposal_type: { type: "string", enum: ["DIRECTIVE", "CAPABILITY", "TECHNICAL", "COMPONENT", "OPS_ISSUE"], description: "Proposal type" },
    category: { type: "string", enum: ["FEATURE", "BUG", "RESEARCH", "SECURITY", "INFRA"], description: "Category" },
    domain_id: { type: "string", description: "Business domain (e.g., ENGINE, FINOPS)" },
    description: { type: "string", description: "Detailed description/body" },
    priority: { type: "string", enum: ["Strategic", "High", "Medium", "Low"], description: "Priority level" },
    parent_id: { type: "number", description: "Parent proposal ID (for hierarchy)" },
    budget_limit_usd: { type: "number", description: "Budget limit in USD" },
  },
  required: ["title"],
};

const proposalUpdateSchema: JsonSchema = {
  type: "object",
  properties: {
    proposalId: { type: "string", description: "Proposal ID (e.g., P001)" },
    title: { type: "string", description: "New title" },
    body_markdown: { type: "string", description: "New body content" },
    priority: { type: "string", enum: ["Strategic", "High", "Medium", "Low"], description: "New priority" },
    maturity_level: { type: "number", enum: [0, 1, 2, 3], description: "Maturity: 0=New, 1=Draft, 2=Active, 3=Complete" },
    tags: { type: "string", description: "Comma-separated tags" },
    change_summary: { type: "string", description: "What changed (for version history)" },
  },
  required: ["proposalId", "change_summary"],
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
    { name: "prop_list", description: "List proposals from SpacetimeDB", inputSchema: proposalListSchema },
    proposalListSchema,
    (input) => handlers.listProposals(input as { status?: string; assignee?: string; limit?: number }),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "prop_get", description: "Get a proposal by ID", inputSchema: proposalGetSchema },
    proposalGetSchema,
    (input) => handlers.getProposal(input as { proposalId: string }),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "prop_create", description: "Create a new proposal", inputSchema: proposalCreateSchema },
    proposalCreateSchema,
    (input) => handlers.createProposal(input as { title: string; description?: string; status?: string; assignee?: string; priority?: string; labels?: string[] }),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "prop_update", description: "Update a proposal (title, body, maturity, priority)", inputSchema: proposalUpdateSchema },
    proposalUpdateSchema,
    (input) => handlers.updateProposal(input as { proposalId: string; title?: string; body_markdown?: string; priority?: string; maturity_level?: number; tags?: string; change_summary: string }),
  ));

  server.addTool(createSimpleValidatedTool(
    { name: "prop_complete", description: "Mark a proposal as complete", inputSchema: proposalCompleteSchema },
    proposalCompleteSchema,
    (input) => handlers.completeProposal(input as { proposalId: string }),
  ));

  console.log('[Proposals] Registered 5 SDB tools: prop_list, prop_get, prop_create, prop_update, prop_complete');
}
