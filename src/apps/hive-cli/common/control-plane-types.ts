/**
 * Type definitions for control-plane database rows.
 *
 * These types represent the shape of data returned by control-plane queries
 * (from `roadmap.project`, `roadmap_proposal.proposal`, etc.). They are used
 * by `ControlPlaneClient` to provide typed access to control-plane data.
 *
 * All types are read-only and represent the current state of the control plane.
 */

/**
 * A project row from `roadmap.project`.
 *
 * Represents a single project tenant and its metadata.
 */
export interface ProjectRow {
  project_id: number;
  slug: string;
  name: string;
  worktree_root: string;
  status: "active" | "archived";
  created_at: string; // ISO 8601 timestamp
  archived_at: string | null;
  db_name: string | null;
  db_role: string | null;
  schema_prefix: string | null;
  dsn_secret_ref: string | null;
  host: string;
  port: number;
  bootstrap_status: string;
  bootstrap_log: Record<string, unknown> | null;
  updated_at: string;
  git_remote_url?: string | null; // Optional; used for git-based project matching
}

/**
 * A proposal row from `roadmap_proposal.proposal`.
 *
 * Represents a single proposal in the RFC workflow.
 */
export interface ProposalRow {
  id: number;
  display_id: string;
  parent_id: number | null;
  type: string;
  status: string; // e.g., "Draft", "Review", "Develop", "Merge", "Complete"
  title: string;
  summary: string | null;
  motivation: string | null;
  design: string | null;
  drawbacks: string | null;
  alternatives: string | null;
  dependency_note: string | null;
  priority: string | null;
  maturity: string; // "new", "active", "mature", "obsolete"
  workflow_name: string | null;
  tags: Record<string, unknown> | null;
  audit: Record<string, unknown>;
  created_at: string; // ISO 8601
  modified_at: string;
  required_capabilities: Record<string, unknown>;
  project_id: number;
  gate_scanner_paused: boolean;
  gate_paused_by: string | null;
  gate_paused_at: string | null;
  gate_paused_reason: string | null;
}

/**
 * A workflow template row from `roadmap.workflow_templates`.
 *
 * Represents a state machine definition (e.g., "RFC 5-Stage", "Hotfix").
 */
export interface WorkflowTemplateRow {
  id: number;
  name: string;
  description: string | null;
  states: Record<string, unknown>; // JSONB: workflow state definition
  transitions: Record<string, unknown> | null; // JSONB: allowed state transitions
  created_at: string;
  updated_at: string;
  project_id: number;
}

/**
 * An agency registry row from `roadmap.agency_registry`.
 *
 * Represents a single agency (AI or human team).
 */
export interface AgencyRow {
  id: number;
  agency_identity: string; // e.g., "hermes/agency-xiaomi"
  type: string; // "ai_agency", "human_team", etc.
  display_name: string;
  description: string | null;
  status: string; // "active", "suspended", "archived"
  created_at: string;
  updated_at: string;
  project_id?: number; // May be per-project or global
}

/**
 * An agent registry row from `roadmap.agent_registry`.
 *
 * Represents a single agent instance.
 */
export interface AgentRow {
  id: number;
  agent_identity: string; // e.g., "hermes-andy"
  agency_id: number;
  model: string;
  status: string; // "idle", "busy", "failed", "terminated"
  created_at: string;
  updated_at: string;
  last_heartbeat: string | null;
  project_id?: number;
}

/**
 * A dispatch row from `roadmap.dispatch` or equivalent.
 *
 * Represents a single work dispatch (offer to run).
 */
export interface DispatchRow {
  id: number;
  display_id: string;
  proposal_id: number;
  agency_id: number;
  status: string; // "offered", "claimed", "running", "completed", "failed"
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  project_id?: number;
}

/**
 * A lease row from `roadmap.lease` or equivalent.
 *
 * Represents a proposal work lease held by an agency.
 */
export interface LeaseRow {
  id: number;
  proposal_id: number;
  agency_id: number;
  agent_identity: string;
  status: string; // "active", "released", "expired"
  acquired_at: string;
  expires_at: string;
  released_at: string | null;
  project_id?: number;
}

/**
 * Paginated result wrapper for list operations.
 *
 * Implements cursor-based pagination for large result sets.
 */
export interface PaginatedResult<T> {
  /** The items in this page. */
  items: T[];

  /** Opaque cursor for fetching the next page. Null if this is the last page. */
  next_cursor: string | null;

  /** Total count of items matching the filter (if available from DB). */
  total_count?: number;

  /** Whether there are more pages. */
  has_more: boolean;
}

/**
 * Cursor pagination state (opaque to callers).
 *
 * Encoded as base64 JSON: `{ id_after: <id> }`
 */
export interface PaginationCursor {
  id_after: number;
}

/**
 * Helper to encode a cursor to base64.
 *
 * @param cursor - The cursor object to encode
 * @returns Base64-encoded cursor string
 */
export function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64");
}

/**
 * Helper to decode a cursor from base64.
 *
 * @param cursorStr - The base64-encoded cursor string
 * @returns Decoded cursor object, or null if invalid
 */
export function decodeCursor(cursorStr: string): PaginationCursor | null {
  try {
    const json = Buffer.from(cursorStr, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}
