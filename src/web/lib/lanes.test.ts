import { describe, expect, it } from "bun:test";
import type { Proposal } from "../../types";
import {
	buildLanes,
	DEFAULT_LANE_KEY,
	groupProposalsByLaneAndStatus,
	laneKeyFromDirective,
	sortProposalsForStatus,
} from "./lanes";

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

describe("buildLanes", () => {
	it("creates directive lanes including No directive and proposal-discovered directives", () => {
		const proposals = [
			makeProposal({ id: "proposal-1", directive: "M1" }),
			makeProposal({ id: "proposal-2", directive: "Extra" }),
			makeProposal({ id: "proposal-3" }),
		];
		const lanes = buildLanes("directive", proposals, ["M1"]);
		expect(lanes.map((lane) => lane.label)).toEqual(["No directive", "M1", "Extra"]);
	});

	it("falls back to a single lane when mode is none", () => {
		const lanes = buildLanes("none", [], ["M1"]);
		expect(lanes).toHaveLength(1);
		expect(lanes[0]?.key).toBe(DEFAULT_LANE_KEY);
	});

	it("excludes archived directives from lane definitions", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "M1" })];
		const lanes = buildLanes("directive", proposals, ["M1"], [], { archivedDirectiveIds: ["M1"] });
		expect(lanes.map((lane) => lane.label)).toEqual(["No directive"]);
	});

	it("canonicalizes numeric directive aliases to configured directive IDs", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "1" })];
		const lanes = buildLanes(
			"directive",
			proposals,
			[],
			[{ id: "m-1", title: "Release 1", description: "", rawContent: "" }],
		);
		expect(lanes.map((lane) => lane.directive)).toContain("m-1");
		expect(lanes.map((lane) => lane.directive)).not.toContain("1");
	});

	it("canonicalizes zero-padded directive ID aliases to configured directive IDs", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "m-01" })];
		const lanes = buildLanes(
			"directive",
			proposals,
			[],
			[{ id: "m-1", title: "Release 1", description: "", rawContent: "" }],
		);
		expect(lanes.map((lane) => lane.directive)).toContain("m-1");
		expect(lanes.map((lane) => lane.directive)).not.toContain("m-01");
	});

	it("filters archived numeric directive aliases from lane definitions", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "1" })];
		const lanes = buildLanes("directive", proposals, [], [], {
			archivedDirectiveIds: ["m-1"],
			archivedDirectives: [{ id: "m-1", title: "Archived", description: "", rawContent: "" }],
		});
		expect(lanes.map((lane) => lane.label)).toEqual(["No directive"]);
	});

	it("prefers active title aliases when archived directives reuse the same title", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "Shared" })];
		const lanes = buildLanes(
			"directive",
			proposals,
			[],
			[{ id: "m-2", title: "Shared", description: "", rawContent: "" }],
			{
				archivedDirectiveIds: ["m-0"],
				archivedDirectives: [{ id: "m-0", title: "Shared", description: "", rawContent: "" }],
			},
		);
		expect(lanes.map((lane) => lane.directive)).toContain("m-2");
		expect(lanes.map((lane) => lane.directive)).not.toContain("Shared");
	});

	it("prefers real directive IDs over numeric title aliases in lane definitions", () => {
		const proposals = [makeProposal({ id: "proposal-1", directive: "1" })];
		const lanes = buildLanes(
			"directive",
			proposals,
			[],
			[
				{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
				{ id: "m-2", title: "1", description: "", rawContent: "" },
			],
		);
		expect(lanes.map((lane) => lane.directive)).toContain("m-1");
		expect(lanes.map((lane) => lane.directive)).not.toContain("m-2");
	});
});

describe("groupProposalsByLaneAndStatus", () => {
	const proposals = [
		makeProposal({ id: "proposal-1", status: "Potential", directive: "M1" }),
		makeProposal({ id: "proposal-2", status: "Active" }),
		makeProposal({ id: "proposal-3", status: "Potential", directive: "Extra", ordinal: 5 }),
	];

	it("groups proposals under their directive lanes", () => {
		const lanes = buildLanes("directive", proposals, ["M1"]);
		const grouped = groupProposalsByLaneAndStatus("directive", lanes, ["Potential", "Active"], proposals);

		expect((grouped.get(laneKeyFromDirective("M1"))?.get("Potential") ?? []).map((t) => t.id)).toEqual(["proposal-1"]);
		expect((grouped.get(laneKeyFromDirective(null))?.get("Active") ?? []).map((t) => t.id)).toEqual(["proposal-2"]);
		expect((grouped.get(laneKeyFromDirective("Extra"))?.get("Potential") ?? []).map((t) => t.id)).toEqual(["proposal-3"]);
	});

	it("places all proposals into the default lane when lane mode is none", () => {
		const lanes = buildLanes("none", proposals, []);
		const grouped = groupProposalsByLaneAndStatus("none", lanes, ["Potential", "Active"], proposals);
		const defaultLaneProposals = grouped.get(DEFAULT_LANE_KEY);

		expect(defaultLaneProposals?.get("Potential")?.map((t) => t.id)).toEqual(["proposal-3", "proposal-1"]);
		expect(defaultLaneProposals?.get("Active")?.map((t) => t.id)).toEqual(["proposal-2"]);
	});

	it("normalizes archived directive proposals to no directive", () => {
		const lanes = buildLanes("directive", proposals, ["M1"], [], { archivedDirectiveIds: ["M1"] });
		const grouped = groupProposalsByLaneAndStatus("directive", lanes, ["Potential", "Active"], proposals, {
			archivedDirectiveIds: ["M1"],
		});
		expect((grouped.get(laneKeyFromDirective(null))?.get("Potential") ?? []).map((t) => t.id)).toEqual(["proposal-1"]);
	});

	it("normalizes numeric aliases for archived directives to no directive", () => {
		const archivedDirectives = [{ id: "m-1", title: "Archived", description: "", rawContent: "" }];
		const archivedAliasProposals = [makeProposal({ id: "proposal-1", status: "Potential", directive: "1" })];
		const lanes = buildLanes("directive", archivedAliasProposals, [], []);
		const grouped = groupProposalsByLaneAndStatus("directive", lanes, ["Potential"], archivedAliasProposals, {
			archivedDirectiveIds: ["m-1"],
			archivedDirectives,
		});
		expect((grouped.get(laneKeyFromDirective(null))?.get("Potential") ?? []).map((t) => t.id)).toEqual(["proposal-1"]);
	});

	it("prefers real directive IDs over numeric title aliases when grouping proposals", () => {
		const proposalsWithNumericTitleCollision = [makeProposal({ id: "proposal-1", status: "Potential", directive: "1" })];
		const directives = [
			{ id: "m-1", title: "Release 1", description: "", rawContent: "" },
			{ id: "m-2", title: "1", description: "", rawContent: "" },
		];
		const lanes = buildLanes("directive", proposalsWithNumericTitleCollision, [], directives);
		const grouped = groupProposalsByLaneAndStatus("directive", lanes, ["Potential"], proposalsWithNumericTitleCollision, {
			directiveEntities: directives,
		});
		expect((grouped.get(laneKeyFromDirective("m-1"))?.get("Potential") ?? []).map((proposal) => proposal.id)).toEqual([
			"proposal-1",
		]);
		expect((grouped.get(laneKeyFromDirective("m-2"))?.get("Potential") ?? []).map((proposal) => proposal.id) ?? []).toHaveLength(
			0,
		);
	});
});

describe("sortProposalsForStatus", () => {
	it("prioritizes ordinal when present and falls back to updatedDate for done statuses", () => {
		const proposals = [
			makeProposal({ id: "proposal-1", status: "Reached", updatedDate: "2024-01-02", createdDate: "2024-01-01" }),
			makeProposal({ id: "proposal-2", status: "Reached", ordinal: 1, updatedDate: "2024-01-01" }),
			makeProposal({ id: "proposal-3", status: "Reached", updatedDate: "2024-01-03", createdDate: "2024-01-01" }),
		];

		const sorted = sortProposalsForStatus(proposals, "Reached").map((t) => t.id);
		expect(sorted).toEqual(["proposal-2", "proposal-3", "proposal-1"]);
	});
});
