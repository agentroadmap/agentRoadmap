import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	describeProposalEvent,
	formatLocalActivityTimestamp,
} from "../../src/apps/dashboard-web/lib/proposal-activity.ts";

describe("proposal activity formatting", () => {
	it("formats timestamps through the browser locale formatter", () => {
		const value = "2026-05-01T16:15:33.000Z";
		const expected = new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(value));

		assert.equal(formatLocalActivityTimestamp(value), expected);
	});

	it("describes known proposal_event types and falls back to readable text", () => {
		assert.equal(describeProposalEvent("review_submitted"), "review submitted");
		assert.equal(describeProposalEvent("custom_event"), "custom event");
		assert.equal(describeProposalEvent(undefined), "");
	});
});
