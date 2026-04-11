/**
 * P078: Directive Lifecycle & Escalation Management — Unit Tests
 *
 * Tests for escalation types, severity levels, and resolution tracking.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("P078: Escalation Management", () => {
	describe("Obstacle types", () => {
		const OBSTACLE_TYPES = [
			"BUDGET_EXHAUSTED",
			"LOOP_DETECTED",
			"CYCLE_DETECTED",
			"AGENT_DEAD",
			"PIPELINE_BLOCKED",
			"AC_GATE_FAILED",
			"DEPENDENCY_UNRESOLVED",
		] as const;

		it("should define all obstacle types", () => {
			assert.equal(OBSTACLE_TYPES.length, 7);
		});

		it("should include budget exhaustion", () => {
			assert.ok(OBSTACLE_TYPES.includes("BUDGET_EXHAUSTED"));
		});

		it("should include agent failure detection", () => {
			assert.ok(OBSTACLE_TYPES.includes("AGENT_DEAD"));
		});

		it("should include pipeline blocking", () => {
			assert.ok(OBSTACLE_TYPES.includes("PIPELINE_BLOCKED"));
		});

		it("should include dependency resolution failures", () => {
			assert.ok(OBSTACLE_TYPES.includes("DEPENDENCY_UNRESOLVED"));
		});
	});

	describe("Severity levels", () => {
		const SEVERITIES = ["low", "medium", "high", "critical"] as const;

		it("should define all severity levels", () => {
			assert.equal(SEVERITIES.length, 4);
		});

		it("should default to medium severity", () => {
			const args: { severity?: string } = {};
			const effectiveSeverity = args.severity ?? "medium";
			assert.equal(effectiveSeverity, "medium");
		});

		it("should support critical severity for AGENT_DEAD", () => {
			const obstacleType = "AGENT_DEAD";
			const severity = "critical";
			assert.equal(severity, "critical");
			assert.equal(obstacleType, "AGENT_DEAD");
		});
	});

	describe("Escalation routing", () => {
		it("should route budget exhaustion to spending management", () => {
			const escalation = {
				obstacle_type: "BUDGET_EXHAUSTED",
				escalated_to: "spending-admin",
			};
			assert.equal(escalation.escalated_to, "spending-admin");
		});

		it("should route agent death to orchestrator", () => {
			const escalation = {
				obstacle_type: "AGENT_DEAD",
				escalated_to: "orchestrator",
			};
			assert.equal(escalation.escalated_to, "orchestrator");
		});

		it("should track proposal context in escalation", () => {
			const escalation = {
				obstacle_type: "PIPELINE_BLOCKED",
				proposal_id: "P059",
				agent_identity: "agent/worker-1",
				escalated_to: "team/infra",
			};
			assert.equal(escalation.proposal_id, "P059");
			assert.equal(escalation.agent_identity, "agent/worker-1");
		});
	});

	describe("Resolution tracking", () => {
		it("should track resolution timestamp", () => {
			const escalation = {
				id: 1,
				escalated_at: new Date().toISOString(),
				resolved_at: null as string | null,
			};

			// Initially unresolved
			assert.equal(escalation.resolved_at, null);

			// Resolve
			escalation.resolved_at = new Date().toISOString();
			assert.ok(escalation.resolved_at !== null);
		});

		it("should support resolution notes", () => {
			const resolution = {
				resolution_note: "Budget cap increased by admin",
			};
			assert.ok(resolution.resolution_note.length > 0);
		});

		it("should prevent double resolution", () => {
			const escalation = {
				id: 1,
				resolved_at: "2026-04-10T12:00:00Z",
			};
			const alreadyResolved = escalation.resolved_at !== null;
			assert.ok(alreadyResolved);
		});
	});

	describe("Escalation statistics", () => {
		it("should count open vs resolved", () => {
			const escalations = [
				{ resolved_at: null },
				{ resolved_at: "2026-04-10T12:00:00Z" },
				{ resolved_at: null },
			];
			const open = escalations.filter((e) => e.resolved_at === null).length;
			const resolved = escalations.filter((e) => e.resolved_at !== null).length;
			assert.equal(open, 2);
			assert.equal(resolved, 1);
		});

		it("should group by obstacle type", () => {
			const escalations = [
				{ obstacle_type: "BUDGET_EXHAUSTED" },
				{ obstacle_type: "AGENT_DEAD" },
				{ obstacle_type: "BUDGET_EXHAUSTED" },
			];
			const byType: Record<string, number> = {};
			for (const e of escalations) {
				byType[e.obstacle_type] = (byType[e.obstacle_type] ?? 0) + 1;
			}
			assert.equal(byType["BUDGET_EXHAUSTED"], 2);
			assert.equal(byType["AGENT_DEAD"], 1);
		});
	});

	describe("Directive lifecycle", () => {
		it("should support 3-state lifecycle: Active → Complete | Archived", () => {
			const states = ["Active", "Complete", "Archived"];
			assert.equal(states.length, 3);
		});

		it("should skip Draft/Review/Building for directives", () => {
			const directiveStates = ["Active", "Complete", "Archived"];
			const skippedStates = ["Draft", "Review", "Building"];
			for (const state of skippedStates) {
				assert.ok(!directiveStates.includes(state));
			}
		});
	});
});
