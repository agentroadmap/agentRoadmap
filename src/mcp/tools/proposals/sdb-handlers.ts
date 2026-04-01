/**
 * SpacetimeDB-backed Proposal Handlers
 * Replaces file-based proposal operations with stdb queries
 */

import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";
import { execSync } from "child_process";

export interface SdbProposal {
  id: string;
  title: string;
  body?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  directive?: string;
  labels?: string;
  dependencies?: string;
  claimedBy?: string;
  claimedAt?: bigint;
  createdAt?: bigint;
  updatedAt?: bigint;
}

export class SdbProposalHandlers {
  private core: McpServer;
  private projectRoot: string;

  constructor(core: McpServer, projectRoot: string) {
    this.core = core;
    this.projectRoot = projectRoot;
  }

  async listProposals(args: { status?: string; assignee?: string; limit?: number }): Promise<CallToolResult> {
    try {
      let query = "SELECT id, title, status, assignee, priority FROM step";
      const conditions: string[] = [];
      
      if (args.status) conditions.push(`status = '${args.status}'`);
      if (args.assignee) conditions.push(`assignee LIKE '%${args.assignee}%'`);
      
      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      
      // Note: SpacetimeDB SQL doesn't support LIMIT in all versions
      const proposals = await this.querySql(query);
      
      if (!proposals || proposals.length === 0) {
        return { content: [{ type: "text", text: "No proposals found." }] };
      }

      const lines = proposals.map((s: any) => 
        `- **${s.id}**: ${s.title} [${s.status || 'draft'}]`
      ).join("\n");

      return {
        content: [{ type: "text", text: `## Proposals (${proposals.length})\n\n${lines}` }]
      };
    } catch (error) {
      throw new Error(`Failed to list proposals: ${(error as Error).message}`);
    }
  }

  async getProposal(args: { proposalId: string }): Promise<CallToolResult> {
    try {
      const proposals = await this.querySql(`SELECT * FROM step WHERE id = '${args.proposalId}'`);
      
      if (!proposals || proposals.length === 0) {
        return { content: [{ type: "text", text: `Proposal ${args.proposalId} not found.` }] };
      }

      const proposal = proposals[0];
      const output = [
        `## ${proposal.id}: ${proposal.title}`,
        ``,
        `**Status:** ${proposal.status || 'draft'}`,
        `**Assignee:** ${proposal.assignee || 'unassigned'}`,
        `**Priority:** ${proposal.priority || 'medium'}`,
        ``,
        proposal.body ? `### Description\n${proposal.body}` : '',
      ].filter(Boolean).join("\n");

      return { content: [{ type: "text", text: output }] };
    } catch (error) {
      throw new Error(`Failed to get proposal: ${(error as Error).message}`);
    }
  }

  async createProposal(args: {
    title: string;
    description?: string;
    status?: string;
    assignee?: string;
    priority?: string;
    labels?: string[];
  }): Promise<CallToolResult> {
    try {
      const id = `STATE-${String(Date.now()).slice(-6)}`;
      const title = args.title;
      const body = args.description || '';
      
      await this.callReducer('create_step', [id, title, body]);
      
      return {
        content: [{ type: "text", text: `✅ Created ${id}: ${title}` }]
      };
    } catch (error) {
      throw new Error(`Failed to create proposal: ${(error as Error).message}`);
    }
  }

  async completeProposal(args: { proposalId: string }): Promise<CallToolResult> {
    try {
      await this.callReducer('complete_proposal', [args.proposalId, 'manual', Date.now().toString()]);
      
      return {
        content: [{ type: "text", text: `✅ ${args.proposalId} marked as complete` }]
      };
    } catch (error) {
      throw new Error(`Failed to complete proposal: ${(error as Error).message}`);
    }
  }

  // Helper to query SpacetimeDB SQL
  private async querySql(sql: string): Promise<any[]> {
    try {
      const result = execSync(
        `spacetime sql --server local agent-roadmap-v2 "${sql}"`,
        { encoding: 'utf8', cwd: this.projectRoot }
      );
      const lines = result.trim().split('\n').filter(l => !l.includes('WARNING'));
      if (lines.length < 2) return [];
      
      const headers = lines[0]!.split('|').map(h => h.trim()).filter(Boolean);
      return lines.slice(1).map(line => {
        const values = line.split('|').map(v => v.trim().replace(/"/g, ''));
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = values[i]; });
        return obj;
      });
    } catch {
      return [];
    }
  }

  // Helper to call SpacetimeDB reducer
  private async callReducer(name: string, args: string[]): Promise<void> {
    const argsStr = args.map(a => `"${a}"`).join(' ');
    execSync(
      `spacetime call --server local agent-roadmap-v2 ${name} ${argsStr}`,
      { encoding: 'utf8', cwd: this.projectRoot, stdio: 'pipe' }
    );
  }
}
