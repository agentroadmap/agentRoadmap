// Type declarations for node:sqlite (Node.js 24+)
// Provides minimal type stubs so TypeScript can compile on Node 22

declare module "node:sqlite" {
	export class DatabaseSync {
		constructor(path: string, options?: { readOnly?: boolean });
		exec(sql: string): void;
		prepare(sql: string): StatementSync;
		close(): void;
		readonly inTransaction: boolean;
	}

	export class StatementSync {
		all(...params: unknown[]): unknown[];
		get(...params: unknown[]): unknown | undefined;
		run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
		bind(...params: unknown[]): void;
		finalize(): void;
	}
}
