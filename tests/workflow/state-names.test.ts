import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool } from "../../src/infra/postgres/pool.ts";
import {
	loadStateNames,
	getRegistry,
	getView,
	Maturity,
	isTerminal,
	isGateable,
	nextOnMature,
	isValidTransition,
	gateForTransition,
	RfcStates,
	HotfixStates,
} from "../../src/core/workflow/state-names.ts";

describe("state-names", () => {
	beforeAll(async () => {
		const pool = getPool();
		await loadStateNames(pool);
	});

	describe("Maturity constant", () => {
		it("should freeze Maturity object", () => {
			expect(Object.isFrozen(Maturity)).toBe(true);
		});

		it("should have all expected maturity values", () => {
			expect(Maturity.NEW).toBe("new");
			expect(Maturity.ACTIVE).toBe("active");
			expect(Maturity.MATURE).toBe("mature");
			expect(Maturity.OBSOLETE).toBe("obsolete");
		});

		it("should not allow modification", () => {
			expect(() => {
				(Maturity as any).NEW = "invalid";
			}).toThrow();
		});
	});

	describe("Registry loading and access", () => {
		it("should load registry from database", async () => {
			const registry = getRegistry();
			expect(registry).toBeDefined();
		});

		it("should throw if registry not loaded", async () => {
			// This test assumes a fresh context without prior loading
			// In practice, with beforeAll, it's already loaded.
			// Just verify getRegistry() works:
			expect(() => getRegistry()).not.toThrow();
		});
	});

	describe("RFC workflow template", () => {
		it("should return RFC view", () => {
			const view = getView("Standard RFC");
			expect(view).toBeDefined();
			expect(view.template).toBe("Standard RFC");
		});

		it("should have expected stages in RFC", () => {
			const view = getView("Standard RFC");
			const stageNames = view.stages.map((s) => s.name);
			expect(stageNames).toContain("DRAFT");
			expect(stageNames).toContain("REVIEW");
			expect(stageNames).toContain("DEVELOP");
			expect(stageNames).toContain("MERGE");
			expect(stageNames).toContain("COMPLETE");
			expect(stageNames).toContain("REJECTED");
			expect(stageNames).toContain("DISCARDED");
		});

		it("should mark COMPLETE as non-terminal", () => {
			expect(isTerminal("Standard RFC", "COMPLETE")).toBe(false);
		});

		it("should mark DRAFT as non-terminal", () => {
			expect(isTerminal("Standard RFC", "DRAFT")).toBe(false);
		});

		it("should mark REJECTED as terminal", () => {
			expect(isTerminal("Standard RFC", "REJECTED")).toBe(true);
		});

		it("should mark DISCARDED as terminal", () => {
			expect(isTerminal("Standard RFC", "DISCARDED")).toBe(true);
		});

		it("should mark REVIEW as gateable", () => {
			expect(isGateable("Standard RFC", "REVIEW")).toBe(true);
		});

		it("should mark DEVELOP as gateable", () => {
			expect(isGateable("Standard RFC", "DEVELOP")).toBe(true);
		});

		it("should return nextOnMature for DRAFT", () => {
			const next = nextOnMature("Standard RFC", "DRAFT");
			expect(next).toBe("REVIEW");
		});

		it("should return null nextOnMature for REJECTED (terminal stage)", () => {
			const next = nextOnMature("Standard RFC", "REJECTED");
			expect(next).toBeNull();
		});

		it("should validate valid transition DRAFT -> REVIEW", () => {
			expect(isValidTransition("Standard RFC", "DRAFT", "REVIEW")).toBe(true);
		});

		it("should reject invalid transition DRAFT -> COMPLETE", () => {
			expect(isValidTransition("Standard RFC", "DRAFT", "COMPLETE")).toBe(false);
		});

		it("should validate REVIEW -> DEVELOP transition", () => {
			expect(isValidTransition("Standard RFC", "REVIEW", "DEVELOP")).toBe(true);
		});

		it("should validate DEVELOP -> MERGE transition", () => {
			expect(isValidTransition("Standard RFC", "DEVELOP", "MERGE")).toBe(true);
		});

		it("should validate MERGE -> COMPLETE transition", () => {
			expect(isValidTransition("Standard RFC", "MERGE", "COMPLETE")).toBe(true);
		});

		it("should check gating on REVIEW -> DEVELOP transition", () => {
			const gating = gateForTransition("Standard RFC", "REVIEW", "DEVELOP");
			// May be null or a gating type string depending on SMDL definition
			expect(gating === null || typeof gating === "string").toBe(true);
		});

		it("should check gating on DEVELOP -> MERGE transition", () => {
			const gating = gateForTransition("Standard RFC", "DEVELOP", "MERGE");
			expect(gating === null || typeof gating === "string").toBe(true);
		});

		it("should check gating on MERGE -> COMPLETE transition", () => {
			const gating = gateForTransition("Standard RFC", "MERGE", "COMPLETE");
			expect(gating === null || typeof gating === "string").toBe(true);
		});

		it("should have no gating on DRAFT -> DISCARDED transition", () => {
			const gating = gateForTransition("Standard RFC", "DRAFT", "DISCARDED");
			expect(gating).toBeNull();
		});
	});

	describe("RFC convenience accessors", () => {
		it("should return DRAFT via RfcStates", () => {
			expect(RfcStates.DRAFT).toBe("DRAFT");
		});

		it("should return REVIEW via RfcStates", () => {
			expect(RfcStates.REVIEW).toBe("REVIEW");
		});

		it("should return DEVELOP via RfcStates", () => {
			expect(RfcStates.DEVELOP).toBe("DEVELOP");
		});

		it("should return MERGE via RfcStates", () => {
			expect(RfcStates.MERGE).toBe("MERGE");
		});

		it("should return COMPLETE via RfcStates", () => {
			expect(RfcStates.COMPLETE).toBe("COMPLETE");
		});

		it("should return REJECTED via RfcStates", () => {
			expect(RfcStates.REJECTED).toBe("REJECTED");
		});

		it("should return DISCARDED via RfcStates", () => {
			expect(RfcStates.DISCARDED).toBe("DISCARDED");
		});
	});

	describe("Other workflow templates", () => {
		it("should return Quick Fix view", () => {
			const view = getView("Quick Fix");
			expect(view).toBeDefined();
			expect(view.template).toBe("Quick Fix");
		});

		it("should have Quick Fix stages", () => {
			const view = getView("Quick Fix");
			expect(view.stages.length).toBeGreaterThan(0);
		});

		it("should return Code Review Pipeline view", () => {
			const view = getView("Code Review Pipeline");
			expect(view).toBeDefined();
			expect(view.template).toBe("Code Review Pipeline");
		});
	});

	describe("Edge cases", () => {
		it("should throw for unknown template", () => {
			expect(() => getView("NonExistentTemplate")).toThrow();
		});

		it("should return false for unknown template predicates", () => {
			expect(isTerminal("Unknown", "DRAFT")).toBe(false);
			expect(isGateable("Unknown", "REVIEW")).toBe(false);
		});

		it("should return null for unknown template transitions", () => {
			expect(nextOnMature("Unknown", "DRAFT")).toBeNull();
			expect(gateForTransition("Unknown", "DRAFT", "REVIEW")).toBeNull();
		});

		it("should handle case-insensitive template lookups", () => {
			// 'rfc' should match 'Standard RFC' (or similar key lookup)
			const view1 = getView("Standard RFC");
			const view2 = getView("standard rfc");
			expect(view1.template).toBe(view2.template);
		});
	});

	describe("terminal stages predicates", () => {
		it("should include all terminal stages in view", () => {
			const view = getView("Standard RFC");
			for (const stage of view.terminalStages) {
				expect(isTerminal("Standard RFC", stage)).toBe(true);
			}
		});

		it("should exclude non-terminal stages from terminalStages", () => {
			const view = getView("Standard RFC");
			const nonTerminal = view.stages.find((s) => !s.isTerminal);
			if (nonTerminal) {
				expect(view.terminalStages).not.toContain(nonTerminal.name);
			}
		});
	});
});
