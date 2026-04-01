import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";
import { execSync } from "child_process";

export class NoteHandlers {
	private readonly core: McpServer;
	private readonly projectRoot: string;

	constructor(core: McpServer, projectRoot: string) {
		this.core = core;
		this.projectRoot = projectRoot;
	}

	async createNote(args: {
		proposal_id: string;
		content: string;
		note_type?: string;
		author?: string;
	}): Promise<CallToolResult> {
		try {
			const agentId = args.author || "system";
			const noteType = args.note_type || "general";
			// Use SDB discussion table (S141)
			await this.callReducer("create_discussion", [
				args.proposal_id,
				agentId,
				args.content,
				noteType,
			]);
			return {
				content: [
					{
						type: "text",
						text: `✅ Discussion created on ${args.proposal_id} (${noteType}) by ${agentId}`,
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to create discussion: ${(error as Error).message}`);
		}
	}

	async listNotes(args: {
		proposal_id: string;
		note_type?: string;
		limit?: number;
	}): Promise<CallToolResult> {
		try {
			const limit = args.limit || 20;
			// Use SDB discussion table (S141)
			let query = `SELECT id, step_id, agent_id, content, note_type, created_at FROM discussion WHERE step_id = '${args.proposal_id}'`;
			if (args.note_type) {
				query += ` AND note_type = '${args.note_type}'`;
			}
			const notes = await this.querySql(query);

			if (!notes || notes.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `📝 No discussions found for ${args.proposal_id}`,
						},
					],
				};
			}

			const typeIcons: Record<string, string> = {
				discussion: "💬",
				review: "🔍",
				decision: "✅",
				question: "❓",
				general: "📝",
			};

			const lines = notes.slice(0, limit).map((n: any) => {
				const icon = typeIcons[n.note_type] || "📝";
				return `${icon} **[${n.note_type}]** ${n.agent_id}: ${n.content}`;
			});

			return {
				content: [
					{
						type: "text",
						text: `## 💬 Discussions for ${args.proposal_id} (${notes.length})\n\n${lines.join("\n")}`,
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to list discussions: ${(error as Error).message}`);
		}
	}

	async deleteNote(args: {
		note_id: number;
		proposal_id?: string;
	}): Promise<CallToolResult> {
		try {
			// Use SDB discussion table (S141)
			await this.callReducer("delete_discussion", [
				String(args.note_id),
				"system",
			]);
			return {
				content: [
					{
						type: "text",
						text: `✅ Discussion ${args.note_id} deleted`,
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to delete discussion: ${(error as Error).message}`);
		}
	}

	async displayNotes(args: {
		proposal_id: string;
		note_type?: string;
	}): Promise<CallToolResult> {
		try {
			let query = `SELECT id, step_id, agent_id, content, note_type, created_at FROM proposal_note WHERE step_id = '${args.proposal_id}'`;
			if (args.note_type) {
				query += ` AND note_type = '${args.note_type}'`;
			}
			query += ` ORDER BY created_at DESC`;

			const notes = await this.querySql(query);

			if (!notes || notes.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `📝 No discussion notes for ${args.proposal_id}`,
						},
					],
				};
			}

			const typeIcons: Record<string, string> = {
				discussion: "💬",
				review: "🔍",
				decision: "✅",
				question: "❓",
				general: "📝",
			};

			const typeColors: Record<string, string> = {
				discussion: "cyan",
				review: "yellow",
				decision: "green",
				question: "magenta",
				general: "white",
			};

			const lines = [`## 💬 Discussion: ${args.proposal_id} (${notes.length} notes)\n`];

			for (const note of notes) {
				const icon = typeIcons[note.note_type] || "📝";
				const date = new Date(Number(note.created_at)).toLocaleString();
				lines.push(`${icon} **[${note.note_type.toUpperCase()}]** ${note.agent_id} — ${date}`);
				lines.push(`${note.content}\n`);
			}

			return {
				content: [
					{
						type: "text",
						text: lines.join("\n"),
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to display notes: ${(error as Error).message}`);
		}
	}

	private async querySql(sql: string): Promise<any[]> {
		try {
			const result = execSync(
				`spacetime sql --server local agent-roadmap-v2 "${sql}"`,
				{ encoding: "utf8", cwd: this.projectRoot },
			);
			const lines = result
				.trim()
				.split("\n")
				.filter((l) => !l.includes("WARNING"));
			if (lines.length < 2) return [];
			const headers = lines[0]
				.split("|")
				.map((h) => h.trim())
				.filter(Boolean);
			return lines.slice(1).map((line) => {
				const values = line
					.split("|")
					.map((v) => v.trim().replace(/"/g, ""));
				const obj: any = {};
				headers.forEach((h, i) => {
					obj[h] = values[i]!;
				});
				return obj;
			});
		} catch {
			return [];
		}
	}

	private async callReducer(name: string, args: string[]): Promise<void> {
		const argsStr = args.map((a) => `"${a}"`).join(" ");
		execSync(
			`spacetime call --server local agent-roadmap-v2 ${name} ${argsStr}`,
			{
				encoding: "utf8",
				cwd: this.projectRoot,
				stdio: "pipe",
			},
		);
	}
}
