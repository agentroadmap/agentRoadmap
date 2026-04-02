/**
 * SpacetimeDB Direct Client
 * 
 * Communicates with SpacetimeDB via REST (SQL) and WebSocket (Subscription).
 * No dependency on 'spacetime' CLI or bridge service.
 */

import { FileSystem } from "../../file-system/operations.ts";
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore — js-yaml has no type declarations
import { load as parseYaml } from "js-yaml";

export interface SdbConfig {
    host: string;
    port: number;
    dbName: string;
    httpUri: string;
    wsUri: string;
}

export function getSdbConfigSync(): SdbConfig {
    const defaults: SdbConfig = {
        host: "127.0.0.1",
        port: 3000,
        dbName: "roadmap2",
        httpUri: "http://127.0.0.1:3000/v1/database/roadmap2/sql",
        wsUri: "ws://127.0.0.1:3000/v1/database/roadmap2/subscribe"
    };

    try {
        // Try config.yaml first (nested format with database section)
        const yamlPath = join(process.cwd(), "roadmap", "config.yaml");
        if (existsSync(yamlPath)) {
            const content = readFileSync(yamlPath, "utf-8");
            const cfg = parseYaml(content) as any;
            if (cfg?.database) {
                const host = cfg.database.host || defaults.host;
                const port = cfg.database.port || defaults.port;
                const dbName = cfg.database.name || defaults.dbName;
                return {
                    host,
                    port,
                    dbName,
                    httpUri: `http://${host}:${port}/v1/database/${dbName}/sql`,
                    wsUri: `ws://${host}:${port}/v1/database/${dbName}/subscribe`
                };
            }
        }

        // Fallback: parse flat config.yml for database section
        const configPath = join(process.cwd(), "roadmap", "config.yml");
        const content = readFileSync(configPath, "utf-8");

        let host = defaults.host;
        let port = defaults.port;
        let dbName = defaults.dbName;

        const dbSection = content.match(/database:([\s\S]*?)(?=\n\w|$)/);
        if (dbSection) {
            const hMatch = dbSection[1].match(/host:\s*["']?([^"'\n\s]+)["']?/);
            const pMatch = dbSection[1].match(/port:\s*(\d+)/);
            const nMatch = dbSection[1].match(/name:\s*["']?([^"'\n\s]+)["']?/);
            if (hMatch) host = hMatch[1];
            if (pMatch) port = Number.parseInt(pMatch[1], 10);
            if (nMatch) dbName = nMatch[1];
        }
        return {
            host,
            port,
            dbName,
            httpUri: `http://${host}:${port}/v1/database/${dbName}/sql`,
            wsUri: `ws://${host}:${port}/v1/database/${dbName}/subscribe`
        };
    } catch {
        return defaults;
    }
}

export async function getSdbConfig(): Promise<SdbConfig> {
    const defaults: SdbConfig = {
        host: "127.0.0.1",
        port: 3000,
        dbName: "roadmap2",
        httpUri: "http://127.0.0.1:3000/v1/database/roadmap2/sql",
        wsUri: "ws://127.0.0.1:3000/v1/database/roadmap2/subscribe"
    };

    try {
        // Try config.yaml first
        const yamlPath = join(process.cwd(), "roadmap", "config.yaml");
        if (existsSync(yamlPath)) {
            const content = readFileSync(yamlPath, "utf-8");
            const cfg = parseYaml(content) as any;
            if (cfg?.database) {
                const host = cfg.database.host || defaults.host;
                const port = cfg.database.port || defaults.port;
                const dbName = cfg.database.name || defaults.dbName;
                return {
                    host,
                    port,
                    dbName,
                    httpUri: `http://${host}:${port}/v1/database/${dbName}/sql`,
                    wsUri: `ws://${host}:${port}/v1/database/${dbName}/subscribe`
                };
            }
        }

        // Fallback to flat config
        const fs = new FileSystem(process.cwd());
        const config = await fs.loadConfig();

        let host = defaults.host;
        let port = defaults.port;
        let dbName = defaults.dbName;

        if (config?.database?.provider === "spacetime") {
            host = config.database.host || host;
            port = config.database.port || port;
            dbName = config.database.name || dbName;
        }

        return {
            host,
            port,
            dbName,
            httpUri: `http://${host}:${port}/v1/database/${dbName}/sql`,
            wsUri: `ws://${host}:${port}/v1/database/${dbName}/subscribe`
        };
    } catch {
        return defaults;
    }
}

/**
 * Execute a SQL query against SpacetimeDB (Asynchronous).
 */
export async function querySdb(sql: string): Promise<any[]> {
    const config = await getSdbConfig();
    return executeQuery(config.httpUri, sql);
}

/**
 * Execute a SQL query against SpacetimeDB (Synchronous via curl).
 */
export function querySdbSync(sql: string): any[] {
    const config = getSdbConfigSync();
    const tmpFile = join(process.cwd(), `.sdb_query_${Math.random().toString(36).substring(7)}.json`);
    try {
        writeFileSync(tmpFile, sql);
        const cmd = `curl -s -X POST -H \"Content-Type: application/json\" --data-binary \"@${tmpFile}\" \"${config.httpUri}\"`;
        const result = execSync(cmd, { encoding: "utf8", timeout: 15000 });
        try { unlinkSync(tmpFile); } catch {}
        if (!result || result.trim() === "") return [];
        return parseSdbJson(result);
    } catch (e) {
        try { unlinkSync(tmpFile); } catch {}
        return [];
    }
}

/**
 * Call a reducer in SpacetimeDB (Synchronous via curl).
 */
export function callReducerSync(name: string, args: any): boolean {
    const config = getSdbConfigSync();
    const tmpFile = join(process.cwd(), `.sdb_call_${Math.random().toString(36).substring(7)}.json`);
    try {
        const url = config.httpUri.replace('/sql', `/call/${name}`);
        const body = JSON.stringify(args);
        writeFileSync(tmpFile, body);
        
        const result = spawnSync("curl", [
            "-s", "-i", "-X", "POST", 
            "-H", "Content-Type: application/json", 
            "--data-binary", `@${tmpFile}`, 
            url
        ], { encoding: "utf8", timeout: 15000 });
        
        try { unlinkSync(tmpFile); } catch {}
        
        const output = result.stdout || result.stderr || "";
        
        if (output.includes("HTTP/1.1 200") || output.includes("HTTP/1.1 204")) {
            return true;
        } else {
            if (process.env.DEBUG) {
                console.error(`Reducer call ${name} failed response:\n${output}`);
            }
            return false;
        }
    } catch (e: any) {
        try { unlinkSync(tmpFile); } catch {}
        if (process.env.DEBUG) {
            console.error(`Reducer call failed for ${name}: ${e.message}`);
        }
        return false;
    }
}

async function executeQuery(uri: string, sql: string): Promise<any[]> {
    try {
        const response = await fetch(uri, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: sql
        });
        if (!response.ok) return [];
        const result = await response.text();
        return parseSdbJson(result);
    } catch {
        return [];
    }
}

function parseSdbJson(jsonStr: string): any[] {
    try {
        const json = JSON.parse(jsonStr);
        const data = Array.isArray(json) ? json[0] : json;
        if (!data || !data.schema || !data.rows) return [];

        const headers = data.schema.elements.map((el: any) => el.name.some || el.name);
        return data.rows.map((row: any[]) => {
            const obj: any = {};
            headers.forEach((h: string, i: number) => {
                let val = row[i];
                if (Array.isArray(val) && val.length === 2) {
                    if (val[0] === 1) { // some
                        val = val[1];
                        if (Array.isArray(val) && val.length === 0) val = null;
                    } else if (val[0] === 0) { // none
                        val = null;
                    }
                }
                obj[h] = val;
            });
            return obj;
        });
    } catch {
        return [];
    }
}
