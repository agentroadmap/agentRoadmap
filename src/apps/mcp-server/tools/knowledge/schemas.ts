/**
 * MCP tool schemas for knowledge base operations
 */

export const knowledgeAddSchema = {
	type: "object",
	properties: {
		type: {
			type: "string",
			enum: ["solution", "pattern", "decision", "obstacle", "learned"],
			description: "Type of knowledge entry",
		},
		title: {
			type: "string",
			description: "Title of the knowledge entry",
		},
		content: {
			type: "string",
			description: "Full content/solution description",
		},
		keywords: {
			type: "array",
			items: { type: "string" },
			description: "Keywords for search",
		},
		relatedProposals: {
			type: "array",
			items: { type: "string" },
			description: "Related proposal IDs",
		},
		sourceProposalId: {
			type: "string",
			description: "Source proposal ID if derived from a proposal",
		},
		author: {
			type: "string",
			description: "Author agent identifier",
		},
		confidence: {
			type: "number",
			minimum: 0,
			maximum: 100,
			description: "Confidence level (0-100)",
		},
		tags: {
			type: "array",
			items: { type: "string" },
			description: "Tags for categorization",
		},
	},
	required: ["type", "title", "content", "author"],
};

export const knowledgeSearchSchema = {
	type: "object",
	properties: {
		keywords: {
			type: "array",
			items: { type: "string" },
			description: "Keywords to search for",
		},
		type: {
			type: "string",
			enum: ["solution", "pattern", "decision", "obstacle", "learned"],
			description: "Filter by entry type",
		},
		tags: {
			type: "array",
			items: { type: "string" },
			description: "Filter by tags",
		},
		minConfidence: {
			type: "number",
			minimum: 0,
			maximum: 100,
			description: "Minimum confidence score",
		},
		relatedProposal: {
			type: "string",
			description: "Filter by related proposal ID",
		},
		limit: {
			type: "number",
			description: "Maximum number of results",
		},
	},
	required: ["keywords"],
};

export const knowledgeRecordDecisionSchema = {
	type: "object",
	properties: {
		title: {
			type: "string",
			description: "Decision title",
		},
		content: {
			type: "string",
			description: "Decision description",
		},
		rationale: {
			type: "string",
			description: "Reasoning behind the decision",
		},
		alternatives: {
			type: "array",
			items: { type: "string" },
			description: "Alternatives that were considered",
		},
		author: {
			type: "string",
			description: "Author agent identifier",
		},
		relatedProposalId: {
			type: "string",
			description: "Related proposal ID",
		},
		tags: {
			type: "array",
			items: { type: "string" },
			description: "Tags for categorization",
		},
	},
	required: ["title", "content", "rationale", "author"],
};

export const knowledgeExtractPatternSchema = {
	type: "object",
	properties: {
		name: {
			type: "string",
			description: "Pattern name",
		},
		description: {
			type: "string",
			description: "Pattern description",
		},
		codeExample: {
			type: "string",
			description: "Code example or implementation",
		},
		firstSeenAt: {
			type: "string",
			description: "When this pattern was first observed (ISO date)",
		},
		relatedEntries: {
			type: "array",
			items: { type: "string" },
			description: "Related knowledge entry IDs",
		},
	},
	required: ["name", "description", "firstSeenAt"],
};

export const knowledgeGetDecisionsSchema = {
	type: "object",
	properties: {
		relatedProposal: {
			type: "string",
			description: "Filter by related proposal ID",
		},
	},
};

export const knowledgeGetStatsSchema = {
	type: "object",
	properties: {},
};

export const knowledgeMarkHelpfulSchema = {
	type: "object",
	properties: {
		entryId: {
			type: "string",
			description: "Knowledge entry ID to mark as helpful",
		},
	},
	required: ["entryId"],
};
