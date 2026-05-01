import { query } from "../../../../infra/postgres/pool.ts";
import type { CallToolResult } from "../../types.ts";

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

// List all projects
export const projectListHandler: ToolHandler = async () => {
	const result = await query(
		`SELECT p.id, p.name, p.description, p.owner, p.is_active,
				COUNT(pr.agency_id) FILTER (WHERE pr.is_active = true) as agency_count
		 FROM roadmap_workforce.projects p
		 LEFT JOIN roadmap_workforce.provider_registry pr ON pr.project_id = p.id
		 GROUP BY p.id, p.name, p.description, p.owner, p.is_active
		 ORDER BY p.id`,
	);
	const lines = result.rows.map(
		(r: any) => `${r.name} (id=${r.id}, ${r.agency_count} agencies) — ${r.description ?? "no description"}`,
	);
	return {
		content: [{ type: "text" as const, text: lines.length > 0 ? lines.join("\n") : "No projects." }],
	};
};

// Create a new project
export const projectCreateHandler: ToolHandler = async (args) => {
	const { name, description, owner } = args as {
		name: string;
		description?: string;
		owner?: string;
	};
	const result = await query(
		`INSERT INTO roadmap_workforce.projects (name, description, owner)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, updated_at = now()
		 RETURNING id, name`,
		[name, description ?? null, owner ?? null],
	);
	return {
		content: [{ type: "text" as const, text: `Project: ${result.rows[0].name} (id=${result.rows[0].id})` }],
	};
};

// Agency joins a project
export const projectJoinHandler: ToolHandler = async (args) => {
	const { agencyIdentity, projectName, capabilities } = args as {
		agencyIdentity: string;
		projectName: string;
		capabilities?: string[];
	};

	// Look up agency
	const agency = await query(
		`SELECT id FROM roadmap_workforce.agent_registry WHERE agent_identity = $1`,
		[agencyIdentity],
	);
	if (agency.rows.length === 0) {
		return {
			content: [{ type: "text" as const, text: `Error: Agency '${agencyIdentity}' not registered. Call agency_register first.` }],
		};
	}

	// Look up project
	const project = await query(
		`SELECT id FROM roadmap_workforce.projects WHERE name = $1 AND is_active = true`,
		[projectName],
	);
	if (project.rows.length === 0) {
		return {
			content: [{ type: "text" as const, text: `Error: Project '${projectName}' not found or inactive.` }],
		};
	}

	// Join project
	const caps = capabilities ? JSON.stringify({ all: capabilities }) : "{}";
	await query(
		`INSERT INTO roadmap_workforce.provider_registry (agency_id, project_id, capabilities)
		 VALUES ($1, $2, $3::jsonb)
		 ON CONFLICT (agency_id, project_id, squad_name)
		 DO UPDATE SET capabilities = EXCLUDED.capabilities, is_active = true, updated_at = now()`,
		[agency.rows[0].id, project.rows[0].id, caps],
	);

	return {
		content: [{
			type: "text" as const,
			text: `${agencyIdentity} joined project '${projectName}'${capabilities ? ` with caps: ${capabilities.join(", ")}` : ""}`,
		}],
	};
};

// Agency leaves a project
export const projectLeaveHandler: ToolHandler = async (args) => {
	const { agencyIdentity, projectName } = args as {
		agencyIdentity: string;
		projectName: string;
	};

	const result = await query(
		`UPDATE roadmap_workforce.provider_registry pr
		 SET is_active = false, updated_at = now()
		 FROM roadmap_workforce.agent_registry ar, roadmap_workforce.projects p
		 WHERE pr.agency_id = ar.id
		   AND pr.project_id = p.id
		   AND ar.agent_identity = $1
		   AND p.name = $2
		   AND pr.is_active = true`,
		[agencyIdentity, projectName],
	);

	return {
		content: [{
			type: "text" as const,
			text: `${agencyIdentity} left project '${projectName}' (${result.rowCount} registrations deactivated)`,
		}],
	};
};

// List agencies in a project
export const projectAgenciesHandler: ToolHandler = async (args) => {
	const { projectName } = args as { projectName?: string };

	let sql = `SELECT ar.agent_identity, ar.status, p.name as project,
				COALESCE(pr.capabilities::text, '{}') as caps
		 FROM roadmap_workforce.provider_registry pr
		 JOIN roadmap_workforce.agent_registry ar ON ar.id = pr.agency_id
		 JOIN roadmap_workforce.projects p ON p.id = pr.project_id
		 WHERE pr.is_active = true`;
	const params: unknown[] = [];

	if (projectName) {
		sql += ` AND p.name = $1`;
		params.push(projectName);
	}
	sql += ` ORDER BY p.name, ar.agent_identity`;

	const result = await query(sql, params);
	const lines = result.rows.map(
		(r: any) => `[${r.project}] ${r.agent_identity} (${r.status}) — ${r.caps}`,
	);
	return {
		content: [{ type: "text" as const, text: lines.length > 0 ? lines.join("\n") : "No agencies in any project." }],
	};
};

// List all projects with their agencies
export const projectOverviewHandler: ToolHandler = async () => {
	const projects = await query(
		`SELECT p.id, p.name, p.description, p.is_active
		 FROM roadmap_workforce.projects p ORDER BY p.name`,
	);

	const lines: string[] = [];
	for (const p of projects.rows) {
		lines.push(`\n**${p.name}** (id=${p.id}, ${p.is_active ? "active" : "inactive"})`);
		if (p.description) lines.push(`  ${p.description}`);

		const agencies = await query(
			`SELECT ar.agent_identity, ar.status,
					COALESCE(string_agg(ac.capability, ', ' ORDER BY ac.capability), 'none') as agency_caps
			 FROM roadmap_workforce.provider_registry pr
			 JOIN roadmap_workforce.agent_registry ar ON ar.id = pr.agency_id
			 LEFT JOIN roadmap_workforce.agent_capability ac ON ac.agent_id = ar.id
			 WHERE pr.project_id = $1 AND pr.is_active = true
			 GROUP BY ar.id, ar.agent_identity, ar.status`,
			[p.id],
		);

		if (agencies.rows.length === 0) {
			lines.push("  (no agencies)");
		} else {
			for (const a of agencies.rows) {
				lines.push(`  • ${a.agent_identity} (${a.status}) — ${a.agency_caps}`);
			}
		}
	}

	return {
		content: [{ type: "text" as const, text: lines.join("\n") || "No projects." }],
	};
};
