import { describe, expect, it } from "bun:test";
import type { Directive, Proposal } from "../../types";
import { buildDirectiveBuckets, collectDirectiveIds, validateDirectiveName } from "./directives";

const makeProposal = (overrides: Partial<Proposal>): Proposal => ({
	id: "proposal-1",
	title: "Proposal",
	status: "Potential",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2024-01-01",
	...overrides,
});

describe("buildDirectiveBuckets", () => {
	const proposals = [
		makeProposal({ id: "proposal-1", directive: "M1", status: "Potential" }),
		makeProposal({ id: "proposal-2", directive: "M2", status: "Active" }),
		makeProposal({ id: "proposal-3", status: "Reached" }),
	];

	it("returns buckets for file directives, discovered directives, and no-directive", () => {
		const directives: Directive[] = [{ id: "M1", title: "M1", description: "", rawContent: "" }];
		const buckets = buildDirectiveBuckets(proposals, directives, ["Potential", "Active", "Accepted", "Complete", "Abandoned"]);
		const labels = buckets.map((b) => b.label);
		expect(labels).toEqual(["Proposals without directive", "M1", "M2"]);
	});

	it("calculates status counts per bucket", () => {
		const directives: Directive[] = [{ id: "M1", title: "M1", description: "", rawContent: "" }];
		const buckets = buildDirectiveBuckets(proposals, directives, ["Potential", "Active", "Accepted", "Complete", "Abandoned"]);
		const m1 = buckets.find((b) => b.label === "M1");
		const none = buckets.find((b) => b.isNoDirective);
		expect(m1?.statusCounts["Potential"]).toBe(1);
		expect(none?.statusCounts.Reached).toBe(1);
	});

	it("marks directives completed when all proposals are done", () => {
		const completedProposals = [
			makeProposal({ id: "proposal-1", directive: "M1", status: "Reached" }),
			makeProposal({ id: "proposal-2", directive: "M1", status: "Reached" }),
		];
		const directives: Directive[] = [{ id: "M1", title: "M1", description: "", rawContent: "" }];
		const buckets = buildDirectiveBuckets(completedProposals, directives, ["Potential", "Active", "Accepted", "Complete", "Abandoned"]);
		const m1 = buckets.find((b) => b.label === "M1");
		expect(m1?.isCompleted).toBe(true);
	});

	it("keeps active directives when archived titles are reused", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "m-2", status: "Potential" })];
		const directives: Directive[] = [
			{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
			{ id: "m-2", title: "Release 1", description: "", rawContent: "" },
		];
		const buckets = buildDirectiveBuckets(proposals, directives, ["Potential", "Reached"], {
			archivedDirectiveIds: ["m-1", "Release 1"],
		});
		const active = buckets.find((bucket) => bucket.directive === "m-2");
		expect(active?.label).toBe("Release 1");
	});

	it("canonicalizes reused archived titles to the active directive ID", () => {
		const proposals = [
			makeProposal({ id: "proposal-1", directive: "Release 1", status: "Potential" }),
			makeProposal({ id: "proposal-2", directive: "m-2", status: "Reached" }),
		];
		const directives: Directive[] = [{ id: "m-2", title: "Release 1", description: "", rawContent: "" }];
		const archivedDirectives: Directive[] = [{ id: "m-1", title: "Release 1", description: "", rawContent: "" }];

		const buckets = buildDirectiveBuckets(proposals, directives, ["Potential", "Reached"], {
			archivedDirectiveIds: ["m-1"],
			archivedDirectives,
		});
		const releaseBuckets = buckets.filter((bucket) => bucket.label === "Release 1");
		expect(releaseBuckets).toHaveLength(1);
		expect(releaseBuckets[0]?.directive).toBe("m-2");
		expect(releaseBuckets[0]?.proposals.map((proposal) => proposal.id)).toEqual(["proposal-1", "proposal-2"]);
	});

	it("canonicalizes numeric directive aliases to directive IDs", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "1", status: "Potential" })];
		const directives: Directive[] = [{ id: "m-1", title: "Release 1", description: "", rawContent: "" }];
		const buckets = buildDirectiveBuckets(proposals, directives, ["Potential", "Reached"]);
		const releaseBucket = buckets.find((bucket) => bucket.directive === "m-1");
		expect(releaseBucket?.proposals.map((proposal) => proposal.id)).toEqual(["proposal-1"]);
	});

	it("canonicalizes zero-padded directive ID aliases to canonical IDs", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "m-01", status: "Potential" })];
		const directives: Directive[] = [{ id: "m-1", title: "Release 1", description: "", rawContent: "" }];
		const buckets = buildDirectiveBuckets(proposals, directives, ["Potential", "Reached"]);
		const releaseBucket = buckets.find((bucket) => bucket.directive === "m-1");
		expect(releaseBucket?.proposals.map((proposal) => proposal.id)).toEqual(["proposal-1"]);
	});

	it("keeps active-title aliases when an archived directive ID shares the same key", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "m-0", status: "Potential" })];
		const directives: Directive[] = [{ id: "m-2", title: "m-0", description: "", rawContent: "" }];
		const archivedDirectives: Directive[] = [{ id: "m-0", title: "Historical", description: "", rawContent: "" }];
		const buckets = buildDirectiveBuckets(proposals, directives, ["Potential", "Reached"], {
			archivedDirectives,
			archivedDirectiveIds: ["m-0"],
		});
		const noDirectiveBucket = buckets.find((bucket) => bucket.isNoDirective);
		expect(noDirectiveBucket?.proposals.map((proposal) => proposal.id)).toEqual(["proposal-1"]);
	});

	it("prefers real directive IDs over numeric title aliases", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "1", status: "Potential" })];
		const directives: Directive[] = [
			{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
			{ id: "m-2", title: "1", description: "", rawContent: "" },
		];
		const buckets = buildDirectiveBuckets(proposals, directives, ["Potential", "Reached"]);
		const idBucket = buckets.find((bucket) => bucket.directive === "m-1");
		const titleBucket = buckets.find((bucket) => bucket.directive === "m-2");
		expect(idBucket?.proposals.map((proposal) => proposal.id)).toEqual(["proposal-1"]);
		expect(titleBucket?.proposals.map((proposal) => proposal.id) ?? []).toHaveLength(0);
	});
});

describe("collectDirectiveIds", () => {
	const proposals = [
		makeProposal({ id: "proposal-1", directive: "M1" }),
		makeProposal({ id: "proposal-2", directive: "New" }),
		makeProposal({ id: "proposal-3" }),
	];
	const directives: Directive[] = [{ id: "M1", title: "M1", description: "", rawContent: "" }];

	it("merges file directives and discovered proposal directives without duplicates", () => {
		expect(collectDirectiveIds(proposals, directives)).toEqual(["M1", "New"]);
	});

	it("normalizes whitespace and casing", () => {
		const variantProposals = [
			makeProposal({ id: "proposal-1", directive: "  m1  " }),
			makeProposal({ id: "proposal-2", directive: "New" }),
		];
		const result = collectDirectiveIds(variantProposals, directives);
		expect(result).toEqual(["M1", "New"]);
	});
});

describe("validateDirectiveName", () => {
	it("rejects empty names", () => {
		expect(validateDirectiveName("   ", [])).toBe("Directive name cannot be empty.");
	});

	it("rejects duplicates case-insensitively", () => {
		expect(validateDirectiveName("Alpha", ["alpha", "Beta"])).toBe("Directive already exists.");
		expect(validateDirectiveName(" beta  ", ["alpha", "Beta"])).toBe("Directive already exists.");
	});

	it("allows unique names", () => {
		expect(validateDirectiveName("Release", ["alpha", "Beta"])).toBeNull();
	});
});
