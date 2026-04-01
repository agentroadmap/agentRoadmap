/**
 * Event Stream for SpacetimeDB proposal changes.
 *
 * Tracks and broadcasts proposal transitions, claims, reviews, merges, etc.
 * Events are stored in SpacetimeDB 'event' table and streamed via WebSocket.
 */

import { querySdbSync } from "./sdb-client.ts";

const DB_NAME = "agent-roadmap-v2";

/** Event types for proposal lifecycle */
export type EventType =
  | "proposal_accepted"      // Proposal moved to Accepted
  | "proposal_claimed"       // Agent claimed a proposal
  | "proposal_coding"        // Coding started
  | "review_requested"    // Request for review
  | "proposal_reviewing"     // Being reviewed
  | "review_passed"       // Review passed
  | "review_failed"       // Review failed, needs rework
  | "proposal_complete"      // Proposal marked complete
  | "proposal_merged"        // Merged to local main
  | "proposal_pushed"        // Pushed to remote (GitLab)
  | "agent_online"        // Agent came online
  | "agent_offline"       // Agent went offline
  | "message"             // Chat/PM message
  | "cubic_phase_change"  // Cubic phase transition
  | "handoff"             // Handoff between cubics
  | "heartbeat"           // Agent heartbeat
  | "custom";             // Custom event

/** A stream event */
export interface StreamEvent {
  id: string;
  type: EventType;
  timestamp: number;
  /** The proposal this event relates to (if any) */
  proposalId?: string;
  /** Agent who triggered this event */
  agentId?: string;
  /** Human-readable message */
  message: string;
  /** Additional metadata */
  metadata: Record<string, string>;
}

/**
 * Insert an event into SpacetimeDB.
 */
export function insertEvent(
  type: EventType,
  proposalId: string | undefined,
  agentId: string | undefined,
  message: string,
  metadata: Record<string, string> = {},
): boolean {
  const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = Date.now();
  const metaJson = JSON.stringify(metadata).replace(/'/g, "''");

  try {
    querySdbSync(
      `INSERT INTO event (event_id, type, timestamp, proposal_id, agent_id, message, metadata) ` +
      `VALUES ('${id}', '${type}', ${timestamp}, '${proposalId || ""}', '${agentId || ""}', '${message.replace(/'/g, "''")}', '${metaJson}')`
    );
    return true;
  } catch {
    // If event table doesn't exist yet, store in memory
    _memoryEvents.push({ id, type, timestamp, proposalId, agentId, message, metadata });
    return false;
  }
}

/** Fallback in-memory events when SDB table doesn't exist */
const _memoryEvents: StreamEvent[] = [];

/** Skip SDB queries if we know the table doesn't exist */
let _eventTableExists = true;

/**
 * Get recent events from SpacetimeDB (or memory fallback).
 */
export function getRecentEvents(limit: number = 50): StreamEvent[] {
	// If we know the table doesn't exist, skip SQL query entirely
	if (!_eventTableExists) {
		return _memoryEvents.slice(-limit);
	}
  try {
    const results = querySdbSync(
      `SELECT event_id, type, timestamp, proposal_id, agent_id, message, metadata FROM event ORDER BY timestamp DESC LIMIT ${limit}`
    );

    if (results.length === 0) return _memoryEvents.slice(-limit);

    return results.map((row) => {
      return {
        id: row.event_id || "",
        type: (row.type || "custom") as EventType,
        timestamp: Number(row.timestamp) || 0,
        proposalId: row.proposal_id || undefined,
        agentId: row.agent_id || undefined,
        message: row.message || "",
        metadata: (() => { try { return typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata; } catch { return {}; } })(),
      };
    });
  } catch {
    // Event table doesn't exist in SDB yet — use memory fallback, skip future queries
    _eventTableExists = false;
    return _memoryEvents.slice(-limit);
  }
}

// ──────────────────────────────────────────
// Convenience event creators
// ──────────────────────────────────────────

export function emitProposalAccepted(proposalId: string, title: string): void {
  insertEvent("proposal_accepted", proposalId, undefined, `${proposalId} is accepted`, { title });
}

export function emitProposalClaimed(proposalId: string, agentId: string, agentName: string): void {
  insertEvent("proposal_claimed", proposalId, agentId, `${proposalId} claimed by ${agentName}`, { agentName });
}

export function emitCodingStarted(proposalId: string, agentId: string): void {
  insertEvent("proposal_coding", proposalId, agentId, `${proposalId} coding started`);
}

export function emitReviewRequested(proposalId: string, fromAgent: string, toAgent: string): void {
  insertEvent("review_requested", proposalId, fromAgent, `${proposalId} review requested by ${fromAgent}`, { reviewer: toAgent });
}

export function emitReviewing(proposalId: string, reviewerId: string, reviewerName: string): void {
  insertEvent("proposal_reviewing", proposalId, reviewerId, `${proposalId} being reviewed by ${reviewerName}`, { reviewerName });
}

export function emitReviewPassed(proposalId: string, reviewerId: string): void {
  insertEvent("review_passed", proposalId, reviewerId, `${proposalId} review passed`);
}

export function emitReviewFailed(proposalId: string, reviewerId: string, reason: string): void {
  insertEvent("review_failed", proposalId, reviewerId, `${proposalId} review failed: ${reason}`, { reason });
}

export function emitProposalComplete(proposalId: string, agentId: string): void {
  insertEvent("proposal_complete", proposalId, agentId, `${proposalId} is complete`);
}

export function emitMergedToMain(proposalId: string): void {
  insertEvent("proposal_merged", proposalId, undefined, `${proposalId} merged to local main`);
}

export function emitPushedToGitLab(proposalId: string): void {
  insertEvent("proposal_pushed", proposalId, undefined, `${proposalId} pushed to GitLab`);
}

export function emitAgentOnline(agentId: string, agentName: string): void {
  insertEvent("agent_online", undefined, agentId, `${agentName} is online`, { agentName });
}

export function emitAgentOffline(agentId: string, agentName: string): void {
  insertEvent("agent_offline", undefined, agentId, `${agentName} went offline`, { agentName });
}

export function emitHandoff(proposalId: string, fromPhase: string, toPhase: string, agentId: string): void {
  insertEvent("handoff", proposalId, agentId, `${proposalId} handed off: ${fromPhase} → ${toPhase}`, { fromPhase, toPhase });
}

export function emitMessage(fromAgent: string, channel: string, preview: string): void {
  insertEvent("message", undefined, fromAgent, preview, { channel });
}

export function emitCubicPhaseChange(cubicId: string, fromPhase: string, toPhase: string): void {
  insertEvent("cubic_phase_change", undefined, undefined, `Cubic ${cubicId}: ${fromPhase} → ${toPhase}`, { cubicId, fromPhase, toPhase });
}
