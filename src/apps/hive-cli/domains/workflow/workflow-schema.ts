/**
 * Workflow domain schema for hive CLI discovery
 *
 * Describes all workflow commands and their signatures per cli-hive-contract.md §8 (Discovery).
 */

import type { DomainSchema } from "../../common";

export const workflowSchema: DomainSchema = {
  name: "workflow",
  aliases: [],
  description: "Workflow state machine, transition rules, and gate operations",
  subcommands: [
    {
      name: "list",
      signature: "hive workflow list",
      description: "List all defined workflows in project",
      parameters: [],
      flags: [
        {
          name: "limit",
          type: "number",
          description: "Maximum items (default: 20, max: 100)",
        },
        {
          name: "cursor",
          type: "string",
          description: "Pagination cursor",
        },
      ],
      output: {
        type: "object",
        schema: {
          workflows: "array",
          next_cursor: "string|null",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "show",
      signature: "hive workflow show <workflow_id>",
      description: "Show workflow definition and state rules",
      parameters: [
        {
          name: "workflow_id",
          type: "string",
          required: true,
          description: "Workflow ID or name",
          example: "proposal-v3",
        },
      ],
      flags: [
        {
          name: "include",
          type: "string[]",
          repeatable: true,
          description: "Expand relations (states, transitions, gates)",
        },
      ],
      output: {
        type: "object",
        schema: {
          workflow: "object",
          states: "array",
          transitions: "array",
          gates: "array",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "gates",
      signature: "hive workflow gates <workflow_id>",
      description: "List all gate rules for a workflow",
      parameters: [
        {
          name: "workflow_id",
          type: "string",
          required: true,
          description: "Workflow ID or name",
          example: "proposal-v3",
        },
      ],
      flags: [
        {
          name: "state",
          type: "string",
          description: "Filter gates by target state",
        },
      ],
      output: {
        type: "object",
        schema: {
          gates: "array",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "next-state",
      signature: "hive workflow next-state <workflow_id> <current_state>",
      description: "List valid next states from current state",
      parameters: [
        {
          name: "workflow_id",
          type: "string",
          required: true,
          description: "Workflow ID or name",
          example: "proposal-v3",
        },
        {
          name: "current_state",
          type: "string",
          required: true,
          description: "Current state",
          example: "draft",
        },
      ],
      flags: [],
      output: {
        type: "object",
        schema: {
          current_state: "string",
          allowed_next_states: "array",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "history",
      signature: "hive workflow history <proposal_id>",
      description: "Show state transition history for a proposal",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
          description: "Proposal ID",
          example: "P123",
        },
      ],
      flags: [
        {
          name: "limit",
          type: "number",
          description: "Maximum entries (default: 50)",
        },
      ],
      output: {
        type: "object",
        schema: {
          proposal_id: "string",
          entries: "array",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
  ],
};
