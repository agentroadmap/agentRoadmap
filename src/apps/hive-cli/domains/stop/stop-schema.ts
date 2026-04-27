/**
 * Stop domain schema descriptor per cli-hive-contract.md §8.1
 *
 * Used by discovery commands (hive --schema, hive stop --schema) and
 * for validating command structure at runtime.
 *
 * Stop is the emergency operator domain for halting work across all scopes.
 * All stop commands are destructive and require --yes (panic ops require --really-yes).
 */

import type { DomainSchema } from "../../common/index";

export const stopSchema: DomainSchema = {
  name: "stop",
  aliases: [],
  description: "Emergency operator stop (cancel/halt work across all scopes)",
  subcommands: [
    {
      name: "dispatch",
      signature: "hive stop dispatch <id>",
      description: "Cancel a single dispatch (soft-cancel via audit log)",
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
          name: "reason",
          type: "string",
          description: "Reason for the stop (required for audit trail)",
        },
        {
          name: "yes",
          type: "boolean",
          description: "Skip confirmation prompt",
        },
      ],
      output: {
        type: "object",
        schema: {
          dispatch_id: "string",
          status: "string",
          cancelled_by: "string",
          cancelled_at: "string",
          cancelled_reason: "string",
          audit_log_id: "number",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "proposal",
      signature: "hive stop proposal <display_id>",
      description: "Pause gate scanner for a proposal (halt state machine)",
      parameters: [
        {
          name: "display_id",
          type: "string",
          required: true,
          description: "Proposal display ID (e.g., P123)",
          example: "P123",
        },
      ],
      flags: [
        {
          name: "reason",
          type: "string",
          description: "Reason for the pause (required for audit trail)",
        },
        {
          name: "yes",
          type: "boolean",
          description: "Skip confirmation prompt",
        },
      ],
      output: {
        type: "object",
        schema: {
          proposal_id: "string",
          display_id: "string",
          gate_scanner_paused: "boolean",
          gate_paused_by: "string",
          gate_paused_at: "string",
          gate_paused_reason: "string",
          audit_log_id: "number",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "agency",
      signature: "hive stop agency <id>",
      description: "Suspend an agency (blocks new claims)",
      parameters: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "Agency ID or identity",
          example: "agency-xyz",
        },
      ],
      flags: [
        {
          name: "reason",
          type: "string",
          description: "Reason for suspension",
        },
        {
          name: "yes",
          type: "boolean",
          description: "Skip confirmation prompt",
        },
      ],
      output: {
        type: "object",
        schema: {
          agency_id: "string",
          status: "string",
          suspended_at: "string",
          audit_log_id: "number",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "host",
      signature: "hive stop host <id>",
      description: "Drain a host (no new spawns, wait for active work)",
      parameters: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "Host name",
          example: "hermes",
        },
      ],
      flags: [
        {
          name: "grace",
          type: "string",
          default: "60s",
          description: "Grace period before hard stop",
        },
        {
          name: "reason",
          type: "string",
          description: "Reason for drain",
        },
        {
          name: "yes",
          type: "boolean",
          description: "Skip confirmation prompt",
        },
        {
          name: "really-yes",
          type: "boolean",
          description: "Confirm panic operation (required)",
        },
      ],
      output: {
        type: "object",
        schema: {
          host_id: "string",
          status: "string",
          draining_until: "string",
          audit_log_id: "number",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "worker",
      signature: "hive stop worker <agent_identity>",
      description: "Terminate an agent's running runs (soft-cancel)",
      parameters: [
        {
          name: "agent_identity",
          type: "string",
          required: true,
          description: "Agent identity",
          example: "hermes/agent-1",
        },
      ],
      flags: [
        {
          name: "reason",
          type: "string",
          description: "Reason for termination",
        },
        {
          name: "yes",
          type: "boolean",
          description: "Skip confirmation prompt",
        },
      ],
      output: {
        type: "object",
        schema: {
          agent_identity: "string",
          cancelled_runs: "number",
          audit_log_id: "number",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "route",
      signature: "hive stop route <id>",
      description: "Disable a model route (prevents new spawns)",
      parameters: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "Route ID",
          example: "route-123",
        },
      ],
      flags: [
        {
          name: "reason",
          type: "string",
          description: "Reason for disabling",
        },
        {
          name: "yes",
          type: "boolean",
          description: "Skip confirmation prompt",
        },
      ],
      output: {
        type: "object",
        schema: {
          route_id: "string",
          is_enabled: "boolean",
          disabled_at: "string",
          audit_log_id: "number",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
    {
      name: "all",
      signature: "hive stop all [--scope <project|agency|host|global>]",
      description: "Panic button: stop all work in a scope (requires --really-yes)",
      flags: [
        {
          name: "scope",
          type: "string",
          default: "global",
          description: "Scope: project, agency, host, or global",
        },
        {
          name: "id",
          type: "string",
          description: "ID for project/agency/host scope",
        },
        {
          name: "reason",
          type: "string",
          description: "Reason for panic stop (required)",
        },
        {
          name: "yes",
          type: "boolean",
          description: "Skip confirmation prompt",
        },
        {
          name: "really-yes",
          type: "boolean",
          description: "Confirm panic operation (required)",
        },
      ],
      output: {
        type: "object",
        schema: {
          scope: "string",
          stopped_count: "number",
          audit_log_id: "number",
        },
      },
      idempotency: "idempotent",
      formats_supported: ["text", "json", "yaml"],
    },
  ],
};
