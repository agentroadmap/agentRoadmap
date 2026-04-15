/**
 * Debug logging utility that writes to a file.
 *
 * When blessed takes over the terminal (alternate buffer mode), console.error
 * output is invisible because it goes through the blessed screen. This module
 * writes debug output to a file so it's always accessible.
 *
 * Usage: Set DEBUG=1 environment variable to enable logging.
 * Output goes to /tmp/roadmap-debug.log (or ROADMAP_DEBUG_LOG env var).
 */

import { appendFileSync } from "node:fs";

let _logPath: string | undefined;

function getLogPath(): string {
	if (!_logPath) {
		_logPath = process.env.ROADMAP_DEBUG_LOG || "/tmp/roadmap-debug.log";
	}
	return _logPath;
}

/**
 * Write a debug message to the log file. No-op unless DEBUG env var is set.
 */
export function debugLog(message: string): void {
	if (!process.env.DEBUG) return;
	const timestamp = new Date().toISOString();
	const line = `[${timestamp}] ${message}\n`;
	try {
		appendFileSync(getLogPath(), line);
	} catch {
		// If file writing fails, fall back to stderr
		process.stderr.write(line);
	}
}
