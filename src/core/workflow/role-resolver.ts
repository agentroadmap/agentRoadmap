/**
 * role-resolver.ts
 *
 * Resolver for roadmap.agent_role_profile rows, keyed by queue dimensions
 * (workflowTemplateId, stage, maturity, optional projectId).
 *
 * Project-scoped rows override global rows for the same
 * (workflow_template_id, stage, maturity, role) tuple — analogous to COALESCE
 * override semantics: if a project row exists for a given role key, it shadows
 * the global row; global rows fill the gaps.
 *
 * Ref: P748
 */

import { query } from '../../infra/postgres/pool.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentRoleProfile {
  id: number;
  scope: 'global' | 'project';
  projectId: number | null;
  workflowTemplateId: number;
  stage: string;
  maturity: 'new' | 'active' | 'mature' | 'obsolete';
  role: string;
  requiredCapabilities: string[];
  allowedRouteProviders: string[] | null;
  forbiddenRouteProviders: string[] | null;
  promptTemplate: Record<string, unknown> | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueKey {
  workflowTemplateId: number;
  stage: string;
  maturity: string;
  /** When provided, project-scoped overrides are included and take precedence. */
  projectId?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row mapper
// ─────────────────────────────────────────────────────────────────────────────

interface AgentRoleProfileRow {
  id: string;
  scope: 'global' | 'project';
  project_id: string | null;
  workflow_template_id: string;
  stage: string;
  maturity: 'new' | 'active' | 'mature' | 'obsolete';
  role: string;
  required_capabilities: string[];
  allowed_route_providers: string[] | null;
  forbidden_route_providers: string[] | null;
  prompt_template: Record<string, unknown> | null;
  priority: number;
  created_at: Date;
  updated_at: Date;
}

function toAgentRoleProfile(row: AgentRoleProfileRow): AgentRoleProfile {
  return {
    id:                     Number(row.id),
    scope:                  row.scope,
    projectId:              row.project_id != null ? Number(row.project_id) : null,
    workflowTemplateId:     Number(row.workflow_template_id),
    stage:                  row.stage,
    maturity:               row.maturity,
    role:                   row.role,
    requiredCapabilities:   row.required_capabilities ?? [],
    allowedRouteProviders:  row.allowed_route_providers ?? null,
    forbiddenRouteProviders: row.forbidden_route_providers ?? null,
    promptTemplate:         row.prompt_template ?? null,
    priority:               row.priority,
    createdAt:              row.created_at,
    updatedAt:              row.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns ordered AgentRoleProfile rows for the given queue key.
 *
 * Override semantics (COALESCE-style):
 *  - When `projectId` is supplied, project-scoped rows for that project are
 *    fetched alongside global rows.  For any (stage, maturity, role) triple
 *    where both a project row and a global row exist, the project row wins
 *    (lower effective rank).  Global rows fill any roles not overridden.
 *  - Final ordering: priority ASC, then id ASC (stable tie-break).
 *
 * When `projectId` is omitted, only global rows are returned.
 */
export async function getRolesForQueue(
  queueKey: QueueKey,
): Promise<AgentRoleProfile[]> {
  const { workflowTemplateId, stage, maturity, projectId } = queueKey;

  if (projectId != null) {
    // With project overrides: use DISTINCT ON (role) to pick project rows first,
    // then fall back to global rows for any roles not covered by the project.
    const result = await query<AgentRoleProfileRow>(
      `
      SELECT DISTINCT ON (role)
             id, scope, project_id, workflow_template_id,
             stage, maturity, role,
             required_capabilities, allowed_route_providers,
             forbidden_route_providers, prompt_template,
             priority, created_at, updated_at
      FROM   roadmap.agent_role_profile
      WHERE  workflow_template_id = $1
        AND  stage                = $2
        AND  maturity             = $3
        AND  (
               (scope = 'global'  AND project_id IS NULL)
            OR (scope = 'project' AND project_id = $4)
             )
      ORDER BY role,
               -- project rows sort before global: NULL project_id sorts last
               CASE WHEN project_id = $4 THEN 0 ELSE 1 END,
               priority ASC,
               id ASC
      `,
      [workflowTemplateId, stage, maturity, projectId],
    );

    // Re-sort the deduplicated results by priority then id
    return result.rows
      .map(toAgentRoleProfile)
      .sort((a, b) => a.priority - b.priority || a.id - b.id);
  }

  // Global-only path (no project overrides)
  const result = await query<AgentRoleProfileRow>(
    `
    SELECT id, scope, project_id, workflow_template_id,
           stage, maturity, role,
           required_capabilities, allowed_route_providers,
           forbidden_route_providers, prompt_template,
           priority, created_at, updated_at
    FROM   roadmap.agent_role_profile
    WHERE  scope                = 'global'
      AND  project_id           IS NULL
      AND  workflow_template_id = $1
      AND  stage                = $2
      AND  maturity             = $3
    ORDER BY priority ASC, id ASC
    `,
    [workflowTemplateId, stage, maturity],
  );

  return result.rows.map(toAgentRoleProfile);
}
