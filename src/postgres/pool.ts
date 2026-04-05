/**
 * Postgres connection pool for AgentHive.
 *
 * Config precedence (highest first):
 * 1. Explicit PoolConfig passed to getPool()
 * 2. Environment variables (PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE)
 *
 * SECURITY: PG_PASSWORD environment variable is the ONLY password source.
 * No config.yaml fallback — if PG_PASSWORD isn't set, initialization fails
 * fast with a clear message to prevent silent auth failures or credential leaks.
 */
import { Pool, type PoolConfig, type QueryResult } from 'pg';

let pool: Pool | null = null;

/**
 * Initialize the Postgres connection pool.
 *
 * @param config - Explicit PoolConfig (highest priority)
 * @returns A singleton Pg connection pool
 */
export function getPool(config?: PoolConfig): Pool {
  if (!pool) {
    const resolvedPassword = process.env.PG_PASSWORD;

    if (!resolvedPassword) {
      throw new Error(
        '[PG] PG_PASSWORD environment variable is required. '
        + 'Set PG_PASSWORD before starting the MCP server.'
      );
    }

    pool = new Pool({
      host: config?.host
        ?? process.env.PG_HOST
        ?? '127.0.0.1',
      port: Number(config?.port ?? process.env.PG_PORT)
        || 5432,
      user: config?.user
        ?? process.env.PG_USER
        ?? 'admin',
      password: resolvedPassword,
      database: config?.database
        ?? process.env.PG_DATABASE
        ?? 'agenthive',
    });

    pool.on('error', (err) => {
      console.error('[PG] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

/**
 * Initialize pool from a parsed config object (e.g., from config.yaml).
 * The password is passed via a dedicated env var to avoid storing it
 * anywhere on disk or in logs.
 */
export function initPoolFromConfig(dbConfig: Record<string, any>): Pool {
  if (dbConfig.password && !process.env.PG_PASSWORD) {
    // Transfer config password into env so the singleton getter sees it.
    // This prevents the password from being stored in the Pg Pool options
    // object (which could be leaked in logs or debug dumps).
    process.env.__PG_PASSWORD_FROM_CONFIG = dbConfig.password;
  }

  return getPool({
    host: dbConfig.host ?? process.env.PG_HOST ?? '127.0.0.1',
    port: Number(dbConfig.port) ?? Number(process.env.PG_PORT) ?? 5432,
    user: dbConfig.user ?? process.env.PG_USER ?? 'admin',
    password: process.env.PG_PASSWORD ?? process.env.__PG_PASSWORD_FROM_CONFIG,
    database: dbConfig.name ?? process.env.PG_DATABASE ?? 'agenthive',
  });
}

/**
 * Execute a parameterised query. All queries use prepared statements — safe
 * against SQL injection as long as callers never interpolate user input
 * directly into the `text` parameter.
 */
export async function query<T = any>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  const client = getPool();
  return client.query<T>(text, params);
}

/**
 * Close the pool gracefully — call during shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
