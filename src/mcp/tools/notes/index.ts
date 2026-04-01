import type { RoadmapConfig } from "../../../types/index.ts";
import type { McpServer } from "../../server.ts";
import { createSimpleValidatedTool } from "../../validation/tool-wrapper.ts";
import { NoteHandlers } from "./handlers.ts";
import { noteCreateSchema, noteDeleteSchema, noteListSchema, noteDisplaySchema } from "./schemas.ts";

export function registerNoteTools(server: McpServer, projectRoot: string): void {
	const handlers = new NoteHandlers(server, projectRoot);

	const createTool = createSimpleValidatedTool(
		{
			name: "create_note",
			description: "Create a note/discussion/review attached to a proposal. Supports markdown content and multiple note types (discussion, review, decision, question, general).",
			inputSchema: noteCreateSchema,
		},
		noteCreateSchema,
		async (args) => handlers.createNote(args),
	);

	const listTool = createSimpleValidatedTool(
		{
			name: "note_list",
			description: "List all notes attached to a proposal. Can filter by note type.",
			inputSchema: noteListSchema,
		},
		noteListSchema,
		async (args) => handlers.listNotes(args),
	);

	const deleteTool = createSimpleValidatedTool(
		{
			name: "delete_note",
			description: "Delete a note by ID.",
			inputSchema: noteDeleteSchema,
		},
		noteDeleteSchema,
		async (args) => handlers.deleteNote(args),
	);

	const displayTool = createSimpleValidatedTool(
		{
			name: "note_display",
			description: "Display full discussion notes for a proposal with formatted content. Shows note type, author, timestamp, and full body text.",
			inputSchema: noteDisplaySchema,
		},
		noteDisplaySchema,
		async (args) => handlers.displayNotes(args),
	);

	server.addTool(createTool);
	server.addTool(listTool);
	server.addTool(deleteTool);
	server.addTool(displayTool);
}
