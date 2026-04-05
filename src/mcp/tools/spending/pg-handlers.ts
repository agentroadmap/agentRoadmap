/**
 * Postgres-backed Spending & Model MCP Tools for AgentHive.
 *
 * Handles budget guardrails and LLM model metadata.
 * All handler methods catch errors and return MCP text responses instead of throwing.
 */
import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";
import { query } from "../../../postgres/pool.ts";

function errorResult(msg: string, err: unknown): CallToolResult {
  return { content: [{ type: "text", text: `⚠️ ${msg}: ${err instanceof Error ? err.message : String(err)}` }] };
}

export class PgSpendingHandlers {
  private core: McpServer;
  private projectRoot: string;

  constructor(core: McpServer, projectRoot: string) {
    this.core = core;
    this.projectRoot = projectRoot;
  }

  async setSpendingCap(args: {
    agent_identity: string;
    daily_limit_usd: string;
  }): Promise<CallToolResult> {
    try {
      const { rows } = await query(
        `INSERT INTO spending_caps (agent_identity, daily_limit_usd, total_spent_today_usd)
         VALUES ($1, $2, 0)
         ON CONFLICT ON CONSTRAINT spending_caps_pkey
         DO UPDATE SET daily_limit_usd = EXCLUDED.daily_limit_usd
         RETURNING *`,
        [args.agent_identity, parseFloat(args.daily_limit_usd)],
      );
      return { content: [{ type: "text", text: `Cap set for ${rows[0].agent_identity}: $${rows[0].daily_limit_usd}/day` }] };
    } catch (err) {
      return errorResult("Failed to set spending cap", err);
    }
  }

  async logSpending(args: {
    agent_identity: string;
    proposal_id?: string;
    cost_usd: string;
  }): Promise<CallToolResult> {
    try {
      await query(
        `INSERT INTO spending_log (agent_identity, proposal_id, cost_usd)
         VALUES ($1, $2, $3)`,
        [args.agent_identity, args.proposal_id || null, parseFloat(args.cost_usd)],
      );

      // Update total spent today
      const { rows } = await query(
        `UPDATE spending_caps SET total_spent_today_usd = COALESCE(total_spent_today_usd, 0) + $2
         WHERE agent_identity = $1
         RETURNING *`,
        [args.agent_identity, parseFloat(args.cost_usd)],
      );

      const cap = rows[0]?.daily_limit_usd;
      const spent = rows[0]?.total_spent_today_usd;
      if (cap && spent && parseFloat(spent) >= parseFloat(cap)) {
        await query(`UPDATE spending_caps SET is_frozen = true WHERE agent_identity = $1`, [args.agent_identity]);
        return { content: [{ type: "text", text: `⚠️ Spending cap exceeded! ${args.agent_identity} frozen at $${spent}/$${cap}` }] };
      }
      return { content: [{ type: "text", text: `Logged $${args.cost_usd} for ${args.agent_identity} ($${spent}/$${cap})` }] };
    } catch (err) {
      return errorResult("Failed to log spending", err);
    }
  }

  async getSpendingReport(args: { agent_identity?: string }): Promise<CallToolResult> {
    try {
      let whereClause = '';
      const params: any[] = [];
      if (args.agent_identity) {
        whereClause = 'WHERE agent_identity = $1';
        params.push(args.agent_identity);
      }
      const { rows } = await query(
        `SELECT agent_identity, daily_limit_usd, total_spent_today_usd, is_frozen
         FROM spending_caps ${whereClause}`,
        params,
      );
      if (!rows.length) {
        return { content: [{ type: "text", text: "No spending data found." }] };
      }
      const lines = rows.map((r) =>
        `${r.agent_identity}: $${r.total_spent_today_usd || 0}/$${r.daily_limit_usd || '∞'} ${r.is_frozen ? '🔒 FROZEN' : '✅ OK'}`,
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return errorResult("Failed to get spending report", err);
    }
  }
}

export class PgModelHandlers {
  private core: McpServer;
  private projectRoot: string;

  constructor(core: McpServer, projectRoot: string) {
    this.core = core;
    this.projectRoot = projectRoot;
  }

  async listModels(args: {}): Promise<CallToolResult> {
    try {
      const { rows } = await query(
        `SELECT model_name, provider, cost_per_1k_input, cost_per_1k_output, max_tokens, rating
         FROM model_metadata ORDER BY rating DESC`,
      );
      if (!rows.length) {
        return { content: [{ type: "text", text: "No models configured." }] };
      }
      const lines = rows.map((r) =>
        `${r.model_name} (${r.provider}) — rating: ${r.rating}/10, input: $${r.cost_per_1k_input || '?'}/1k, output: $${r.cost_per_1k_output || '?'}/1k, max: ${r.max_tokens || 'unknown'}`,
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return errorResult("Failed to list models", err);
    }
  }

  async addModel(args: {
    model_name: string;
    provider?: string;
    cost_per_1k_input?: string;
    cost_per_1k_output?: string;
    max_tokens?: string;
    capabilities?: string;
    rating?: string;
  }): Promise<CallToolResult> {
    try {
      const { rows } = await query(
        `INSERT INTO model_metadata (model_name, provider, cost_per_1k_input, cost_per_1k_output, max_tokens, capabilities, rating)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT ON CONSTRAINT model_metadata_model_name_key
         DO UPDATE SET provider = EXCLUDED.provider, rating = EXCLUDED.rating
         RETURNING model_name, rating`,
        [
          args.model_name,
          args.provider || null,
          args.cost_per_1k_input ? parseFloat(args.cost_per_1k_input) : null,
          args.cost_per_1k_output ? parseFloat(args.cost_per_1k_output) : null,
          args.max_tokens ? parseInt(args.max_tokens, 10) : null,
          args.capabilities ? JSON.parse(args.capabilities) : null,
          args.rating ? parseInt(args.rating, 10) : null,
        ],
      );
      return { content: [{ type: "text", text: `Model added: ${rows[0].model_name} (rating: ${rows[0].rating})` }] };
    } catch (err) {
      return errorResult("Failed to add model", err);
    }
  }
}
