/**
 * roadmap state-machine — manage orchestrator, gate-pipeline, and agency lifecycle
 *
 * Usage:
 *   roadmap state-machine start        # Start orchestrator + gate-pipeline
 *   roadmap state-machine stop         # Stop both
 *   roadmap state-machine status       # Show service status + offer stats
 *   roadmap state-machine register     # Register this host as an agency
 *   roadmap state-machine agencies     # List registered agencies
 *   roadmap state-machine offers       # List open/active offers
 */

import { execSync } from "child_process";

const SERVICES = [
  { name: "agenthive-orchestrator", label: "Orchestrator" },
  { name: "agenthive-gate-pipeline", label: "Gate Pipeline" },
];

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 10_000 }).trim();
  } catch {
    return "";
  }
}

function serviceStatus(name: string): string {
  const out = run(`systemctl is-active ${name} 2>/dev/null`);
  return out || "unknown";
}

export function registerStateMachineCommand(program: any) {
  const sm = program
    .command("state-machine")
    .alias("sm")
    .description("Manage AgentHive state machine (orchestrator + gate-pipeline)");

  sm.command("start")
    .description("Start orchestrator and gate-pipeline services")
    .action(() => {
      for (const svc of SERVICES) {
        const status = serviceStatus(svc.name);
        if (status === "active") {
          console.log(`  ${svc.label}: already running`);
        } else {
          console.log(`  ${svc.label}: starting...`);
          run(`sudo systemctl start ${svc.name}`);
          const newStatus = serviceStatus(svc.name);
          console.log(`  ${svc.label}: ${newStatus}`);
        }
      }
    });

  sm.command("stop")
    .description("Stop orchestrator and gate-pipeline services")
    .action(() => {
      for (const svc of SERVICES) {
        console.log(`  ${svc.label}: stopping...`);
        run(`sudo systemctl stop ${svc.name}`);
        console.log(`  ${svc.label}: ${serviceStatus(svc.name)}`);
      }
    });

  sm.command("restart")
    .description("Restart orchestrator and gate-pipeline services")
    .action(() => {
      for (const svc of SERVICES) {
        console.log(`  ${svc.label}: restarting...`);
        run(`sudo systemctl restart ${svc.name}`);
        console.log(`  ${svc.label}: ${serviceStatus(svc.name)}`);
      }
    });

  sm.command("status")
    .description("Show service status and offer/dispatch stats")
    .action(async () => {
      // Service status
      console.log("Services:");
      for (const svc of SERVICES) {
        const status = serviceStatus(svc.name);
        const icon = status === "active" ? "✓" : "✗";
        console.log(`  ${icon} ${svc.label}: ${status}`);
      }

      // DB stats
      const pgPass = process.env.PG_PASSWORD || "";
      const psql = `PGPASSWORD=${pgPass} psql -h 127.0.0.1 -U admin -d agenthive -t -c`;

      console.log("\nAgencies:");
      const agencies = run(`${psql} "SELECT agent_identity || ' (' || agent_type || ', ' || status || ')' FROM roadmap_workforce.agent_registry ORDER BY agent_identity;"`);
      if (agencies) {
        for (const line of agencies.split("\n").filter(Boolean)) {
          console.log(`  ${line.trim()}`);
        }
      } else {
        console.log("  (none)");
      }

      console.log("\nOffers:");
      const offers = run(`${psql} "SELECT offer_status || ': ' || count(*) FROM roadmap_workforce.squad_dispatch GROUP BY offer_status ORDER BY offer_status;"`);
      if (offers) {
        for (const line of offers.split("\n").filter(Boolean)) {
          console.log(`  ${line.trim()}`);
        }
      }

      console.log("\nActive dispatches:");
      const active = run(`${psql} "SELECT id || ': ' || dispatch_role || ' @ ' || COALESCE(worker_identity, 'unassigned') || ' (' || offer_status || ')' FROM roadmap_workforce.squad_dispatch WHERE offer_status IN ('open','claimed','active') ORDER BY id DESC LIMIT 10;"`);
      if (active) {
        for (const line of active.split("\n").filter(Boolean)) {
          console.log(`  ${line.trim()}`);
        }
      } else {
        console.log("  (none)");
      }
    });

  sm.command("agencies")
    .description("List registered agencies and their capabilities")
    .action(() => {
      const pgPass = process.env.PG_PASSWORD || "";
      const result = run(
        `PGPASSWORD=${pgPass} psql -h 127.0.0.1 -U admin -d agenthive -c "
          SELECT ar.agent_identity, ar.agent_type, ar.status,
                 COALESCE(string_agg(ac.capability, ', ' ORDER BY ac.capability), 'none') as capabilities
          FROM roadmap_workforce.agent_registry ar
          LEFT JOIN roadmap_workforce.agent_capability ac ON ac.agent_id = ar.id
          GROUP BY ar.id, ar.agent_identity, ar.agent_type, ar.status
          ORDER BY ar.agent_identity;"`
      );
      console.log(result || "No agencies registered.");
    });

  sm.command("offers")
    .description("List open and active offers")
    .action(() => {
      const pgPass = process.env.PG_PASSWORD || "";
      const result = run(
        `PGPASSWORD=${pgPass} psql -h 127.0.0.1 -U admin -d agenthive -c "
          SELECT id, proposal_id, dispatch_role, offer_status,
                 COALESCE(agent_identity, '-') as agency,
                 COALESCE(worker_identity, '-') as worker,
                 required_capabilities
          FROM roadmap_workforce.squad_dispatch
          WHERE offer_status IN ('open','claimed','active')
          ORDER BY id;"`
      );
      console.log(result || "No open/active offers.");
    });
}
