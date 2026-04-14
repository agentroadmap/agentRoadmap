// WebSocket Bridge for AgentRoadmap — delegates to the real TypeScript server
// Run with: node scripts/ws-bridge-standalone.js

import { startWebSocketServer } from "../src/apps/dashboard-web/websocket-server.ts";

const port = Number(process.env.WS_PORT) || 3001;
const projectRoot = process.env.PROJECT_ROOT || process.cwd();

startWebSocketServer(port, projectRoot);
