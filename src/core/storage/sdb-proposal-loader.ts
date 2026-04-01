/**
 * SpacetimeDB Proposal Loader
 *
 * Bridges SpacetimeDB 'proposal' table → UI Proposal format.
 * No dependency on 'spacetime' CLI. Uses unified SDB client.
 */

import { querySdbSync, getSdbConfigSync } from "./sdb-client.ts";
import { AcceptanceCriteriaManager, extractStructuredSection } from "../../markdown/structured-sections.ts";
import type { Proposal, Directive, ProposalClaim } from "../../types/index.ts";

/** Convert microsecond timestamp to milliseconds */
function toMs(timestamp: any): number {
  if (!timestamp) return 0;
  const num = Number(timestamp);
  if (num > 1e15) return Math.floor(num / 1000);
  return num;
}

/** Convert an SDB row to the Proposal format expected by UI components */
function rowToProposal(row: any): Proposal {
  const compId = row.comp_id || row.component_id;
  const claimedBy = row.claimed_by || row.assigned_identity;
  const directiveId = row.goal_id || row.directive_id;
  const rawStatus = row.status || "Draft";
  const statusMap: Record<string, string> = { "Potential": "Proposal", "Reached": "Complete", "draft": "Draft", "Abandoned": "Rejected" };
  const status = statusMap[rawStatus] || rawStatus;

  const claimedAt = row.claimed_at ? toMs(row.claimed_at) : null;

  const claim: ProposalClaim | undefined = claimedBy
    ? { agent: String(claimedBy), expires: String(claimedAt || 0), created: String(row.created_at || 0) }
    : undefined;

  const isComplete = status === "Complete" || status === "Reached";
  const bodyText = String(row.body || row.body_markdown || "");

  // Fallback to parsing the body if DB columns are empty (e.g. from v1 migrations)
  const rawAcceptanceCriteria = String(row.acceptance_criteria || "");
  const acceptanceCriteriaItems = rawAcceptanceCriteria 
    ? AcceptanceCriteriaManager.parseAllCriteria(rawAcceptanceCriteria)
    : AcceptanceCriteriaManager.parseAllCriteria(bodyText);

  return {
    id: String(row.display_id || row.id),
    title: String(row.title),
    body: bodyText,
    description: String(row.description || "") || extractStructuredSection(bodyText, "description") || "",
    implementationPlan: extractStructuredSection(bodyText, "implementationPlan") || undefined,
    implementationNotes: String(row.implementation_notes || "") || extractStructuredSection(bodyText, "implementationNotes") || "",
    finalSummary: String(row.final_summary || "") || extractStructuredSection(bodyText, "finalSummary") || "",
    acceptanceCriteriaItems,
    status,
    assignee: compId ? [String(compId)] : [],
    priority: String(row.priority || "none") as any,
    labels: row.labels ? String(row.labels).split(",").map((s: string) => s.trim()).filter(Boolean) : (row.tags ? String(row.tags).split(",").map((s: string) => s.trim()).filter(Boolean) : []),
    dependencies: row.dependencies ? String(row.dependencies).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
    parentProposalId: undefined,
    proof: row.body || row.body_markdown ? [String(row.body || row.body_markdown)] : [],
    directive: directiveId ? String(directiveId) : undefined,
    branch: undefined,
    maturity: undefined,
    ready: isComplete,
    claim,
    createdDate: row.created_at ? new Date(toMs(row.created_at)).toISOString() : new Date().toISOString(),
    updatedDate: row.updated_at ? new Date(toMs(row.updated_at)).toISOString() : undefined,
  };
}

/** Load all proposals from SpacetimeDB */
export function loadAllProposals(): Proposal[] {
  const dbName = getSdbConfigSync().dbName;
  const table = dbName === "roadmap2" ? "proposal" : "step";
  const rows = querySdbSync(`SELECT * FROM ${table}`);
  return rows.map(rowToProposal);
}

/** Load proposals filtered by status */
export function loadProposalsByStatus(status: string): Proposal[] {
  const dbName = getSdbConfigSync().dbName;
  const table = dbName === "roadmap2" ? "proposal" : "step";
  const rows = querySdbSync(`SELECT * FROM ${table} WHERE status = '${status}'`);
  return rows.map(rowToProposal);
}

/** Load a single proposal by ID */
export function loadProposal(id: string): Proposal | null {
  const dbName = getSdbConfigSync().dbName;
  const table = dbName === "roadmap2" ? "proposal" : "step";
  const rows = querySdbSync(`SELECT * FROM ${table} WHERE id = '${id}' OR display_id = '${id}'`);
  if (rows.length === 0) return null;
  return rowToProposal(rows[0]);
}

/** Load all directives from SpacetimeDB */
export function loadAllDirectives(): Directive[] {
  const dbName = getSdbConfigSync().dbName;
  const table = dbName === "roadmap2" ? "directive" : "goal";
  const descColumn = dbName === "roadmap2" ? "content" : "description";
  const rows = querySdbSync(`SELECT id, title, ${descColumn} as description, status FROM ${table}`);
  return rows.map((row: any) => ({
    id: String(row.id),
    title: String(row.title),
    description: String(row.description || ""),
    status: String(row.status || "aspirational"),
    rawContent: "",
  }));
}

/** Load proposals for statistics calculation */
export function loadProposalsForStatistics(): {
  proposals: Proposal[];
  drafts: Proposal[];
  statuses: string[];
} {
  const allProposals = loadAllProposals();
  const drafts = allProposals.filter((p) => p.status === "Proposal" || p.status === "Draft");
  const proposals = allProposals.filter((p) => p.status !== "Proposal" && p.status !== "Draft");
  const statusSet = new Set(allProposals.map((p) => p.status));
  const statuses = Array.from(statusSet);
  return { proposals, drafts, statuses };
}
