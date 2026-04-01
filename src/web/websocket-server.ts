/**
 * WebSocket Bridge for Board ↔ SpacetimeDB
 * Provides real-time updates and live proposal changes from SDB subscriptions!
 * Adapting to v2.5 data model. No more polling!
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { getSdbConfigSync } from '../core/storage/sdb-client.ts';
import { DbConnection } from '../bindings/index.ts';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

// Keep track of the latest SDB connection
let sdbConnection: DbConnection | null = null;

export function startWebSocketServer(port: number = 3001): void {
  const server = createServer();
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log('[WS] Client connected');

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleMessage(ws, msg);
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log('[WS] Client disconnected');
    });

    ws.send(JSON.stringify({ type: 'connected', message: 'Connected to SpacetimeDB Bridge' }));
    
    // Send initial snapshot if connected
    if (sdbConnection) {
        sendSnapshot(ws);
    }
  });

  server.listen(port, () => {
    console.log(`[WS] WebSocket server running on port ${port}`);
  });

  // Start live subscription to SDB
  connectToSpacetimeDB();
}

function connectToSpacetimeDB() {
    const config = getSdbConfigSync();
    
    const conn = DbConnection.builder()
        .withUri(`ws://${config.host}:${config.port}`)
        .withModuleName(config.dbName)
        .build();
    sdbConnection = conn;

    // @ts-expect-error: onConnect is available at runtime but typed as private
    conn.onConnect(() => {
        console.log('[SDB] Connected to live SpacetimeDB module!');
    });
    
    // @ts-expect-error: onConnectError is available at runtime but typed as private
    conn.onConnectError((err: unknown) => {
        console.error('[SDB] Connection Error:', err);
    });

    // Wire SDB table events to WS broadcast
    // @ts-expect-error: db bindings may lag behind schema
    conn.db.proposal?.onInsert((ctx: unknown, row: unknown) => {
        broadcast({ type: 'proposalUpdated', data: row });
    });
    // @ts-expect-error: db bindings may lag behind schema
    conn.db.proposal?.onUpdate((ctx: unknown, oldRow: unknown, newRow: unknown) => {
        broadcast({ type: 'proposalUpdated', data: newRow });
    });
    // @ts-expect-error: db bindings may lag behind schema
    conn.db.proposal?.onDelete((ctx: unknown, row: unknown) => {
        broadcast({ type: 'proposalDeleted', data: { id: (row as any).id } });
    });
    
    // @ts-expect-error: db bindings may lag behind schema
    conn.db.message_ledger?.onInsert((ctx: unknown, row: unknown) => {
        const r = row as any;
        broadcast({ type: 'newMessage', data: row, channel: r.channel_name });
    });

    sdbConnection.subscriptionBuilder()
        .onApplied(() => {
            console.log('[SDB] Subscription applied! Live data active.');
            clients.forEach(ws => sendSnapshot(ws));
        })
        .subscribe([
            "SELECT * FROM proposal",
            "SELECT * FROM message_ledger",
            "SELECT * FROM agent_memory"
        ]);
}

function sendSnapshot(ws: WebSocket) {
    if (!sdbConnection) return;
    const proposals = Array.from(sdbConnection.db.proposal.iter());
    ws.send(JSON.stringify({ type: 'proposals', data: proposals }));
}

async function handleMessage(ws: WebSocket, msg: any): Promise<void> {
  switch (msg.type) {
    case 'getProposals':
      sendSnapshot(ws);
      break;

    case 'getProposal':
      if (sdbConnection) {
        const proposal = sdbConnection.db.proposal.id.find(msg.id);
        ws.send(JSON.stringify({ type: 'proposal', data: proposal || null }));
      }
      break;

    case 'getCubics':
    case 'getAgents':
    case 'getEvents':
    case 'getChannels':
      // Temporary stub for removed legacy models
      ws.send(JSON.stringify({ type: msg.type.replace('get', '').toLowerCase(), data: [] }));
      break;

    case 'getMessages':
      if (sdbConnection) {
        const msgs = Array.from(sdbConnection.db.message_ledger.iter()).filter(m => m.channel_name === msg.channel);
        ws.send(JSON.stringify({ type: 'messages', data: msgs, channel: msg.channel }));
      }
      break;

    case 'createProposal':
      if (sdbConnection) {
        try {
          sdbConnection.reducers.createProposal(msg.data.id, msg.data.title, msg.data.body || '');
          ws.send(JSON.stringify({ type: 'proposalCreated', id: msg.data.id }));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: `Failed to create proposal: ${errorMsg}`,
            code: 'PROPOSAL_CREATE_FAILED'
          }));
        }
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'No SDB connection', code: 'NO_SDB' }));
      }
      break;

    case 'subscribe':
      ws.send(JSON.stringify({ type: 'subscribed', channel: msg.channel }));
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

function broadcast(data: any): void {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
