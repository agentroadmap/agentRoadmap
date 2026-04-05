/**
 * Postgres Agent Memory & Memory MCP Tools for AgentHive.
 *
 * Agent memory operations via the `agent_memory` table.
 * Implements the 4-layer memory system from `roadmap/memory/architecture.md`:
 *
 * - `identity`      — persistent agent identity/manifesto
 * - `constitution`  — core rules/values (versioned)
 * - `project`       — shared project context, decisions, learnings
 * - `task`          — ephemeral task-specific context (TTL-based cleanup)
 *
 * All handler methods catch errors and return MCP text responses
 * instead of throwing, preventing tool call crashes.
 */
import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";
import { query } from "../../../postgres/pool.ts";

function errorResult(msg: string, err: unknown): CallToolResult {
  return { content: [{ type: "text", text: `⚠️ ${msg}: ${err instanceof Error ? err.message : String(err)}` }] };
}

export class PgMemoryHandlers {
  private server: McpServer;

  constructor(server: McpServer) {
    this.server = server;
  }

  async setMemory(args: {
    agent_identity: string;
    layer: string;
    key: string;
    value: string;
  }): Promise<CallToolResult> {
    try {
      await query(
        `INSERT INTO agent_memory (agent_identity, layer, key, value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (agent_identity, layer, key)
         DO UPDATE SET value = $4, updated_at = NOW()`,
        [args.agent_identity, args.layer, args.key, args.value],
      );
      return { content: [{ type: "text", text: `Memory set: ${args.agent_identity}/${args.layer}/${args.key}` }] };
    } catch (err) {
      return errorResult("Failed to set memory", err);
    }
  }

  async getMemory(args: {
    agent_identity: string;
    layer: string;
    key?: string;
  }): Promise<CallToolResult> {
    try {
      let sql = `SELECT key, value, updated_at FROM agent_memory
                  WHERE agent_identity = $1 AND layer = $2`;
      const params: any[] = [args.agent_identity, args.layer];

      if (args.key) {
        sql += ` AND key = $3`;
        params.push(args.key);
      }

      sql += ` ORDER BY updated_at DESC`;

      const { rows } = await query(sql, params);
      if (!rows.length) {
        return { content: [{ type: "text", text: `No memory found for ${args.agent_identity}/${args.layer}${args.key ? '/' + args.key : ''}` }] };
      }

      const lines = rows.map((r) =>
        `**${r.key}**: ${r.value} _(updated: ${new Date(r.updated_at).toISOString()})_`,
      );
      return { content: [{ type: "text", text: `### ${args.layer}\n${lines.join('\n')}` }] };
    } catch (err) {
      return errorResult("Failed to get memory", err);
    }
  }

  async deleteMemory(args: {
    agent_identity: string;
    layer: string;
    key?: string;
  }): Promise<CallToolResult> {
    try {
      let sql = `DELETE FROM agent_memory WHERE agent_identity = $1 AND layer = $2`;
      const params: any[] = [args.agent_identity, args.layer];

      if (args.key) {
        sql += ` AND key = $3`;
        params.push(args.key);
      }

      const { rowCount } = await query(sql, params);
      return { content: [{ type: "text", text: `✅ Deleted ${rowCount} memory entries from ${args.agent_identity}/${args.layer}${args.key ? '/' + args.key : ''}` }] };
    } catch (err) {
      return errorResult("Failed to delete memory", err);
    }
  }

  /**
   * Semantic search across agent memory using pgvector cosine similarity.
   * Caller provides a 1536-dimension embedding vector for the query.
   * Returns memories whose body_embedding is most similar to the query.
   */
  async searchMemory(args: {
    agent_identity?: string;
    layer?: string;
    embedding: number[];    // 1536-dim query embedding
    top_k?: number;         // max results (default 10)
    threshold?: number;     // min similarity score (default 0.5)
  }): Promise<CallToolResult> {
    try {
      const limit = Math.min(args.top_k ?? 10, 100);
      const threshold = args.threshold ?? 0.5;

      const clauses: string[] = ["body_embedding IS NOT NULL"];
      const params: any[] = [];
      let idx = 1;

      if (args.agent_identity) {
        clauses.push(`agent_identity = $${idx++}`);
        params.push(args.agent_identity);
      }
      if (args.layer) {
        clauses.push(`layer = $${idx++}`);
        params.push(args.layer);
      }

      const vecIdx = idx;
      params.push(args.embedding);
      const simClause = `1 - (body_embedding <=> $${idx}::vector(1536)) >= ${threshold}`;
      clauses.push(simClause);

      const where = clauses.join(" AND ");

      const { rows } = await query(
        `SELECT id, agent_identity, layer, key, value,
                1 - (body_embedding <=> $${vecIdx}::vector(1536)) AS similarity
         FROM agent_memory
         WHERE ${where}
         ORDER BY similarity DESC
         LIMIT ${limit}`,
        params,
      );

      if (!rows.length) {
        return { content: [{ type: "text", text: `No matching memories found (threshold: ${threshold}, top: ${limit})` }] };
      }

      const lines = rows.map((r) =>
        `[${Number(r.similarity).toFixed(3)}] **${r.agent_identity}/${r.layer}/${r.key}**: ${r.value}`,
      );
      return { content: [{ type: "text", text: `### Semantic Search Results\n${lines.join("\n")}` }] };
    } catch (err) {
      return errorResult("Failed to search memory", err);
    }
  }

  async memorySummary(args: {
    agent_identity?: string;
    layer?: string;
  }): Promise<CallToolResult> {
    try {
      const clauses: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (args.agent_identity) {
        clauses.push(`agent_identity = $${idx++}`);
        params.push(args.agent_identity);
      }
      if (args.layer) {
        clauses.push(`layer = $${idx++}`);
        params.push(args.layer);
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

      const { rows } = await query(
        `SELECT agent_identity, layer, COUNT(*) as count, MAX(updated_at) as last_updated
         FROM agent_memory ${where}
         GROUP BY agent_identity, layer
         ORDER BY agent_identity, layer`,
        params,
      );

      if (!rows.length) {
        return { content: [{ type: "text", text: "No memory entries found." }] };
      }

      const lines = rows.map((r) =>
        `**${r.agent_identity}/${r.layer}**: ${r.count} entries (last: ${new Date(r.last_updated).toISOString()})`,
      );
      return { content: [{ type: "text", text: lines.join('\n') }] };
    } catch (err) {
      return errorResult("Failed to get memory summary", err);
    }
  }
}
