import { describe, it } from "node:test";
import { generateDetailContent } from "../../src/ui/proposal-viewer-with-search.ts";
import type { Proposal } from "../../src/types/index.ts";
import { expect } from "../support/test-utils.ts";

describe("proposal viewer formatting", () => {
	it("uses a shared maturity theme and colorful section headings", () => {
		const proposal: Proposal = {
			id: "P001",
			title: "Colorful Details",
			status: "Review",
			maturity: "mature",
			assignee: [],
			createdDate: "2025-01-01",
			labels: [],
			dependencies: [],
			description: "Body\n\n```sql\nSELECT 1;\n```",
			implementationPlan: "Plan",
			activityLog: [
				{
					timestamp: "2025-01-01 09:00",
					actor: "codex",
					action: "state Draft → Review",
					reason: "ready for gating",
				},
				{
					timestamp: "2025-01-01 09:05",
					actor: "codex",
					action: "maturity new → mature",
				},
			],
		};

		const { headerContent, bodyContent } = generateDetailContent(proposal);
		const body = bodyContent.join("\n");

		expect(headerContent[0]).toContain("{green-fg}");
		expect(headerContent[0]).toContain("P001 - Colorful Details");
		expect(body).toContain("{cyan-fg}▍ Details");
		expect(body).toContain("{bold}Current:{/bold}");
		expect(body).toContain("{blink}");
		expect(body).toContain("{green-fg}▍ Description");
		expect(body).toContain("{cyan-fg}▍ Implementation Plan");
		expect(body).toContain("{blue-fg}▍ Activity Thread");
		expect(body).toContain("state Draft → Review");
		expect(body).toContain("maturity new → mature");
		expect(body).toContain("┌─ sql ─");
		expect(body).toContain("{cyan-fg}│{/} SELECT 1;");
	});
});
