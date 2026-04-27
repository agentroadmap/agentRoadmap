/**
 * Test suite for workflow domain commands.
 *
 * Tests happy-path functionality and envelope shape.
 * Uses Node's built-in test runner (no external framework).
 *
 * Run with: `node --import jiti/register --test src/apps/hive-cli/domains/workflow/workflow.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleList } from "./handlers/list";
import { handleShow } from "./handlers/show";
import { handleGates } from "./handlers/gates";
import { handleNextState } from "./handlers/next-state";
import { handleHistory } from "./handlers/history";
import { HiveError } from "../../common/error";

// ============================================================================
// TEST SUITE
// ============================================================================

test("Workflow domain: list command", async (t) => {
  await t.test("returns workflows array", async () => {
    const result = await handleList(1, {});

    assert(result && typeof result === "object");
    assert("workflows" in result);
    assert(Array.isArray(result.workflows));
  });

  await t.test("includes pagination cursor", async () => {
    const result = await handleList(1, {
      limit: 20,
    });

    assert(result && typeof result === "object");
    assert("next_cursor" in result);
  });
});

test("Workflow domain: show command", async (t) => {
  await t.test("returns workflow object with state definitions", async () => {
    const result = await handleShow(1, "proposal-v3", {});

    assert(result && typeof result === "object");
    assert("workflow" in result);
    assert("states" in result);
    assert("transitions" in result);
  });

  await t.test("throws usage error for missing workflow_id", async () => {
    try {
      await handleShow(1, "", {});
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof HiveError);
      assert.equal(err.code, "USAGE");
    }
  });

  await t.test("accepts --include relations", async () => {
    const result = await handleShow(1, "proposal-v3", {
      include: ["gates", "transitions"],
    });

    assert(result && typeof result === "object");
    assert("workflow" in result);
  });
});

test("Workflow domain: gates command", async (t) => {
  await t.test("returns gates array for workflow", async () => {
    const result = await handleGates(1, "proposal-v3", {});

    assert(result && typeof result === "object");
    assert("gates" in result);
    assert(Array.isArray(result.gates));
  });

  await t.test("throws usage error for missing workflow_id", async () => {
    try {
      await handleGates(1, "", {});
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof HiveError);
      assert.equal(err.code, "USAGE");
    }
  });

  await t.test("filters gates by --state if provided", async () => {
    const result = await handleGates(1, "proposal-v3", {
      state: "review",
    });

    assert(result && typeof result === "object");
    assert("gates" in result);
  });
});

test("Workflow domain: next-state command", async (t) => {
  await t.test("returns allowed next states for current state", async () => {
    const result = await handleNextState(1, "proposal-v3", "draft");

    assert(result && typeof result === "object");
    assert("current_state" in result);
    assert("allowed_next_states" in result);
    assert(Array.isArray(result.allowed_next_states));
  });

  await t.test("throws usage error for missing workflow_id", async () => {
    try {
      await handleNextState(1, "", "draft");
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof HiveError);
      assert.equal(err.code, "USAGE");
    }
  });

  await t.test("throws usage error for missing current_state", async () => {
    try {
      await handleNextState(1, "proposal-v3", "");
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof HiveError);
      assert.equal(err.code, "USAGE");
    }
  });
});

test("Workflow domain: history command", async (t) => {
  await t.test("returns state transition entries for proposal", async () => {
    const result = await handleHistory(1, "P123", {});

    assert(result && typeof result === "object");
    assert("proposal_id" in result);
    assert("entries" in result);
    assert(Array.isArray(result.entries));
  });

  await t.test("throws usage error for missing proposal_id", async () => {
    try {
      await handleHistory(1, "", {});
      assert.fail("should have thrown");
    } catch (err) {
      assert(err instanceof HiveError);
      assert.equal(err.code, "USAGE");
    }
  });

  await t.test("respects --limit parameter", async () => {
    const result = await handleHistory(1, "P123", {
      limit: 10,
    });

    assert(result && typeof result === "object");
    assert("entries" in result);
  });
});

test("Workflow domain: envelope shape validation", async (t) => {
  await t.test("list response has workflows array", async () => {
    const result = await handleList(1, {});

    assert(result && typeof result === "object");
    assert(Array.isArray(result.workflows));
  });

  await t.test("show response has workflow object and arrays", async () => {
    const result = await handleShow(1, "proposal-v3", {});

    assert(result && typeof result === "object");
    assert(result.workflow && typeof result.workflow === "object");
    assert(Array.isArray(result.states));
    assert(Array.isArray(result.transitions));
    assert(Array.isArray(result.gates));
  });

  await t.test("history response has proposal_id and entries", async () => {
    const result = await handleHistory(1, "P123", {});

    assert(result && typeof result === "object");
    assert(typeof result.proposal_id === "string");
    assert(Array.isArray(result.entries));
  });
});
