/**
 * Happy-path test for `hive dispatch list`
 */

import { test } from "node:test";
import assert from "node:assert";
import { handleDispatchList } from "../handlers/list";

test("dispatch list - happy path", async () => {
  // Verifies that handleDispatchList:
  // 1. Is a function with the expected signature.
  // 2. Returns a Promise that resolves to an object with `dispatches` and
  //    `next_cursor` keys (pagination envelope).
  // The DB query is executed against the live pool; this is a smoke test
  // that the handler talks to the right schema/columns and rejects on
  // shape errors.
  assert.equal(typeof handleDispatchList, "function");

  const result = await handleDispatchList({ limit: "1" });
  assert.equal(typeof result, "object");
  assert.ok(Array.isArray(result.dispatches), "dispatches must be an array");
  assert.ok(
    result.next_cursor === null || typeof result.next_cursor === "string",
    "next_cursor must be string or null"
  );
});
