/**
 * MCP Tool Schemas for Testing Tools
 */

export const testDiscoverSchema = {
	properties: {
		testDir: {
			type: "string",
			description: "Path to test directory (defaults to src/test/)",
		},
		category: {
			type: "string",
			enum: ["unit", "integration", "e2e", "regression"],
			description: "Filter by test category",
		},
	},
};

export const testRunSchema = {
	properties: {
		files: {
			type: "array",
			items: { type: "string" },
			description: "Specific test files to run (defaults to all discovered)",
		},
		category: {
			type: "string",
			enum: ["unit", "integration", "e2e", "regression"],
			description: "Run tests of a specific category only",
		},
		timeout: {
			type: "number",
			description: "Timeout per test file in ms (default: 30000)",
		},
		testDir: {
			type: "string",
			description: "Path to test directory (defaults to src/test/)",
		},
	},
};

export const testIssuesSchema = {
	properties: {
		proposalId: {
			type: "string",
			description: "Filter issues by proposal ID",
		},
		status: {
			type: "string",
			enum: ["open", "resolved", "wontfix"],
			description: "Filter by issue status",
		},
		severity: {
			type: "string",
			enum: ["critical", "major", "minor"],
			description: "Filter by severity",
		},
	},
};

export const testIssueCreateSchema = {
	properties: {
		proposalId: {
			type: "string",
			description: "Proposal ID that introduced or is affected by the issue",
		},
		title: {
			type: "string",
			description: "Brief description of the issue",
		},
		severity: {
			type: "string",
			enum: ["critical", "major", "minor"],
			description: "Issue severity",
		},
		testFile: {
			type: "string",
			description: "Test file that discovered the issue",
		},
		description: {
			type: "string",
			description: "Detailed description of the issue",
		},
	},
	required: ["proposalId", "title", "severity", "testFile"],
};

export const testIssueResolveSchema = {
	properties: {
		issueId: {
			type: "string",
			description: "Issue ID to resolve",
		},
		resolution: {
			type: "string",
			description: "Resolution notes",
		},
	},
	required: ["issueId", "resolution"],
};
