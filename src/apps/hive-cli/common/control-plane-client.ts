/**
 * Control-plane database client for hive-cli reads.
 *
 * Provides typed, read-only access to control-plane data (projects, proposals,
 * agencies, agents, dispatches, leases, workflows) via direct Postgres queries.
 *
 * Per cli-hive-contract.md §6, this client is used by read commands that fall
 * back to direct DB when MCP is unreachable. Mutations (create, claim, transition)
 * are always routed through MCP and do NOT use this client.
 *
 * Implements cli-hive-contract.md §5 (Context Resolution) and §6 (MCP-vs-DB routing).
 */

import { execSync } from "node:child_process";
import { getPool } from "../../../infra/postgres/pool";
import { HiveError, Errors } from "./error";
import {
  ProjectRow,
  ProposalRow,
  AgencyRow,
  AgentRow,
  WorkflowTemplateRow,
  DispatchRow,
  LeaseRow,
  PaginatedResult,
  encodeCursor,
  decodeCursor,
  PaginationCursor,
} from "./control-plane-types";

/**
 * Process-wide singleton instance of ControlPlaneClient.
 */
let clientInstance: ControlPlaneClient | null = null;

/**
 * ControlPlaneClient provides read-only access to control-plane data.
 *
 * All methods map database errors to HiveError with appropriate exit codes:
 * - DB connection failures -> REMOTE_FAILURE (exit code 5)
 * - Query timeouts -> REMOTE_FAILURE (exit code 5)
 * - Resource not found -> NOT_FOUND (exit code 2)
 *
 * Each method is JSDoc-annotated with the contract section it implements.
 */
export class ControlPlaneClient {
  /**
   * List all active projects from the control plane.
   *
   * Implements cli-hive-contract.md §5 (context resolution by project lookup).
   *
   * @param filter - Optional filter (currently only `status` is supported)
   * @returns Array of ProjectRow objects
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async listProjects(
    filter?: { status?: string }
  ): Promise<ProjectRow[]> {
    const pool = getPool();
    try {
      let query = `
        SELECT project_id, slug, name, worktree_root, status, created_at,
               archived_at, db_name, db_role, schema_prefix, dsn_secret_ref,
               host, port, bootstrap_status, bootstrap_log, updated_at
          FROM roadmap.project
      `;

      const params: any[] = [];
      const conditions: string[] = [];

      if (filter?.status) {
        conditions.push(`status = $${params.length + 1}`);
        params.push(filter.status);
      } else {
        // Default: only active projects
        conditions.push(`status = 'active'`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }

      query += ` ORDER BY project_id ASC`;

      const result = await pool.query<ProjectRow>(query, params);
      return result.rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to list projects: ${msg}`,
        { error: msg }
      );
    }
  }

  /**
   * Get a single project by ID or slug.
   *
   * Implements cli-hive-contract.md §5 (context resolution, project lookup).
   *
   * @param idOrSlug - Project ID (number) or slug (string)
   * @returns ProjectRow if found, null if not
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async getProject(idOrSlug: string | number): Promise<ProjectRow | null> {
    const pool = getPool();
    try {
      let query = `
        SELECT project_id, slug, name, worktree_root, status, created_at,
               archived_at, db_name, db_role, schema_prefix, dsn_secret_ref,
               host, port, bootstrap_status, bootstrap_log, updated_at
          FROM roadmap.project
         WHERE status = 'active'
      `;

      let param: string | number = idOrSlug;

      if (typeof idOrSlug === "number") {
        query += ` AND project_id = $1`;
      } else {
        query += ` AND slug = $1`;
        param = idOrSlug;
      }

      const result = await pool.query<ProjectRow>(query, [param]);
      return result.rows[0] ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to get project: ${msg}`,
        { error: msg, idOrSlug }
      );
    }
  }

  /**
   * Resolve a project from the current working directory.
   *
   * Implements cli-hive-contract.md §5 (CWD-derived context resolution).
   * Uses the algorithm from docs/architecture/cli-hive-cwd-context-resolution.md:
   *
   * 1. Query roadmap.project for worktree_root prefix match
   * 2. Check for .hive/config.json in git root
   * 3. Check for roadmap.yaml in git root
   * 4. Query roadmap.project for git_remote_url match
   *
   * @param cwd - Current working directory (defaults to process.cwd())
   * @returns ProjectRow if found, null if not
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async resolveProjectFromCwd(cwd: string = process.cwd()): Promise<ProjectRow | null> {
    const pool = getPool();
    try {
      // Step 1: Query roadmap.project for worktree_root prefix match
      const projectQuery = `
        SELECT project_id, slug, name, worktree_root, status, created_at,
               archived_at, db_name, db_role, schema_prefix, dsn_secret_ref,
               host, port, bootstrap_status, bootstrap_log, updated_at
          FROM roadmap.project
         WHERE status = 'active'
           AND $1 LIKE (worktree_root || '%')
           AND worktree_root IS NOT NULL
         ORDER BY LENGTH(worktree_root) DESC
         LIMIT 1
      `;

      const projectResult = await pool.query<ProjectRow>(projectQuery, [cwd]);
      if (projectResult.rows.length > 0) {
        return projectResult.rows[0];
      }

      // Step 2 & 3: Check for .hive/config.json or roadmap.yaml in git root
      // (requires git to be available)
      let gitRoot: string | null = null;
      try {
        gitRoot = execSync("git rev-parse --show-toplevel", {
          cwd,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
      } catch {
        // Not in a git repo, or git failed — fall through to Step 4 with gitRoot = null
      }

      if (gitRoot) {
        // Try .hive/config.json
        try {
          const fs = await import("node:fs");
          const configPath = `${gitRoot}/.hive/config.json`;
          if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, "utf-8");
            const config = JSON.parse(configContent);
            if (config.project && typeof config.project === "string") {
              const projectBySlug = await this.getProject(config.project);
              if (projectBySlug) return projectBySlug;
            }
          }
        } catch {
          // Silently ignore errors reading/parsing .hive/config.json
        }

        // Try roadmap.yaml
        try {
          const fs = await import("node:fs");
          const yamlPath = `${gitRoot}/roadmap.yaml`;
          if (fs.existsSync(yamlPath)) {
            const yamlContent = fs.readFileSync(yamlPath, "utf-8");
            // Simple YAML parse: look for "project: <slug>" line
            const match = /^\s*project:\s*["']?([a-zA-Z0-9_-]+)["']?\s*$/m.exec(
              yamlContent
            );
            if (match && match[1]) {
              const projectBySlug = await this.getProject(match[1]);
              if (projectBySlug) return projectBySlug;
            }
          }
        } catch {
          // Silently ignore errors reading/parsing roadmap.yaml
        }

        // Step 4: Query roadmap.project by git remote URL
        try {
          const remoteUrl = execSync(
            "git -C " + gitRoot + " config --get remote.origin.url",
            {
              encoding: "utf-8",
              stdio: ["pipe", "pipe", "pipe"],
            }
          ).trim();

          if (remoteUrl) {
            // Normalize URL: strip .git suffix, lowercase
            const normalized = remoteUrl
              .replace(/\.git$/, "")
              .toLowerCase();

            const gitMatchQuery = `
              SELECT project_id, slug, name, worktree_root, status, created_at,
                     archived_at, db_name, db_role, schema_prefix, dsn_secret_ref,
                     host, port, bootstrap_status, bootstrap_log, updated_at
                FROM roadmap.project
               WHERE status = 'active'
                 AND git_remote_url IS NOT NULL
                 AND LOWER(git_remote_url) = $1
               LIMIT 1
            `;

            const gitMatchResult = await pool.query<ProjectRow>(
              gitMatchQuery,
              [normalized]
            );
            if (gitMatchResult.rows.length > 0) {
              return gitMatchResult.rows[0];
            }
          }
        } catch {
          // Silently ignore git config errors
        }
      }

      // Step 5: No context resolved
      return null;
    } catch (err) {
      if (err instanceof HiveError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to resolve project from CWD: ${msg}`,
        { error: msg, cwd }
      );
    }
  }

  /**
   * List all agencies in a project.
   *
   * Implements cli-hive-contract.md §1 (agency domain).
   *
   * @param projectId - Project ID
   * @param filter - Optional filter (status, etc.)
   * @returns Array of AgencyRow objects
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async listAgencies(
    projectId: number,
    filter?: { status?: string }
  ): Promise<AgencyRow[]> {
    const pool = getPool();
    try {
      let query = `
        SELECT id, agency_identity, type, display_name, description, status,
               created_at, updated_at
          FROM roadmap.agency_registry
         WHERE project_id = $1
      `;

      const params: any[] = [projectId];

      if (filter?.status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(filter.status);
      }

      query += ` ORDER BY id ASC`;

      const result = await pool.query<AgencyRow>(query, params);
      return result.rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to list agencies: ${msg}`,
        { error: msg, projectId }
      );
    }
  }

  /**
   * List all agents in a project.
   *
   * Implements cli-hive-contract.md §1 (worker domain).
   *
   * @param projectId - Project ID
   * @returns Array of AgentRow objects
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async listAgents(projectId: number): Promise<AgentRow[]> {
    const pool = getPool();
    try {
      const query = `
        SELECT id, agent_identity, agency_id, model, status, created_at,
               updated_at, last_heartbeat
          FROM roadmap.agent_registry
         WHERE project_id = $1
         ORDER BY id ASC
      `;

      const result = await pool.query<AgentRow>(query, [projectId]);
      return result.rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to list agents: ${msg}`,
        { error: msg, projectId }
      );
    }
  }

  /**
   * List proposals in a project with cursor-based pagination.
   *
   * Implements cli-hive-contract.md §1 (proposal domain, list action).
   *
   * @param projectId - Project ID
   * @param filter - Optional filter (status, limit, cursor)
   * @returns PaginatedResult containing proposals and next_cursor
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async listProposals(
    projectId: number,
    filter?: { status?: string; limit?: number; cursor?: string }
  ): Promise<PaginatedResult<ProposalRow>> {
    const pool = getPool();
    try {
      const limit = filter?.limit ?? 20;
      let idAfter = 0;

      if (filter?.cursor) {
        const decoded = decodeCursor(filter.cursor);
        if (decoded) {
          idAfter = decoded.id_after;
        }
      }

      let query = `
        SELECT id, display_id, parent_id, type, status, title, summary,
               motivation, design, drawbacks, alternatives, dependency_note,
               priority, maturity, workflow_name, tags, audit, created_at,
               modified_at, required_capabilities, project_id, gate_scanner_paused,
               gate_paused_by, gate_paused_at, gate_paused_reason
          FROM roadmap_proposal.proposal
         WHERE project_id = $1
      `;

      const params: any[] = [projectId];
      let paramIndex = 2;

      if (filter?.status) {
        query += ` AND status = $${paramIndex}`;
        params.push(filter.status);
        paramIndex++;
      }

      if (idAfter > 0) {
        query += ` AND id > $${paramIndex}`;
        params.push(idAfter);
        paramIndex++;
      }

      query += ` ORDER BY id ASC LIMIT $${paramIndex + 1}`;
      params.push(limit + 1); // Fetch one extra to check if there are more

      const result = await pool.query<ProposalRow>(query, params);

      const hasMore = result.rows.length > limit;
      const items = hasMore ? result.rows.slice(0, limit) : result.rows;
      const nextCursor =
        hasMore && items.length > 0
          ? encodeCursor({ id_after: items[items.length - 1].id })
          : null;

      return {
        items,
        next_cursor: nextCursor,
        has_more: hasMore,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to list proposals: ${msg}`,
        { error: msg, projectId }
      );
    }
  }

  /**
   * Get a single proposal by display ID.
   *
   * Implements cli-hive-contract.md §1 (proposal domain, get action).
   *
   * @param projectId - Project ID
   * @param displayId - Proposal display ID (e.g., "P123")
   * @returns ProposalRow if found, null if not
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async getProposal(
    projectId: number,
    displayId: string
  ): Promise<ProposalRow | null> {
    const pool = getPool();
    try {
      const query = `
        SELECT id, display_id, parent_id, type, status, title, summary,
               motivation, design, drawbacks, alternatives, dependency_note,
               priority, maturity, workflow_name, tags, audit, created_at,
               modified_at, required_capabilities, project_id, gate_scanner_paused,
               gate_paused_by, gate_paused_at, gate_paused_reason
          FROM roadmap_proposal.proposal
         WHERE project_id = $1 AND display_id = $2
      `;

      const result = await pool.query<ProposalRow>(query, [
        projectId,
        displayId,
      ]);
      return result.rows[0] ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to get proposal: ${msg}`,
        { error: msg, projectId, displayId }
      );
    }
  }

  /**
   * List all dispatches in a project.
   *
   * Implements cli-hive-contract.md §1 (dispatch domain, list action).
   *
   * @param projectId - Project ID
   * @param filter - Optional filter (status)
   * @returns Array of DispatchRow objects
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async listDispatches(
    projectId: number,
    filter?: { status?: string }
  ): Promise<DispatchRow[]> {
    const pool = getPool();
    try {
      let query = `
        SELECT id, display_id, proposal_id, agency_id, status, created_at,
               updated_at, completed_at, result
          FROM roadmap.dispatch
         WHERE project_id = $1
      `;

      const params: any[] = [projectId];

      if (filter?.status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(filter.status);
      }

      query += ` ORDER BY id DESC`;

      const result = await pool.query<DispatchRow>(query, params);
      return result.rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to list dispatches: ${msg}`,
        { error: msg, projectId }
      );
    }
  }

  /**
   * List all leases in a project.
   *
   * Implements cli-hive-contract.md §1 (lease domain, list action).
   *
   * @param projectId - Project ID
   * @param filter - Optional filter (agent_identity, status)
   * @returns Array of LeaseRow objects
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async listLeases(
    projectId: number,
    filter?: { agent_identity?: string; status?: string }
  ): Promise<LeaseRow[]> {
    const pool = getPool();
    try {
      let query = `
        SELECT id, proposal_id, agency_id, agent_identity, status, acquired_at,
               expires_at, released_at
          FROM roadmap.lease
         WHERE project_id = $1
      `;

      const params: any[] = [projectId];

      if (filter?.agent_identity) {
        query += ` AND agent_identity = $${params.length + 1}`;
        params.push(filter.agent_identity);
      }

      if (filter?.status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(filter.status);
      }

      query += ` ORDER BY id DESC`;

      const result = await pool.query<LeaseRow>(query, params);
      return result.rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to list leases: ${msg}`,
        { error: msg, projectId }
      );
    }
  }

  /**
   * List all workflow templates.
   *
   * Implements cli-hive-contract.md §1 (workflow domain, list action).
   *
   * @returns Array of WorkflowTemplateRow objects
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async listWorkflowTemplates(): Promise<WorkflowTemplateRow[]> {
    const pool = getPool();
    try {
      const query = `
        SELECT id, name, description, states, transitions, created_at,
               updated_at, project_id
          FROM roadmap.workflow_templates
         ORDER BY name ASC
      `;

      const result = await pool.query<WorkflowTemplateRow>(query);
      return result.rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to list workflow templates: ${msg}`,
        { error: msg }
      );
    }
  }

  /**
   * Get a single workflow template by name.
   *
   * Implements cli-hive-contract.md §1 (workflow domain, show action).
   *
   * @param name - Workflow template name (e.g., "RFC 5-Stage")
   * @returns WorkflowTemplateRow if found, null if not
   * @throws HiveError with code REMOTE_FAILURE if DB unreachable
   */
  async getWorkflowTemplate(name: string): Promise<WorkflowTemplateRow | null> {
    const pool = getPool();
    try {
      const query = `
        SELECT id, name, description, states, transitions, created_at,
               updated_at, project_id
          FROM roadmap.workflow_templates
         WHERE name = $1
      `;

      const result = await pool.query<WorkflowTemplateRow>(query, [name]);
      return result.rows[0] ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw Errors.remoteFailure(
        `Failed to get workflow template: ${msg}`,
        { error: msg, name }
      );
    }
  }
}

/**
 * Get the process-wide singleton ControlPlaneClient instance.
 *
 * @returns The singleton ControlPlaneClient
 */
export function getControlPlaneClient(): ControlPlaneClient {
  if (!clientInstance) {
    clientInstance = new ControlPlaneClient();
  }
  return clientInstance;
}
