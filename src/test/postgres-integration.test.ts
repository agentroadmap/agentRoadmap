/**
 * Postgres Integration Tests for AgentHive.
 *
 * Run: npx jiti src/test/postgres-integration.test.ts
 * Requires running Postgres container (postgres-db) with agenthive DB.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const PG_CONFIG = {
  host: '127.0.0.1',
  port: 5432,
  user: 'admin',
  password: process.env.PG_PASSWORD || '',
  database: 'agenthive',
};

let pool: Pool;

before(async () => {
  pool = new Pool(PG_CONFIG);
});

after(async () => {
  await pool.end();
});

describe('Postgres Schema Validation', () => {
  it('should have 11 tables', async () => {
    const { rows } = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const names = rows.map((r: any) => r.tablename);
    assert.strictEqual(names.length, 11, `Expected 11 tables, got ${names.length}: ${names.join(', ')}`);
  });

  it('should have all expected tables', async () => {
    const { rows } = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const names = new Set(rows.map((r: any) => r.tablename));
    const expected = [
      'proposal', 'proposal_version', 'attachment_registry',
      'agent_registry', 'team', 'team_member',
      'agent_memory', 'message_ledger', 'model_metadata',
      'spending_caps', 'spending_log',
    ];
    for (const t of expected) {
      assert.ok(names.has(t), `Missing table: ${t}`);
    }
  });

  it('should have at least 8 indexes', async () => {
    const { rows } = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    assert.ok(rows.length >= 24, `Expected >= 24 indexes (including pkeys), got ${rows.length}`);
  });
});

describe('Agent Registry CRUD', () => {
  it('should have 5 seeded agents', async () => {
    const { rows } = await pool.query(
      `SELECT agent_identity, role, status FROM agent_registry ORDER BY agent_identity`,
    );
    assert.strictEqual(rows.length, 5);
    const identities = rows.map((r: any) => r.agent_identity);
    assert.ok(identities.includes('Andy'));
    assert.ok(identities.includes('Bob'));
    assert.ok(identities.includes('Carter'));
    assert.ok(identities.includes('Gilbert'));
    assert.ok(identities.includes('Skeptic'));
  });

  it('should register a new agent', async () => {
    const { rows } = await pool.query(
      `INSERT INTO agent_registry (agent_identity, agent_type, role) VALUES ($1, $2, $3) RETURNING *`,
      ['TestBot', 'AI Assistant', 'tester'],
    );
    assert.strictEqual(rows[0].agent_identity, 'TestBot');
    assert.strictEqual(rows[0].role, 'tester');
    assert.strictEqual(rows[0].status, 'active');
    // Cleanup
    await pool.query(`DELETE FROM agent_registry WHERE agent_identity = 'TestBot'`);
  });

  it('should upsert on conflict', async () => {
    await pool.query(
      `INSERT INTO agent_registry (agent_identity, agent_type, role) VALUES ('TempBot', 'Test', 'temp')`,
    );
    const { rows } = await pool.query(
      `INSERT INTO agent_registry (agent_identity, agent_type, role) VALUES ('TempBot', 'Test', 'updated')
       ON CONFLICT ON CONSTRAINT agent_registry_agent_identity_key
       DO UPDATE SET role = EXCLUDED.role RETURNING role`,
    );
    assert.strictEqual(rows[0].role, 'updated');
    await pool.query(`DELETE FROM agent_registry WHERE agent_identity = 'TempBot'`);
  });
});

describe('Model Metadata', () => {
  it('should have 3 seeded models', async () => {
    const { rows } = await pool.query(`SELECT model_name FROM model_metadata ORDER BY model_name`);
    assert.strictEqual(rows.length, 3);
  });

  it('should add and update a model', async () => {
    await pool.query(
      `INSERT INTO model_metadata (model_name, provider, rating) VALUES ('test/model-1', 'test', 5)`,
    );
    const { rows } = await pool.query(
      `UPDATE model_metadata SET rating = 8 WHERE model_name = 'test/model-1' RETURNING *`,
    );
    assert.strictEqual(rows[0].rating, 8);
    await pool.query(`DELETE FROM model_metadata WHERE model_name = 'test/model-1'`);
  });
});

describe('Proposal CRUD', () => {
  it('should create and retrieve a proposal', async () => {
    const { rows } = await pool.query(
      `INSERT INTO proposal (title, proposal_type, status, maturity_level)
       VALUES ($1, $2, $3, $4) RETURNING id, title, status`,
      ['Test Proposal', 'RFC', 'DRAFT', 0],
    );
    assert.strictEqual(rows[0].title, 'Test Proposal');
    assert.strictEqual(rows[0].status, 'DRAFT');

    const id = rows[0].id;
    const { rows: retrieved } = await pool.query(
      `SELECT * FROM proposal WHERE id = $1`, [id],
    );
    assert.strictEqual(retrieved.length, 1);
    assert.strictEqual(retrieved[0].title, 'Test Proposal');
    assert.strictEqual(retrieved[0].maturity_level, 0);

    // Cleanup
    await pool.query(`DELETE FROM proposal WHERE id = $1`, [id]);
  });

  it('should transition a proposal status', async () => {
    const { rows: created } = await pool.query(
      `INSERT INTO proposal (title, proposal_type, status) VALUES ($1, $2, $3) RETURNING id`,
      ['Transition Test', 'RFC', 'DRAFT'],
    );
    const { rows: updated } = await pool.query(
      `UPDATE proposal SET status = 'REVIEW', updated_at = NOW() WHERE id = $1 RETURNING status`,
      [created[0].id],
    );
    assert.strictEqual(updated[0].status, 'REVIEW');
    await pool.query(`DELETE FROM proposal WHERE id = $1`, [created[0].id]);
  });

  it('should support JSONB tags', async () => {
    const { rows } = await pool.query(
      `INSERT INTO proposal (title, proposal_type, tags) VALUES ($1, $2, $3::jsonb) RETURNING tags`,
      ['Tagged Proposal', 'TECHNICAL', '{"priority": "high", "team": "agents"}'],
    );
    assert.strictEqual(rows[0].tags.priority, 'high');
    const id = rows[0].id;
    await pool.query(`DELETE FROM proposal WHERE id = $1`, [id]);
  });
});

describe('4-Layer Agent Memory', () => {
  it('should store and retrieve memory entries', async () => {
    await pool.query(
      `INSERT INTO agent_memory (agent_identity, layer, key, value) VALUES ($1, $2, $3, $4)`,
      ['Carter', 'identity', 'name', 'Carter - AI Assistant'],
    );
    const { rows } = await pool.query(
      `SELECT value FROM agent_memory WHERE agent_identity = $1 AND layer = $2 AND key = $3`,
      ['Carter', 'identity', 'name'],
    );
    assert.strictEqual(rows[0].value, 'Carter - AI Assistant');
    await pool.query(
      `DELETE FROM agent_memory WHERE agent_identity = 'Carter' AND layer = 'identity' AND key = 'name'`,
    );
  });

  it('should list memory by layer', async () => {
    const layers = ['identity', 'constitution', 'project', 'task'];
    for (const layer of layers) {
      await pool.query(
        `INSERT INTO agent_memory (agent_identity, layer, key, value) VALUES ($1, $2, $3, $4)`,
        ['TestAgent', layer, `test_${layer}`, `value_${layer}`],
      );
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT layer FROM agent_memory WHERE agent_identity = 'TestAgent' ORDER BY layer`,
    );
    assert.strictEqual(rows.length, 4);
    await pool.query(`DELETE FROM agent_memory WHERE agent_identity = 'TestAgent'`);
  });
});

describe('Message Ledger', () => {
  it('should store and retrieve messages', async () => {
    await pool.query(
      `INSERT INTO message_ledger (from_agent, to_agent, channel, message_content, message_type)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Carter', 'Andy', '#general', 'Hello!', 'text'],
    );
    const { rows } = await pool.query(
      `SELECT from_agent, to_agent, channel, message_content FROM message_ledger
       WHERE from_agent = 'Carter' ORDER BY created_at DESC LIMIT 1`,
    );
    assert.strictEqual(rows[0].message_content, 'Hello!');
    assert.strictEqual(rows[0].channel, '#general');
    await pool.query(`DELETE FROM message_ledger WHERE from_agent = 'Carter' AND message_content = 'Hello!'`);
  });
});

describe('Spending Caps', () => {
  it('should set and check spending cap', async () => {
    await pool.query(
      `INSERT INTO spending_caps (agent_identity, daily_limit_usd, total_spent_today_usd)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      ['TestAgent', 10.00, 0],
    );
    const { rows } = await pool.query(
      `SELECT daily_limit_usd, is_frozen FROM spending_caps WHERE agent_identity = 'TestAgent'`,
    );
    assert.strictEqual(parseFloat(rows[0].daily_limit_usd), 10.00);
    assert.strictEqual(rows[0].is_frozen, false);
    await pool.query(`DELETE FROM spending_caps WHERE agent_identity = 'TestAgent'`);
  });
});

describe('Team Management', () => {
  it('should create a team and add members', async () => {
    await pool.query(
      `INSERT INTO team (team_name, team_type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      ['TestTeam', 'squad'],
    );
    const { rows: team } = await pool.query(`SELECT id FROM team WHERE team_name = $1`, ['TestTeam']);
    const teamId = team[0].id;

    await pool.query(
      `INSERT INTO team_member (team_id, agent_id, role)
       VALUES ($1, (SELECT id FROM agent_registry WHERE agent_identity = 'Carter'), $2)`,
      [teamId, 'developer'],
    );

    const { rows: members } = await pool.query(
      `SELECT ar.agent_identity, tm.role FROM team_member tm JOIN agent_registry ar ON tm.agent_id = ar.id WHERE tm.team_id = $1`,
      [teamId],
    );
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].agent_identity, 'Carter');
    assert.strictEqual(members[0].role, 'developer');

    await pool.query(`DELETE FROM team_member WHERE team_id = $1`, [teamId]);
    await pool.query(`DELETE FROM team WHERE id = $1`, [teamId]);
  });
});
