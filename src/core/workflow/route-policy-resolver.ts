import { query } from "../../infra/postgres/pool.ts";

export interface ProjectRoutePolicy {
  projectId: number;
  allowedRouteProviders: string[];
  forbiddenRouteProviders: string[];
  maxHourlyTokensByRoute: Record<string, number>;
  updatedAt: Date;
}

export async function getProjectRoutePolicy(projectId: number): Promise<ProjectRoutePolicy | null> {
  const result = await query(
    `SELECT project_id, allowed_route_providers, forbidden_route_providers,
            max_hourly_tokens_by_route, updated_at
     FROM roadmap.project_route_policy
     WHERE project_id = $1`,
    [projectId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    projectId: row.project_id as number,
    allowedRouteProviders: (row.allowed_route_providers as string[]) ?? [],
    forbiddenRouteProviders: (row.forbidden_route_providers as string[]) ?? [],
    maxHourlyTokensByRoute: (row.max_hourly_tokens_by_route as Record<string, number>) ?? {},
    updatedAt: new Date(row.updated_at as string),
  };
}

/** Returns true if the given route provider is permitted under this project's policy. */
export function isRouteAllowed(policy: ProjectRoutePolicy, routeProvider: string): boolean {
  if (policy.forbiddenRouteProviders.includes(routeProvider)) return false;
  if (policy.allowedRouteProviders.length === 0) return true;
  return policy.allowedRouteProviders.includes(routeProvider);
}
