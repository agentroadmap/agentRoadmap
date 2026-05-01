/**
 * Unit tests for extractArgs (mcp-server consolidated router helper).
 *
 * Covers: object form, JSON-string form, empty string, malformed JSON,
 * array (rejected), null, missing args, and mixed rest+args spread.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractArgs } from "../../src/apps/mcp-server/tools/consolidated";

// Helper type — lets us pass structurally-invalid values for negative tests
type AnyInput = Parameters<typeof extractArgs>[0];

describe("extractArgs", () => {
	// ------------------------------------------------------------------
	// Happy-path: object form
	// ------------------------------------------------------------------
	test("object form — returns merged args object", () => {
		const result = extractArgs({ action: "do_thing", args: { key: "value", num: 42 } });
		assert.deepEqual(result, { key: "value", num: 42 });
	});

	test("object form — action is stripped from output", () => {
		const result = extractArgs({ action: "foo", args: { a: 1 } });
		assert.equal("action" in result, false);
		assert.equal("args" in result, false);
	});

	// ------------------------------------------------------------------
	// Happy-path: JSON-string form
	// ------------------------------------------------------------------
	test("JSON-string form — parses and returns object", () => {
		const result = extractArgs({ action: "bar", args: '{"x":10,"y":"hello"}' });
		assert.deepEqual(result, { x: 10, y: "hello" });
	});

	test("JSON-string form — action stripped, args key absent", () => {
		const result = extractArgs({ action: "bar", args: '{"x":1}' });
		assert.equal("action" in result, false);
		assert.equal("args" in result, false);
	});

	// ------------------------------------------------------------------
	// Empty string — treated as absent, returns rest only
	// ------------------------------------------------------------------
	test("empty string args — returns rest only (empty object when no rest)", () => {
		const result = extractArgs({ action: "foo", args: "" });
		assert.deepEqual(result, {});
	});

	test("whitespace-only string args — returns rest only", () => {
		const result = extractArgs({ action: "foo", args: "   " });
		assert.deepEqual(result, {});
	});

	// ------------------------------------------------------------------
	// Malformed JSON — fallback to rest only
	// ------------------------------------------------------------------
	test("malformed JSON string — returns rest only without throwing", () => {
		const result = extractArgs({ action: "foo", args: "{bad json" });
		assert.deepEqual(result, {});
	});

	test("JSON number string — not an object, returns rest only", () => {
		const result = extractArgs({ action: "foo", args: "42" });
		assert.deepEqual(result, {});
	});

	test("JSON array string — rejected, returns rest only", () => {
		const result = extractArgs({ action: "foo", args: "[1,2,3]" });
		assert.deepEqual(result, {});
	});

	// ------------------------------------------------------------------
	// Array value — rejected (not an object), returns rest only
	// ------------------------------------------------------------------
	test("array args value — rejected, returns rest only", () => {
		// Type assertion required to test runtime guarding of non-TS callers
		const result = extractArgs({ action: "foo", args: [1, 2, 3] } as unknown as AnyInput);
		assert.deepEqual(result, {});
	});

	// ------------------------------------------------------------------
	// Null / undefined — returns rest only
	// ------------------------------------------------------------------
	test("null args — returns rest only", () => {
		const result = extractArgs({ action: "foo", args: null as unknown as AnyInput["args"] });
		assert.deepEqual(result, {});
	});

	test("undefined args (missing key) — returns rest only", () => {
		const result = extractArgs({ action: "foo" });
		assert.deepEqual(result, {});
	});

	// ------------------------------------------------------------------
	// Missing args entirely
	// ------------------------------------------------------------------
	test("no args key at all — returns empty object", () => {
		const result = extractArgs({ action: "missing_args" });
		assert.deepEqual(result, {});
	});

	// ------------------------------------------------------------------
	// Mixed: rest properties AND args object
	// ------------------------------------------------------------------
	test("mixed rest+args — args fields merged with extra rest props", () => {
		const result = extractArgs({
			action: "combined",
			args: { from_args: true },
			extra_rest: "hello",
			count: 3,
		});
		assert.deepEqual(result, { from_args: true, extra_rest: "hello", count: 3 });
	});

	test("args fields override rest fields with same key", () => {
		// Both rest and args have 'shared' — args wins (spread order: rest first, argsObj second)
		const result = extractArgs({
			action: "override",
			shared: "from_rest",
			args: { shared: "from_args" },
		});
		assert.equal(result["shared"], "from_args");
	});

	test("mixed rest+args JSON-string form — rest props preserved", () => {
		const result = extractArgs({
			action: "json_rest",
			args: '{"parsed":1}',
			rest_prop: "stays",
		});
		assert.deepEqual(result, { parsed: 1, rest_prop: "stays" });
	});
});
