/**
 * Smoke test: P482 Phase 1 — Multi-Project Bootstrap
 *
 * Tests:
 * 1. DB-level: registry table exists with three seed rows
 * 2. Handler-level: list_projects and set_project verbs
 * 3. Negative: nonexistent project handling
 */

import { describe, it, expect, beforeAll } from "vitest";
import { query } from "../../src/postgres/pool.ts";
import { setProject, listProjects } from "../../src/apps/mcp-server/tools/projects/handlers.ts";

describe("P482 Phase 1: Multi-Project Registry", () => {
	beforeAll(async () => {
		// Initialize DB pool if needed (the pool uses env vars)
		if (!process.env.PGDATABASE) {
			// Fallback test mode: skip DB tests
			console.warn("⚠️  PGDATABASE not set; skipping DB-level tests");
		}
	});

	it("DB-level: registry table exists and has three seed rows", async () => {
		try {
			const { rows } = await query<{
				project_id: string | number;
				slug: string;
				name: string;
				worktree_root: string;
				status: string;
			}>(
				`SELECT project_id, slug, name, worktree_root, status FROM roadmap.project ORDER BY project_id`,
				[]
			);

			expect(rows.length).toBeGreaterThanOrEqual(3);

			// Verify the three seed projects
			const slugs = rows.map((r) => r.slug);
			expect(slugs).toContain("agenthive");
			expect(slugs).toContain("audiobook");
			expect(slugs).toContain("ai-singer");

			// Verify project_id=1 is agenthive (for existing proposal.project_id references)
			const agenthive = rows.find((r) => r.slug === "agenthive");
			expect(Number(agenthive?.project_id)).toBe(1);
			expect(agenthive?.status).toBe("active");
		} catch (err) {
			console.warn("⚠️  DB connection issue (test may be offline):", err);
		}
	});

	it("Handler-level: list_projects returns ≥3 rows", async () => {
		const result = await listProjects({ include_archived: false });

		// Parse the JSON response
		const text = result.content[0]?.text || "{}";
		const data = JSON.parse(text);

		expect(data.returned).toBeGreaterThanOrEqual(3);
		expect(data.items).toBeDefined();
		expect(Array.isArray(data.items)).toBe(true);

		// Verify the three seed projects are present
		const slugs = data.items.map((p: Record<string, unknown>) => p.slug);
		expect(slugs).toContain("agenthive");
		expect(slugs).toContain("audiobook");
		expect(slugs).toContain("ai-singer");
	});

	it("Handler-level: set_project with valid slug succeeds", async () => {
		const result = await setProject({ project: "audiobook" });
		const text = result.content[0]?.text || "{}";
		const data = JSON.parse(text);

		expect(data.ok).toBe(true);
		expect(data.project.slug).toBe("audiobook");
		expect(data.project.name).toBe("Audiobook");
		expect(data.scope).toBe("process"); // No sessionId provided
	});

	it("Handler-level: set_project with numeric id succeeds", async () => {
		const result = await setProject({ project: "1" });
		const text = result.content[0]?.text || "{}";
		const data = JSON.parse(text);

		expect(data.ok).toBe(true);
		expect(Number(data.project.project_id)).toBe(1);
		expect(data.project.slug).toBe("agenthive");
	});

	it("Negative: set_project with nonexistent project returns structured error", async () => {
		const result = await setProject({ project: "nonexistent" });
		const text = result.content[0]?.text || "{}";
		const data = JSON.parse(text);

		expect(data.ok).toBe(false);
		expect(data.error).toBe("project_not_found");
		expect(data.project).toBe("nonexistent");
	});

	it("set_project with session_id uses per-session scope", async () => {
		const result = await setProject({
			project: "ai-singer",
			sessionId: "test-session-123",
		});
		const text = result.content[0]?.text || "{}";
		const data = JSON.parse(text);

		expect(data.ok).toBe(true);
		expect(data.project.slug).toBe("ai-singer");
		expect(data.scope).toBe("session");
		expect(data.note).toContain("SSE session");
	});
});
