// Ambient type declarations for node:sqlite (Node.js 24+)
// Makes DatabaseSync available globally for files that use it as a type without importing
// This avoids adding `import { DatabaseSync } from "node:sqlite"` to every file

import type { DatabaseSync as _DatabaseSync } from "node:sqlite";

declare global {
	type DatabaseSync = _DatabaseSync;
	var DatabaseSync: typeof _DatabaseSync;
}
