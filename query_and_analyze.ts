import { Hive } from './src/hive';

async function main() {
  const hive = new Hive();
  
  try {
    // Get all proposals with extended limit
    const result = await hive.proposal.list({
      limit: 500,
      offset: 0
    });
    
    console.log('=== PROPOSAL PIPELINE AUDIT ===\n');
    console.log(`Total proposals: ${result.total}`);
    console.log(`Returned: ${result.returned}`);
    console.log(`Truncated: ${result.truncated}\n`);
    
    // Analyze by status
    const byStatus = {};
    const byMaturity = {};
    const byType = {};
    const byTypeAndStatus = {};
    const obsoleteProps = [];
    const archProps = [];
    
    for (const prop of result.items) {
      byStatus[prop.status] = (byStatus[prop.status] || 0) + 1;
      byMaturity[prop.maturity] = (byMaturity[prop.maturity] || 0) + 1;
      byType[prop.type] = (byType[prop.type] || 0) + 1;
      
      const key = `${prop.type}/${prop.status}`;
      byTypeAndStatus[key] = (byTypeAndStatus[key] || 0) + 1;
      
      if (prop.maturity === 'obsolete') {
        obsoleteProps.push(prop);
      }
      if (prop.type === 'architecture') {
        archProps.push(prop);
      }
    }
    
    console.log('=== BY STATUS ===');
    Object.entries(byStatus).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      console.log(`  ${k}: ${v}`);
    });
    
    console.log('\n=== BY MATURITY ===');
    Object.entries(byMaturity).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      console.log(`  ${k}: ${v}`);
    });
    
    console.log('\n=== BY TYPE ===');
    Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      console.log(`  ${k}: ${v}`);
    });
    
    console.log('\n=== BY TYPE/STATUS (TOP 20) ===');
    Object.entries(byTypeAndStatus).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => {
      console.log(`  ${k}: ${v}`);
    });
    
    console.log(`\n=== OBSOLETE PROPOSALS ===`);
    console.log(`Count: ${obsoleteProps.length}`);
    console.log('Sample:');
    obsoleteProps.slice(0, 10).forEach(p => {
      console.log(`  ${p.display_id} ${p.title}`);
    });
    
    console.log(`\n=== ARCHITECTURE PROPOSALS (Foundation) ===`);
    archProps.forEach(p => {
      console.log(`  ${p.display_id} [${p.status}/${p.maturity}] ${p.title}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
