// sdb-sdk-loader.ts - Connect to SDB directly (port 3000)

import type { Proposal, Directive } from "../types/index.ts";
import { getSdbConfig, querySdbSync } from "./sdb-client.ts";
import { AcceptanceCriteriaManager, extractStructuredSection } from "../markdown/structured-sections.ts";
import WebSocket from "ws";

export interface SdbData {
    proposals: Proposal[];
    directives: Directive[];
}

export type SdbUpdateCallback = (data: SdbData) => void;

export async function connectSdb(): Promise<any> {
    return { isActive: true };
}

/** Convert microsecond timestamp to milliseconds */
function toMs(timestamp: any): number {
  if (!timestamp) return 0;
  const num = Number(timestamp);
  if (num > 1e15) return Math.floor(num / 1000);
  return num;
}

export async function getSdbData(): Promise<SdbData> {
    if (process.env.DEBUG) {
        console.log("[DEBUG] getSdbData: Fetching proposals from SDB...");
    }

    try {
        const rows = querySdbSync("SELECT * FROM step");
        
        const proposals: Proposal[] = rows.map((row: any) => {
            const id = String(row.display_id || row.id);
            const rawStatus = row.status || "Proposal";
            const statusMap: Record<string, string> = { "Potential": "Proposal", "Reached": "Complete", "draft": "Draft", "Abandoned": "Rejected" };
            const status = statusMap[rawStatus] || rawStatus;
            const bodyText = String(row.body || "");

            const rawAcceptanceCriteria = String(row.acceptance_criteria || "");
            const acceptanceCriteriaItems = rawAcceptanceCriteria 
                ? AcceptanceCriteriaManager.parseAllCriteria(rawAcceptanceCriteria)
                : AcceptanceCriteriaManager.parseAllCriteria(bodyText);

            return {
                id,
                title: String(row.title),
                status: status as any,
                priority: (row.priority || "medium") as Proposal["priority"],
                assignee: row.assignee ? String(row.assignee).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
                labels: row.labels ? String(row.labels).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
                dependencies: row.dependencies ? String(row.dependencies).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
                description: String(row.description || "") || extractStructuredSection(bodyText, "description") || "",
                implementationPlan: extractStructuredSection(bodyText, "implementationPlan") || undefined,
                implementationNotes: String(row.implementation_notes || "") || extractStructuredSection(bodyText, "implementationNotes") || "",
                finalSummary: String(row.final_summary || "") || extractStructuredSection(bodyText, "finalSummary") || "",
                body: bodyText,
                acceptanceCriteriaItems,
                createdDate: row.created_at ? new Date(toMs(row.created_at)).toISOString() : new Date().toISOString(),
                updatedDate: row.updated_at ? new Date(toMs(row.updated_at)).toISOString() : new Date().toISOString(),
            };
        });

        if (process.env.DEBUG) {
            console.log(`[DEBUG] getSdbData: Found ${proposals.length} proposals`);
        }

        return { proposals, directives: [] };
    } catch (err: any) {
        if (process.env.DEBUG) {
            console.error(`[DEBUG] getSdbData Error: ${err.message}`);
        }
        throw err;
    }
}

// Global error handler to catch Node 24 native WebSocket fetch failed throws
// This prevents the entire TUI from crashing if a native websocket is used somewhere
if (typeof process !== "undefined" && typeof process.on === "function") {
    process.on("unhandledRejection", (reason: any) => {
        if (reason && reason.message && reason.message.includes("fetch failed")) {
            if (process.env.DEBUG) {
                console.error("[DEBUG] Caught unhandled 'fetch failed' rejection (likely from native WebSocket).");
            }
        } else {
            // Re-throw if it's something else
            throw reason;
        }
    });
}

export function subscribeSdb(callback: SdbUpdateCallback): () => void {
    let closed = false;
    let ws: any = null;
    let pollInterval: any = null;

    function startPolling() {
        if (closed || pollInterval) return;
        if (process.env.DEBUG) console.log("[DEBUG] SDB falling back to polling mode...");
        pollInterval = setInterval(() => {
            if (closed) return;
            getSdbData().then(callback).catch(e => {
                if (process.env.DEBUG) console.error("[DEBUG] Polling update failed", e);
            });
        }, 5000);
    }

    async function connect() {
        if (closed) return;
        const config = await getSdbConfig();
        
        const WebSocketClient = WebSocket || (globalThis as any).WebSocket;

        if (!WebSocketClient) {
            console.error("WebSocket client not available, using polling fallback.");
            startPolling();
            return;
        }

        try {
            ws = new WebSocketClient(config.wsUri, "v1.json.spacetimedb");
        } catch (e: any) {
            if (process.env.DEBUG) {
                console.error(`[DEBUG] Failed to initialize WebSocket: ${e.message}`);
            }
            startPolling();
            return;
        }
        
        ws.on("open", () => {
            if (process.env.DEBUG) {
                console.log(`[DEBUG] SDB WS Connected: ${config.wsUri}`);
            }
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }
            // Send initial subscription
            ws.send(JSON.stringify({
                subscribe: {
                    query_strings: ["SELECT * FROM step", "SELECT * FROM msg"]
                }
            }));
        });

        ws.on("message", (msg: any) => {
            try {
                const data = JSON.parse(msg.toString());
                if (data.SubscriptionUpdate) {
                    getSdbData().then(callback).catch(e => {
                        if (process.env.DEBUG) console.error("[DEBUG] Callback update failed", e);
                    });
                }
            } catch (e) {}
        });

        ws.on("error", (err: any) => {
            if (process.env.DEBUG) {
                console.error("[DEBUG] SDB WS Error:", err.message);
            }
            startPolling();
        });

        ws.on("close", () => {
            if (!closed) {
                startPolling();
                setTimeout(connect, 5000);
            }
        });
    }

    connect().catch(e => {
        if (process.env.DEBUG) console.error("[DEBUG] SDB Connect setup failed:", e);
        startPolling();
    });

    return () => {
        closed = true;
        if (ws) {
            try { ws.close(); } catch(e) {}
        }
        if (pollInterval) {
            clearInterval(pollInterval);
        }
    };
}
