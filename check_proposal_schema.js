const pg = require('/data/code/AgentHive/node_modules/pg');
const c = new pg.Client({
  host: '127.0.0.1',
  port: 5432,
  user: 'admin',
  password: 'YMA3peHGLi6shUTr',
  database: 'agenthive'
});

(async () => {
  try {
    await c.connect();
    
    const cols = await c.query(
      `SELECT column_name, data_type, udt_name 
       FROM information_schema.columns 
       WHERE table_name = 'proposal' 
       ORDER BY ordinal_position`
    );
    console.log("=== proposal table columns ===");
    for (const row of cols.rows) {
      console.log(`  ${row.column_name.padEnd(20)} ${row.data_type.padEnd(15)} ${row.udt_name || ''}`);
    }
    
    console.log("\n=== Test: SELECT WHERE id = 1 (numeric) ===");
    try {
      const r1 = await c.query('SELECT * FROM proposal WHERE id = $1 LIMIT 1', [1]);
      console.log(`  ✅ Found: ${r1.rows[0]?.title || 'none'}`);
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
    
    console.log("\n=== Test: SELECT WHERE display_id = 'P001' ===");
    try {
      const r2 = await c.query("SELECT * FROM proposal WHERE display_id = $1 LIMIT 1", ['P001']);
      console.log(`  ✅ Found: ${r2.rows[0]?.title || 'none'}`);
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
    
    await c.end();
  } catch (e) {
    console.error('❌', e.message);
  }
})();
