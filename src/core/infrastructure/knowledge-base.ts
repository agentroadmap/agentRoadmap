/**
 * STATE-47: Agent Knowledge Base & Documentation
 *
 * Centralized knowledge base where agents can search for solutions, patterns, and past decisions.
 * Builds collective intelligence over time.
 *
 * AC#1: Agents can search past solutions by keywords
 * AC#2: Common patterns extracted and indexed
 * AC#3: Decisions and rationales recorded
 * AC#4: Knowledge base accessible via MCP tool
 */

import { mkdirSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
// SQLite removed

/** Types of knowledge entries */
export type KnowledgeEntryType = "solution" | "pattern" | "decision" | "obstacle" | "learned";

/** A knowledge base entry */
export interface KnowledgeEntry {
	/** Unique identifier */
	id: string;
	/** Entry type */
	type: KnowledgeEntryType;
	/** Title */
	title: string;
	/** Full description/solution text */
	content: string;
	/** Keywords for search */
	keywords: string[];
	/** Related proposal IDs */
	relatedProposals: string[];
	/** Source proposal ID (if derived from a proposal) */
	sourceProposalId?: string;
	/** Author agent */
	author: string;
	/** Confidence level (0-100) */
	confidence: number;
	/** Number of times this entry was helpful (upvotes) */
	helpfulCount: number;
	/** Number of times this entry was referenced */
	referenceCount: number;
	/** Tags for categorization */
	tags: string[];
	/** When created */
	createdAt: string;
	/** When last updated */
	updatedAt: string;
	/** Optional metadata */
	metadata?: Record<string, unknown>;
}

/** Search query for knowledge base */
export interface KnowledgeSearchQuery {
	/** Search keywords (fuzzy match) */
	keywords: string[];
	/** Filter by entry type */
	type?: KnowledgeEntryType;
	/** Filter by tags */
	tags?: string[];
	/** Minimum confidence score */
	minConfidence?: number;
	/** Related to specific proposal */
	relatedProposal?: string;
	/** Maximum results */
	limit?: number;
}

/** Result of a knowledge search */
export interface KnowledgeSearchResult {
	/** The matched entry */
	entry: KnowledgeEntry;
	/** Relevance score (0-100) */
	relevanceScore: number;
	/** Matching keywords */
	matchedKeywords: string[];
}

/** Pattern extracted from solutions */
export interface ExtractedPattern {
	/** Pattern identifier */
	id: string;
	/** Pattern name */
	name: string;
	/** Pattern description */
	description: string;
	/** Code example or implementation */
	codeExample?: string;
	/** When this pattern was first observed */
	firstSeenAt: string;
	/** Number of times pattern was used */
	usageCount: number;
	/** Success rate when using this pattern (0-100) */
	successRate: number;
	/** Related entry IDs */
	relatedEntries: string[];
}

const DB_FILENAME = "knowledge-base.db";

/**
 * Knowledge Base for collective agent intelligence.
 */
export class KnowledgeBase {
	private db: DatabaseSync | null = null;
	private dbPath: string;
	private projectRoot: string;

	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
		const roadmapDir = join(projectRoot, "roadmap");
		this.dbPath = join(roadmapDir, ".cache", DB_FILENAME);
	}

	/**
	 * Initialize the database connection and schema.
	 */
	private ensureInitialized(): void {
		if (this.db) return;

		const dir = join(this.projectRoot, "roadmap", ".cache");
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		this.db = new DatabaseSync(this.dbPath);
		this.initializeSchema();
	}

	/**
	 * Create database tables if they don't exist.
	 */
	private initializeSchema(): void {
		if (!this.db) return;

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS knowledge_entries (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				title TEXT NOT NULL,
				content TEXT NOT NULL,
				keywords TEXT NOT NULL,
				related_proposals TEXT,
				source_proposal_id TEXT,
				author TEXT NOT NULL,
				confidence INTEGER DEFAULT 50,
				helpful_count INTEGER DEFAULT 0,
				reference_count INTEGER DEFAULT 0,
				tags TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				metadata TEXT
			);

			CREATE TABLE IF NOT EXISTS extracted_patterns (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT NOT NULL,
				code_example TEXT,
				first_seen_at TEXT NOT NULL,
				usage_count INTEGER DEFAULT 0,
				success_rate INTEGER DEFAULT 0,
				related_entries TEXT
			);

			-- FTS5 virtual table for full-text search
			CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
				title,
				content,
				keywords,
				tags,
				content=knowledge_entries,
				content_rowid=rowid
			);

			-- Triggers to keep FTS in sync
			CREATE TRIGGER IF NOT EXISTS knowledge_entries_ai AFTER INSERT ON knowledge_entries BEGIN
				INSERT INTO knowledge_fts(rowid, title, content, keywords, tags)
				VALUES (new.rowid, new.title, new.content, new.keywords, new.tags);
			END;

			CREATE TRIGGER IF NOT EXISTS knowledge_entries_ad AFTER DELETE ON knowledge_entries BEGIN
				INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, keywords, tags)
				VALUES ('delete', old.rowid, old.title, old.content, old.keywords, old.tags);
			END;

			CREATE TRIGGER IF NOT EXISTS knowledge_entries_au AFTER UPDATE ON knowledge_entries BEGIN
				INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, keywords, tags)
				VALUES ('delete', old.rowid, old.title, old.content, old.keywords, old.tags);
				INSERT INTO knowledge_fts(rowid, title, content, keywords, tags)
				VALUES (new.rowid, new.title, new.content, new.keywords, new.tags);
			END;

			CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_entries(type);
			CREATE INDEX IF NOT EXISTS idx_knowledge_author ON knowledge_entries(author);
			CREATE INDEX IF NOT EXISTS idx_knowledge_confidence ON knowledge_entries(confidence);
			CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_entries(source_proposal_id);
		`);
	}

	/**
	 * Generate a unique entry ID.
	 */
	private generateId(): string {
		const timestamp = Date.now().toString(36);
		const random = Math.random().toString(36).substring(2, 8);
		return `KB-${timestamp}-${random}`;
	}

	/**
	 * AC#1: Add a knowledge entry (solution, pattern, decision, etc.)
	 */
	addEntry(entry: Omit<KnowledgeEntry, "id" | "createdAt" | "updatedAt" | "helpfulCount" | "referenceCount">): KnowledgeEntry {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		const now = new Date().toISOString();
		const id = this.generateId();

		const fullEntry: KnowledgeEntry = {
			...entry,
			id,
			createdAt: now,
			updatedAt: now,
			helpfulCount: 0,
			referenceCount: 0,
		};

		this.db.prepare(`
			INSERT INTO knowledge_entries (id, type, title, content, keywords, related_proposals, source_proposal_id, author, confidence, helpful_count, reference_count, tags, created_at, updated_at, metadata)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			fullEntry.id,
			fullEntry.type,
			fullEntry.title,
			fullEntry.content,
			JSON.stringify(fullEntry.keywords),
			JSON.stringify(fullEntry.relatedProposals),
			fullEntry.sourceProposalId || null,
			fullEntry.author,
			fullEntry.confidence,
			fullEntry.helpfulCount,
			fullEntry.referenceCount,
			JSON.stringify(fullEntry.tags),
			fullEntry.createdAt,
			fullEntry.updatedAt,
			fullEntry.metadata ? JSON.stringify(fullEntry.metadata) : null,
		);

		return fullEntry;
	}

	/**
	 * AC#1: Search knowledge base by keywords.
	 * Uses FTS5 for efficient full-text search.
	 */
	search(query: KnowledgeSearchQuery): KnowledgeSearchResult[] {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		const searchTerms = query.keywords.map(k => `"${k}"`).join(" OR ");

		let sql = `
			SELECT e.*, rank
			FROM knowledge_fts fts
			JOIN knowledge_entries e ON e.rowid = fts.rowid
			WHERE knowledge_fts MATCH ?
		`;
		const params: any[] = [searchTerms];

		// Add filters
		if (query.type) {
			sql += ` AND e.type = ?`;
			params.push(query.type);
		}

		if (query.minConfidence !== undefined) {
			sql += ` AND e.confidence >= ?`;
			params.push(query.minConfidence);
		}

		if (query.relatedProposal) {
			sql += ` AND e.related_proposals LIKE ?`;
			params.push(`%${query.relatedProposal}%`);
		}

		sql += ` ORDER BY rank DESC, e.confidence DESC, e.helpful_count DESC`;

		if (query.limit) {
			sql += ` LIMIT ?`;
			params.push(query.limit);
		} else {
			sql += ` LIMIT 20`;
		}

		const rows = this.db.prepare(sql).all(...params) as any[];

		return rows.map((row) => {
			const entry = this.hydrateEntry(row);
			const matchedKeywords = query.keywords.filter(k =>
				entry.keywords.some(ek => ek.toLowerCase().includes(k.toLowerCase())) ||
				entry.title.toLowerCase().includes(k.toLowerCase()) ||
				entry.content.toLowerCase().includes(k.toLowerCase())
			);

			// Calculate relevance based on FTS rank and keyword matches
			const relevanceScore = Math.min(100, Math.max(0,
				50 + (row.rank * -10) + (matchedKeywords.length * 10) + (entry.confidence / 5)
			));

			return {
				entry,
				relevanceScore,
				matchedKeywords,
			};
		});
	}

	/**
	 * AC#2: Extract and store a pattern from successful solutions.
	 */
	extractPattern(pattern: Omit<ExtractedPattern, "id" | "usageCount" | "successRate">): ExtractedPattern {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		const id = `PAT-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

		const fullPattern: ExtractedPattern = {
			...pattern,
			id,
			usageCount: 0,
			successRate: 0,
		};

		this.db.prepare(`
			INSERT INTO extracted_patterns (id, name, description, code_example, first_seen_at, usage_count, success_rate, related_entries)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			fullPattern.id,
			fullPattern.name,
			fullPattern.description,
			fullPattern.codeExample || null,
			fullPattern.firstSeenAt,
			fullPattern.usageCount,
			fullPattern.successRate,
			JSON.stringify(fullPattern.relatedEntries),
		);

		return fullPattern;
	}

	/**
	 * AC#2: Get all extracted patterns.
	 */
	getPatterns(options?: { minUsageCount?: number; minSuccessRate?: number }): ExtractedPattern[] {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		let sql = `SELECT * FROM extracted_patterns WHERE 1=1`;
		const params: any[] = [];

		if (options?.minUsageCount !== undefined) {
			sql += ` AND usage_count >= ?`;
			params.push(options.minUsageCount);
		}

		if (options?.minSuccessRate !== undefined) {
			sql += ` AND success_rate >= ?`;
			params.push(options.minSuccessRate);
		}

		sql += ` ORDER BY usage_count DESC, success_rate DESC`;

		const rows = this.db.prepare(sql).all(...params) as any[];
		return rows.map((row) => this.hydratePattern(row));
	}

	/**
	 * AC#3: Record a decision with rationale.
	 */
	recordDecision(decision: {
		title: string;
		content: string;
		rationale: string;
		alternatives: string[];
		author: string;
		relatedProposalId?: string;
		tags?: string[];
	}): KnowledgeEntry {
		return this.addEntry({
			type: "decision",
			title: decision.title,
			content: `## Rationale\n${decision.rationale}\n\n## Decision\n${decision.content}\n\n## Alternatives Considered\n${decision.alternatives.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
			keywords: [decision.title.toLowerCase(), ...decision.title.split(/\s+/).map(w => w.toLowerCase())],
			relatedProposals: decision.relatedProposalId ? [decision.relatedProposalId] : [],
			sourceProposalId: decision.relatedProposalId,
			author: decision.author,
			confidence: 80, // Decisions start with high confidence
			tags: ["decision", ...(decision.tags || [])],
		});
	}

	/**
	 * AC#3: Get all decisions.
	 */
	getDecisions(options?: { relatedProposal?: string }): KnowledgeEntry[] {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		let sql = `SELECT * FROM knowledge_entries WHERE type = 'decision'`;
		const params: any[] = [];

		if (options?.relatedProposal) {
			sql += ` AND related_proposals LIKE ?`;
			params.push(`%${options.relatedProposal}%`);
		}

		sql += ` ORDER BY created_at DESC`;

		const rows = this.db.prepare(sql).all(...params) as any[];
		return rows.map((row) => this.hydrateEntry(row));
	}

	/**
	 * Mark an entry as helpful (upvote).
	 */
	markHelpful(entryId: string): boolean {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		const result = this.db.prepare(`
			UPDATE knowledge_entries SET helpful_count = helpful_count + 1, updated_at = ?
			WHERE id = ?
		`).run(new Date().toISOString(), entryId);

		return result.changes > 0;
	}

	/**
	 * Increment reference count when entry is used.
	 */
	incrementReference(entryId: string): boolean {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		const result = this.db.prepare(`
			UPDATE knowledge_entries SET reference_count = reference_count + 1, updated_at = ?
			WHERE id = ?
		`).run(new Date().toISOString(), entryId);

		return result.changes > 0;
	}

	/**
	 * Update pattern usage stats.
	 */
	updatePatternUsage(patternId: string, successful: boolean): void {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		const pattern = this.db.prepare("SELECT * FROM extracted_patterns WHERE id = ?").get(patternId) as any;
		if (!pattern) return;

		const newUsageCount = pattern.usage_count + 1;
		const currentSuccessTotal = pattern.success_rate * pattern.usage_count / 100;
		const newSuccessTotal = currentSuccessTotal + (successful ? 1 : 0);
		const newSuccessRate = Math.round((newSuccessTotal / newUsageCount) * 100);

		this.db.prepare(`
			UPDATE extracted_patterns SET usage_count = ?, success_rate = ?
			WHERE id = ?
		`).run(newUsageCount, newSuccessRate, patternId);
	}

	/**
	 * Get an entry by ID.
	 */
	getEntry(entryId: string): KnowledgeEntry | null {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		const row = this.db.prepare("SELECT * FROM knowledge_entries WHERE id = ?").get(entryId) as any;
		return row ? this.hydrateEntry(row) : null;
	}

	/**
	 * Get entries by source proposal.
	 */
	getEntriesByProposal(proposalId: string): KnowledgeEntry[] {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		const rows = this.db.prepare(
			"SELECT * FROM knowledge_entries WHERE source_proposal_id = ? OR related_proposals LIKE ? ORDER BY created_at DESC"
		).all(proposalId, `%${proposalId}%`) as any[];

		return rows.map((row) => this.hydrateEntry(row));
	}

	/**
	 * Get statistics about the knowledge base.
	 */
	getStats(): {
		totalEntries: number;
		entriesByType: Record<KnowledgeEntryType, number>;
		totalPatterns: number;
		averageConfidence: number;
		topContributors: Array<{ author: string; count: number }>;
		mostHelpful: Array<{ id: string; title: string; helpfulCount: number }>;
	} {
		this.ensureInitialized();
		if (!this.db) throw new Error("Database not initialized");

		const totalCount = (this.db.prepare("SELECT COUNT(*) as c FROM knowledge_entries").get() as any).c;
		const patternCount = (this.db.prepare("SELECT COUNT(*) as c FROM extracted_patterns").get() as any).c;
		const avgConfidence = (this.db.prepare("SELECT AVG(confidence) as avg FROM knowledge_entries").get() as any).avg || 0;

		// Entries by type
		const typeRows = this.db.prepare("SELECT type, COUNT(*) as count FROM knowledge_entries GROUP BY type").all() as any[];
		const entriesByType: Record<string, number> = {};
		for (const row of typeRows) {
			entriesByType[row.type] = row.count;
		}

		// Top contributors
		const contributorRows = this.db.prepare(
			"SELECT author, COUNT(*) as count FROM knowledge_entries GROUP BY author ORDER BY count DESC LIMIT 5"
		).all() as any[];

		// Most helpful entries
		const helpfulRows = this.db.prepare(
			"SELECT id, title, helpful_count FROM knowledge_entries ORDER BY helpful_count DESC LIMIT 5"
		).all() as any[];

		return {
			totalEntries: totalCount,
			entriesByType: entriesByType as Record<KnowledgeEntryType, number>,
			totalPatterns: patternCount,
			averageConfidence: Math.round(avgConfidence),
			topContributors: contributorRows.map((r) => ({ author: r.author, count: r.count })),
			mostHelpful: helpfulRows.map((r) => ({ id: r.id, title: r.title, helpfulCount: r.helpful_count })),
		};
	}

	/**
	 * Hydrate a database row into a KnowledgeEntry.
	 */
	private hydrateEntry(row: any): KnowledgeEntry {
		return {
			id: row.id,
			type: row.type as KnowledgeEntryType,
			title: row.title,
			content: row.content,
			keywords: JSON.parse(row.keywords || "[]"),
			relatedProposals: JSON.parse(row.related_proposals || "[]"),
			sourceProposalId: row.source_proposal_id || undefined,
			author: row.author,
			confidence: row.confidence,
			helpfulCount: row.helpful_count,
			referenceCount: row.reference_count,
			tags: JSON.parse(row.tags || "[]"),
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
		};
	}

	/**
	 * Hydrate a database row into an ExtractedPattern.
	 */
	private hydratePattern(row: any): ExtractedPattern {
		return {
			id: row.id,
			name: row.name,
			description: row.description,
			codeExample: row.code_example || undefined,
			firstSeenAt: row.first_seen_at,
			usageCount: row.usage_count,
			successRate: row.success_rate,
			relatedEntries: JSON.parse(row.related_entries || "[]"),
		};
	}

	/**
	 * Close the database connection.
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}

/**
 * Create a knowledge base for a project.
 */
export function createKnowledgeBase(projectRoot: string): KnowledgeBase {
	return new KnowledgeBase(projectRoot);
}
