import assert from "node:assert";
import { describe, test } from "node:test";
import { expect } from "./test-utils.ts";
import { formatStatusWithIcon, getStatusColor, getStatusIcon, getStatusStyle } from "../ui/status-icon.ts";

describe("Status Icon Component", () => {
	describe("getStatusStyle", () => {
		test("returns correct style for Complete status", () => {
			const style = getStatusStyle("Complete");
			assert.strictEqual(style.icon, "✔");
			assert.strictEqual(style.color, "green");
		});

		test("returns correct style for Active status", () => {
			const style = getStatusStyle("Active");
			assert.strictEqual(style.icon, "◒");
			assert.strictEqual(style.color, "yellow");
		});

		test("returns correct style for Blocked status", () => {
			const style = getStatusStyle("Blocked");
			assert.strictEqual(style.icon, "●");
			assert.strictEqual(style.color, "red");
		});

		test("returns correct style for Potential status", () => {
			const style = getStatusStyle("Potential");
			assert.strictEqual(style.icon, "○");
			assert.strictEqual(style.color, "white");
		});

		test("returns correct style for Review status", () => {
			const style = getStatusStyle("Review");
			assert.strictEqual(style.icon, "◆");
			assert.strictEqual(style.color, "blue");
		});

		test("returns correct style for Testing status", () => {
			const style = getStatusStyle("Testing");
			assert.strictEqual(style.icon, "▣");
			assert.strictEqual(style.color, "cyan");
		});

		test("returns default style for unknown status", () => {
			const style = getStatusStyle("Unknown Status");
			assert.strictEqual(style.icon, "○");
			assert.strictEqual(style.color, "white");
		});
	});

	describe("getStatusColor", () => {
		test("returns correct color for each status", () => {
			expect(getStatusColor("Complete")).toBe("green");
			expect(getStatusColor("Active")).toBe("yellow");
			expect(getStatusColor("Blocked")).toBe("red");
			expect(getStatusColor("Potential")).toBe("white");
			expect(getStatusColor("Review")).toBe("blue");
			expect(getStatusColor("Testing")).toBe("cyan");
		});

		test("returns default color for unknown status", () => {
			expect(getStatusColor("Unknown")).toBe("white");
		});
	});

	describe("getStatusIcon", () => {
		test("returns correct icon for each status", () => {
			expect(getStatusIcon("Complete")).toBe("✔");
			expect(getStatusIcon("Active")).toBe("◒");
			expect(getStatusIcon("Blocked")).toBe("●");
			expect(getStatusIcon("Potential")).toBe("○");
			expect(getStatusIcon("Review")).toBe("◆");
			expect(getStatusIcon("Testing")).toBe("▣");
		});

		test("returns default icon for unknown status", () => {
			expect(getStatusIcon("Unknown")).toBe("○");
		});
	});

	describe("formatStatusWithIcon", () => {
		test("formats status with correct icon", () => {
			expect(formatStatusWithIcon("Complete")).toBe("✔ Complete");
			expect(formatStatusWithIcon("Active")).toBe("◒ Active");
			expect(formatStatusWithIcon("Blocked")).toBe("● Blocked");
			expect(formatStatusWithIcon("Potential")).toBe("○ Potential");
			expect(formatStatusWithIcon("Review")).toBe("◆ Review");
			expect(formatStatusWithIcon("Testing")).toBe("▣ Testing");
		});

		test("formats unknown status with default icon", () => {
			expect(formatStatusWithIcon("Custom Status")).toBe("○ Custom Status");
		});
	});
});
