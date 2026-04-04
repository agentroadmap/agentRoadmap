const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const outfileIndex = args.indexOf('--outfile');
const outfile = outfileIndex !== -1 ? args[outfileIndex + 1] : 'scripts/cli.cjs';
const outdir = path.dirname(outfile);
const bundleName = path.basename(outfile) + '.js';
const bundlePath = path.join(outdir, bundleName);

console.log('Building ' + outfile + '...');

try {
  fs.mkdirSync(path.join(outdir, 'mcp'), { recursive: true });
  fs.copyFileSync('src/guidelines/agent-guidelines.md', path.join(outdir, 'agent-guidelines.md'));
  fs.copyFileSync('src/guidelines/project-manager-roadmap.md', path.join(outdir, 'project-manager-roadmap.md'));
  fs.copyFileSync('src/guidelines/mcp/agent-nudge.md', path.join(outdir, 'mcp/agent-nudge.md'));

  const mcpFiles = [
    'chat-skill.md', 'init-required.md', 'overview.md', 
    'overview-tools.md', 'proposal-creation.md', 
    'proposal-execution.md', 'proposal-finalization.md'
  ];
  for (const file of mcpFiles) {
    fs.copyFileSync(path.join('src/guidelines/mcp', file), path.join(outdir, file));
  }
} catch (e) {
  console.error('Failed to copy assets:', e.message);
}

try {
  execSync(`bun build src/cli.ts --target=node --outfile="${bundlePath}"`, { stdio: 'inherit' });
  const wrapper = `#!/usr/bin/env node\nimport('./${bundleName}').catch(err => { console.error(err); process.exit(1); });\n`;
  fs.writeFileSync(outfile, wrapper);
  fs.chmodSync(outfile, 0o755);
} catch (e) {
  console.error('Build failed:', e.message);
  process.exit(1);
}
