/**
 * Dispatch domain schema descriptor per cli-hive-contract.md §8.1
 *
 * Used by discovery commands (hive --schema, hive dispatch --schema) and
 * for validating command structure at runtime.
 *
 * Dispatch commands provide work queue inspection and lifecycle operations.
 */

import type { DomainSchema } from "../../common/index";

export const dispatchSchema: DomainSchema = {
  name: "dispatch",
  aliases: [],
  description: "Work dispatch inspection and lifecycle operations",
  subcommands: [
    {
      name: "list",
      signature: "hive dispatch list",
      description: "List all dispatches with optional filtering",
      flags: [
        {
          name: "status",
          type: "string",
          description: "Filter by status (assigned, active, blocked, completed, cancelled, failed)",
        },
        {
          name: "proposal",
          type: "string",
          description: "Filter by proposal ID",
        },
        {
          name: "limit",
          type: "number",
          default: 20,
          description: "Maximum results to return",
        },
        {
          name: "cursor",
          type: "string",
          description: "Pagination cursor",
        },
        {
          name: "format",
          type: "enum",
          enum: ["text", "json", "jsonl", "yaml"],
          default: "text",
          description: "Output format",
        },
      ],
      output: {
        type: "array",
        schema: {
          dispatch_id: "string",
          proposal_id: "string",
          agency_identity: "string",
          status: "string",
          created_at: "string",
          last_activity_at: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
    {
      name: "show",
      signature: "hive dispatch show <id>",
      description: "Show detailed information about a dispatch",
      parameters: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "Dispatch ID",
          example: "dispatch-123",
        },
      ],
      flags: [
        {
          name: "include",
          type: "string",
          repeatable: true,
          description: "Expand relations: offers, claims, runs, events",
        },
        {
          name: "format",
          type: "enum",
          enum: ["text", "json", "yaml"],
          default: "text",
        },
      ],
      output: {
        type: "object",
        schema: {
          dispatch_id: "string",
          proposal_id: "string",
          agency_identity: "string",
          status: "string",
          created_at: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "offer",
      signature: "hive dispatch offer <proposal_id>",
      description: "Issue a work offer for a proposal",
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
          name: "squad",
          type: "string",
          description: "Target squad/agency identity",
        },
        {
          name: "role",
          type: "string",
          description: "Required role",
        },
        {
          name: "idempotency-key",
          type: "string",
          description: "Idempotency key for retries",
        },
      ],
      output: {
        type: "object",
        schema: {
          dispatch_id: "string",
          proposal_id: "string",
          status: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json"],
    },
    {
      name: "queue",
      signature: "hive dispatch queue",
      description: "Show work queue (proposals awaiting dispatch)",
      flags: [
        {
          name: "limit",
          type: "number",
          default: 20,
        },
        {
          name: "format",
          type: "enum",
          enum: ["text", "json", "jsonl", "yaml"],
          default: "text",
        },
      ],
      output: {
        type: "array",
        schema: {
          proposal_id: "string",
          title: "string",
          state: "string",
          maturity: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
    {
      name: "transition",
      signature: "hive dispatch transition <id>",
      description: "Transition dispatch to a new state (MCP routed)",
      parameters: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "Dispatch ID",
        },
      ],
      flags: [
        {
          name: "to",
          type: "string",
          description: "Target state (required)",
        },
      ],
      output: {
        type: "object",
        schema: {
          dispatch_id: "string",
          status: "string",
        },
      },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json"],
    },
  ],
};
