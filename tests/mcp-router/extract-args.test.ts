import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	extractArgs,
	registerConsolidatedTools,
} from "../../src/apps/mcp-server/tools/consolidated.ts";
import { McpServer } from "../../src/mcp/server.ts";
import type { McpToolHandler } from "../../src/mcp/types.ts";

function textFrom(
	result: Awaited<ReturnType<McpServer["invokeTool"]>>,
): string {
	const item = result.content[0];
	return item.type === "text" ? item.text : "";
}

function noopTool(name: string, description: string): McpToolHandler {
	return {
		name,
		description,
		inputSchema: {},
		async handler() {
			return { content: [{ type: "text", text: name }] };
		},
	};
}

describe("MCP router extractArgs", () => {
	it("uses object-form args", () => {
		assert.deepEqual(extractArgs({ action: "run", args: { id: "P486" } }), {
			id: "P486",
		});
	});

	it("uses JSON-string args", () => {
		assert.deepEqual(
			extractArgs({ action: "run", args: '{"id":"P486","limit":2}' }),
			{ id: "P486", limit: 2 },
		);
	});

	it("treats an empty args string as no nested args", () => {
		assert.deepEqual(extractArgs({ action: "run", args: "", id: "P486" }), {
			id: "P486",
		});
	});

	it("rejects malformed JSON-string args", () => {
		assert.throws(
			() => extractArgs({ action: "run", args: "{not json}" }),
			/Router args must be an object or JSON-encoded object string/,
		);
	});

	it("rejects array args", () => {
		assert.throws(
			() => extractArgs({ action: "run", args: ["P486"] }),
			/Router args must be an object or JSON-encoded object string/,
		);
	});

	it("ignores null args", () => {
		assert.deepEqual(extractArgs({ action: "run", args: null, id: "P486" }), {
			id: "P486",
		});
	});

	it("uses rest-only args when args is missing", () => {
		assert.deepEqual(extractArgs({ action: "run", id: "P486" }), {
			id: "P486",
		});
	});

	it("merges rest args with nested args, with nested args taking precedence", () => {
		assert.deepEqual(
			extractArgs({
				action: "run",
				id: "rest",
				agent: "Worker A",
				args: { id: "nested" },
			}),
			{ id: "nested", agent: "Worker A" },
		);
	});
});

describe("MCP tool registry collisions", () => {
	let projectRoot: string;
	let originalStrict: string | undefined;
	let originalWarn: typeof console.warn;
	const warnings: unknown[][] = [];

	beforeEach(async () => {
		projectRoot = await mkdtemp(join(tmpdir(), "agenthive-mcp-router-"));
		originalStrict = process.env.AGENTHIVE_TOOL_REGISTRY_STRICT;
		originalWarn = console.warn;
		warnings.length = 0;
		console.warn = (...args: unknown[]) => {
			warnings.push(args);
		};
		delete process.env.AGENTHIVE_TOOL_REGISTRY_STRICT;
	});

	afterEach(async () => {
		if (originalStrict === undefined) {
			delete process.env.AGENTHIVE_TOOL_REGISTRY_STRICT;
		} else {
			process.env.AGENTHIVE_TOOL_REGISTRY_STRICT = originalStrict;
		}
		console.warn = originalWarn;
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("warns and keeps last-write-wins by default", async () => {
		const server = new McpServer(projectRoot, "test");
		try {
			server.addTool(noopTool("collision_tool", "prior description"));
			server.addTool(noopTool("collision_tool", "new description"));

			assert.equal(warnings.length, 1);
			assert.equal(warnings[0][0], "[McpServer] duplicate tool registration");
			const warning = warnings[0][1] as Record<string, unknown>;
			assert.equal(warning.event, "mcp_tool_name_collision");
			assert.equal(warning.tool_name, "collision_tool");
			assert.equal(warning.prior_description, "prior description");
			assert.equal(warning.new_description, "new description");
			assert.equal(
				typeof (warnings[0][1] as { callsite_stack?: unknown }).callsite_stack,
				"string",
			);

			const result = await server.invokeTool("collision_tool");
			assert.equal(textFrom(result), "collision_tool");
		} finally {
			await server.stop();
		}
	});

	it("throws on collision when strict mode is enabled", async () => {
		process.env.AGENTHIVE_TOOL_REGISTRY_STRICT = "true";
		const server = new McpServer(projectRoot, "test");
		try {
			server.addTool(noopTool("collision_tool", "prior description"));
			assert.throws(
				() => server.addTool(noopTool("collision_tool", "new description")),
				/MCP tool registration collision for 'collision_tool'/,
			);
		} finally {
			await server.stop();
		}
	});
});

describe("consolidated router list_actions", () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await mkdtemp(join(tmpdir(), "agenthive-mcp-router-"));
	});

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true });
	});

	it("shows the underlying tool_name mapping for mcp_ops actions", async () => {
		const server = new McpServer(projectRoot, "test");
		try {
			registerConsolidatedTools(server);
			const result = await server.testInterface.callTool({
				params: {
					name: "mcp_ops",
					arguments: { action: "list_actions" },
				},
			});
			const text = textFrom(result);
			assert.match(text, /\| action \| tool_name \|/);
			assert.match(text, /\| test_run \| test_run \|/);
		} finally {
			await server.stop();
		}
	});
});
