/**
 * Context resolver per cli-hive-contract.md §5.
 *
 * Implements the precedence hierarchy:
 * 1. Explicit flags (--project, --agency, --host)
 * 2. Environment variables (HIVE_PROJECT, HIVE_AGENCY, HIVE_HOST)
 * 3. CWD-derived (git worktree, .hive/config.json, roadmap.yaml, git remote)
 * 4. Control-plane default (user's primary project/agency)
 * 5. Fail-fast if unresolved
 *
 * P455 R3 integration: lanes E/F populate `project_id`, `projectSlug`, and
 * the `*ResolutionSource` fields directly off the resolved context, so this
 * resolver eagerly looks the project up via the control-plane client when a
 * slug or numeric reference is supplied.
 */

import { HiveError } from "./error";
import { getControlPlaneClient } from "./control-plane-client";
import type { ProjectRow } from "./control-plane-types";

export type ContextResolutionSource =
  | "flag"
  | "env"
  | "cwd-worktree"
  | "cwd-config"
  | "cwd-yaml"
  | "cwd-git-remote"
  | "control-plane-default"
  | "fail-fast";

export interface ResolvedContext {
  /**
   * The active project. Mostly the slug; numeric ids resolve through the
   * control-plane client and project_id below carries the canonical id.
   */
  project: string;

  /**
   * Resolved project_id. pg returns bigint as a string, but project_ids
   * are small integers (currently 1..3), so we coerce to number for
   * downstream arithmetic and consistency with the proposal handler
   * signatures (which expect number). Domains that need string can do
   * `String(ctx.project_id)`.
   */
  project_id?: number;

  /** Convenience alias for callers that prefer camelCase. */
  projectId?: number;

  /** Project slug (e.g. "agenthive"); same as `project` when slug-resolved. */
  projectSlug?: string;

  /** Project display name from `roadmap.project.name`. */
  projectName?: string;

  agency?: string;
  host?: string;
  mcp_url?: string;
  db_host?: string;
  db_port?: number;
  resolved_at: string;

  /** Where each value came from. Useful for `hive context` output. */
  projectResolutionSource?: ContextResolutionSource;
  agencyResolutionSource?: ContextResolutionSource;
  hostResolutionSource?: ContextResolutionSource;
}

/**
 * Hydrate a partial context with project_id / projectSlug / projectName by
 * consulting the control-plane client. Best-effort: failure to look up the
 * project (e.g. unknown slug) leaves the partial context unchanged.
 */
async function hydrateProject(
  ctx: ResolvedContext,
): Promise<ResolvedContext> {
  if (!ctx.project) return ctx;
  if (ctx.project_id) return ctx;

  try {
    const client = getControlPlaneClient();
    const project = (await client.getProject(ctx.project)) as ProjectRow | null;
    if (project) {
      return {
        ...ctx,
        project_id: Number(project.project_id),
        projectId: Number(project.project_id),
        projectSlug: project.slug,
        projectName: project.name,
      };
    }
  } catch {
    // Best-effort hydration; control-plane may be down. Leave as-is.
  }
  return ctx;
}

/**
 * Resolve the CLI context from flags, environment, CWD, and control plane.
 */
export async function resolveContext(
  flags: {
    project?: string;
    agency?: string;
    host?: string;
  },
  env: Record<string, string | undefined> = process.env
): Promise<ResolvedContext> {
  const now = () => new Date().toISOString();

  // Step 1: Explicit flags (highest precedence)
  if (flags.project) {
    return hydrateProject({
      project: flags.project,
      agency: flags.agency,
      host: flags.host,
      resolved_at: now(),
      projectResolutionSource: "flag",
      agencyResolutionSource: flags.agency ? "flag" : undefined,
      hostResolutionSource: flags.host ? "flag" : undefined,
    });
  }

  // Step 2: Environment variables
  const envProject = env.HIVE_PROJECT;
  const envAgency = env.HIVE_AGENCY;
  const envHost = env.HIVE_HOST;

  if (envProject) {
    return hydrateProject({
      project: envProject,
      agency: envAgency || flags.agency,
      host: envHost || flags.host,
      resolved_at: now(),
      projectResolutionSource: "env",
      agencyResolutionSource: envAgency
        ? "env"
        : flags.agency
          ? "flag"
          : undefined,
      hostResolutionSource: envHost
        ? "env"
        : flags.host
          ? "flag"
          : undefined,
    });
  }

  // Step 3: CWD-derived. Lane C's control-plane-client.resolveProjectFromCwd
  // implements the prefix-match algorithm from
  // docs/architecture/cli-hive-cwd-context-resolution.md.
  try {
    const client = getControlPlaneClient();
    const project = await client.resolveProjectFromCwd(process.cwd());
    if (project) {
      return {
        project: project.slug,
        project_id: Number(project.project_id),
        projectId: Number(project.project_id),
        projectSlug: project.slug,
        projectName: project.name,
        agency: flags.agency,
        host: flags.host,
        resolved_at: now(),
        projectResolutionSource: "cwd-worktree",
        agencyResolutionSource: flags.agency ? "flag" : undefined,
        hostResolutionSource: flags.host ? "flag" : undefined,
      };
    }
  } catch {
    // Control plane unreachable; fall through to defaults / fail-fast.
  }

  // Step 4: Control-plane default — pick the lowest-id active project as the
  // operator's implicit scope. This mirrors how the web server's
  // resolveProjectScope() falls back when no header is supplied.
  try {
    const client = getControlPlaneClient();
    const projects = await client.listProjects({ status: "active" });
    if (projects.length > 0) {
      const project = projects[0];
      return {
        project: project.slug,
        project_id: Number(project.project_id),
        projectId: Number(project.project_id),
        projectSlug: project.slug,
        projectName: project.name,
        agency: flags.agency,
        host: flags.host,
        resolved_at: now(),
        projectResolutionSource: "control-plane-default",
        agencyResolutionSource: flags.agency ? "flag" : undefined,
        hostResolutionSource: flags.host ? "flag" : undefined,
      };
    }
  } catch {
    // fall through
  }

  // Step 5: Fail-fast if unresolved
  throw new HiveError(
    "NOT_FOUND",
    "Cannot resolve project/agency context.",
    {
      hint:
        "Set `--project`, `HIVE_PROJECT` env, `.hive/config.json`, or register a default in control plane. See `hive help context`.",
      detail: {
        provided_flags: {
          project: flags.project ? "yes" : "no",
          agency: flags.agency ? "yes" : "no",
          host: flags.host ? "yes" : "no",
        },
        env_vars: {
          HIVE_PROJECT: envProject ? "set" : "unset",
          HIVE_AGENCY: envAgency ? "set" : "unset",
          HIVE_HOST: envHost ? "set" : "unset",
        },
      },
    }
  );
}

/**
 * Check if a command should bypass project/context resolution.
 */
export function isGlobalCommand(command: string): boolean {
  const globalCommands = ["help", "version", "completion", "init"];
  return globalCommands.includes(command);
}
