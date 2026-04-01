import WebSocket from "ws";

// Force polyfill global WebSocket using 'ws' package before SpacetimeDB loads.
// Node 24's native WebSocket has compatibility issues with the SpacetimeDB server.
if (typeof globalThis !== "undefined") {
    (globalThis as any).WebSocket = WebSocket;
}
