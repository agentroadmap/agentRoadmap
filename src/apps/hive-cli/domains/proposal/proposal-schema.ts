/**
 * Proposal domain schema descriptor per cli-hive-contract.md §8.1
 *
 * Used by discovery commands (hive --schema, hive proposal --schema) and
 * for validating command structure at runtime.
 */

import type { DomainSchema } from "../../common/index";

export const proposalSchema: DomainSchema = {
  name: "proposal",
  aliases: ["proposals"],
  description: "Proposal CRUD and lifecycle management",
  subcommands: [
    {
      name: "create",
      signature: "hive proposal create",
      description: "Create a new proposal",
      flags: [
        {
          name: "type",
          type: "string",
          description: "Proposal type (feature, bug, enhancement, etc.)",
          required: true,
        },
        {
          name: "title",
          type: "string",
          description: "Proposal title",
          required: true,
        },
        {
          name: "summary",
          type: "string",
          description: "Brief summary",
        },
        {
          name: "motivation",
          type: "string",
          description: "Motivation and context",
        },
        {
          name: "design",
          type: "string",
          description: "Design approach",
        },
        {
          name: "stdin",
          type: "boolean",
          description: "Read body from stdin",
        },
        {
          name: "idempotency-key",
          type: "string",
          description: "UUID for idempotent retries",
        },
      ],
      output: {
        type: "object",
        schema: {
          proposal_id: "string",
          display_id: "string",
          title: "string",
          type: "string",
          status: "string",
          maturity: "string",
          created_at: "string",
        },
      },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "get",
      signature: "hive proposal get <proposal_id>",
      description: "Fetch a single proposal by ID",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
          description: "Proposal ID (e.g., P123)",
          example: "P123",
        },
      ],
      flags: [
        {
          name: "include",
          type: "string[]",
          repeatable: true,
          description:
            "Expand relations: leases, dispatches, ac, dependencies, discussions, gate_status, all",
        },
      ],
      output: {
        type: "object",
        schema: {
          proposal: "object",
          leases: "array",
          ac: "array",
          dependencies: "array",
          discussions: "array",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "list",
      signature: "hive proposal list",
      description: "List proposals with optional filtering",
      flags: [
        {
          name: "status",
          type: "string",
          description: "Filter by status (draft, review, develop, merge, complete)",
        },
        {
          name: "limit",
          type: "number",
          default: 20,
          description: "Maximum items to return",
        },
        {
          name: "cursor",
          type: "string",
          description: "Pagination cursor",
        },
      ],
      output: {
        type: "array",
        schema: {
          proposal_id: "string",
          display_id: "string",
          title: "string",
          status: "string",
          maturity: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
    {
      name: "show",
      signature: "hive proposal show <proposal_id>",
      description: "Show proposal with included relations (alias for get --include all)",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
          example: "P123",
        },
      ],
      output: { type: "object" },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "edit",
      signature: "hive proposal edit <proposal_id>",
      description: "Edit proposal fields",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
        },
      ],
      flags: [
        {
          name: "title",
          type: "string",
          description: "New title",
        },
        {
          name: "status",
          type: "string",
          description: "New status",
        },
        {
          name: "idempotency-key",
          type: "string",
          description: "UUID for idempotent retries",
        },
      ],
      output: { type: "object" },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "claim",
      signature: "hive proposal claim <proposal_id>",
      description: "Claim a proposal (acquire lease)",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
        },
      ],
      flags: [
        {
          name: "duration",
          type: "string",
          description: "Lease duration (e.g., 4h, 2d)",
        },
        {
          name: "idempotency-key",
          type: "string",
          description: "UUID for idempotent retries",
        },
      ],
      output: {
        type: "object",
        schema: {
          lease_id: "string",
          proposal_id: "string",
          idempotent_replay: "boolean",
        },
      },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "release",
      signature: "hive proposal release <proposal_id>",
      description: "Release a proposal lease",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
        },
      ],
      flags: [
        {
          name: "reason",
          type: "string",
          description: "Release reason",
        },
        {
          name: "yes",
          type: "boolean",
          description: "Skip confirmation (destructive operation)",
        },
        {
          name: "idempotency-key",
          type: "string",
          description: "UUID for idempotent retries",
        },
      ],
      output: { type: "object" },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "transition",
      signature: "hive proposal transition <proposal_id> <next_state>",
      description: "Transition proposal to a new state",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
        },
        {
          name: "next_state",
          type: "string",
          required: true,
        },
      ],
      flags: [
        {
          name: "reason",
          type: "string",
          description: "Transition reason",
        },
        {
          name: "idempotency-key",
          type: "string",
        },
      ],
      output: { type: "object" },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "maturity",
      signature: "hive proposal maturity <proposal_id> <maturity>",
      description: "Set proposal maturity (new, active, mature, obsolete)",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
        },
        {
          name: "maturity",
          type: "string",
          required: true,
          example: "active",
        },
      ],
      flags: [
        {
          name: "idempotency-key",
          type: "string",
        },
      ],
      output: { type: "object" },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "depend",
      signature: "hive proposal depend <proposal_id> <action>",
      description: "Manage proposal dependencies (add, remove, resolve)",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
        },
        {
          name: "action",
          type: "string",
          required: true,
          example: "add",
        },
      ],
      flags: [
        {
          name: "on",
          type: "string",
          description: "Dependency target (for add/remove)",
        },
        {
          name: "idempotency-key",
          type: "string",
        },
      ],
      output: { type: "object" },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "ac",
      signature: "hive proposal ac <action>",
      description: "Manage acceptance criteria (add, list, verify, delete)",
      output: { type: "object" },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "review",
      signature: "hive proposal review <proposal_id>",
      description: "Submit a review on a proposal",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
        },
      ],
      flags: [
        {
          name: "status",
          type: "string",
          description: "Review status (approved, requesting-changes, commented)",
        },
        {
          name: "comment",
          type: "string",
          description: "Review comment",
        },
        {
          name: "idempotency-key",
          type: "string",
        },
      ],
      output: { type: "object" },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "discuss",
      signature: "hive proposal discuss <proposal_id>",
      description: "Post a discussion message on a proposal",
      parameters: [
        {
          name: "proposal_id",
          type: "string",
          required: true,
        },
      ],
      flags: [
        {
          name: "message",
          type: "string",
          description: "Discussion message (or from stdin)",
        },
        {
          name: "stdin",
          type: "boolean",
          description: "Read message from stdin",
        },
        {
          name: "idempotency-key",
          type: "string",
        },
      ],
      output: { type: "object" },
      idempotency: "non-idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "next",
      signature: "hive proposal next",
      description: "Return highest-priority claimable proposal (or top-5 ranked list)",
      flags: [
        {
          name: "agent",
          type: "string",
          description: "Filter by agent/agency capability",
        },
      ],
      output: { type: "object" },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
  ],
};
