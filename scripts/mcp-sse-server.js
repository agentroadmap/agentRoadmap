import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const serverModule = await import('../src/mcp/server.ts');
const { createMcpServer } = serverModule.default;

const app = express();
const server = await createMcpServer(projectRoot);

let sseTransport;

app.get('/sse', async (req, res) => {
  console.log('[MCP] New SSE connection request');
  sseTransport = await server.createSseTransport('/messages', res);
  
  res.on('close', () => {
    console.log('[MCP] SSE connection closed');
    sseTransport = null;
  });
});

app.post('/messages', express.json(), async (req, res) => {
  if (sseTransport) {
    await server.handleSseMessage(sseTransport, req.body);
    res.status(200).send('OK');
  } else {
    res.status(400).send('No active SSE connection');
  }
});

const port = process.env.MCP_PORT || 6421;
app.listen(port, '0.0.0.0', () => {
  console.log('[MCP] Roadmap.md SSE Server listening on port ' + port);
  console.log('[MCP] SSE Endpoint: http://localhost:' + port + '/sse');
  console.log('[MCP] Message Endpoint: http://localhost:' + port + '/messages');
});
