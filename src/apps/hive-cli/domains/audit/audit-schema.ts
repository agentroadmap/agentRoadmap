/**
 * Audit domain schema descriptor per cli-hive-contract.md §8.3
 *
 * Used by discovery commands (hive --schema, hive audit --schema) and
 * for validating command structure at runtime.
 *
 * Audit commands provide operator activity inspection and compliance logging.
 * Metrics, report, and escalation subcommands belong to lane F (project).
 */

import type { DomainSchema } from "../../common/index";

export const auditSchema: DomainSchema = {
  name: "audit",
  aliases: [],
  description: "Operator audit log inspection and compliance",
  subcommands: [
    {
      name: "feed",
      signature: "hive audit feed",
      description: "Show recent operator actions (newest first)",
      flags: [
        {
          name: "since",
          type: "string",
          description: "Time filter: 5m, 1h, 24h, or ISO timestamp",
        },
        {
          name: "limit",
          type: "number",
          default: 50,
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
          operator_name: "string",
          action: "string",
          decision: "string",
          target_kind: "string",
          target_identity: "string",
          failure_reason: "string|null",
          created_at: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
    {
      name: "search",
      signature: "hive audit search",
      description: "Search operator audit log by filters",
      flags: [
        {
          name: "action",
          type: "string",
          description: "Filter by action (stop_dispatch, stop_proposal, etc.)",
        },
        {
          name: "actor",
          type: "string",
          description: "Filter by operator name",
        },
        {
          name: "since",
          type: "string",
          description: "Time filter: 5m, 1h, 24h, or ISO timestamp",
        },
        {
          name: "until",
          type: "string",
          description: "End time (ISO timestamp or relative)",
        },
        {
          name: "target",
          type: "string",
          description: "Filter by target_kind or target_identity",
        },
        {
          name: "limit",
          type: "number",
          default: 50,
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
          operator_name: "string",
          action: "string",
          decision: "string",
          target_kind: "string",
          target_identity: "string",
          failure_reason: "string|null",
          created_at: "string",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "jsonl", "yaml"],
    },
  ],
};
