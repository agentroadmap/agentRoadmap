# Proposal: ClawHub Architecture (Low Priority)

## Source
Discussion: #chart 2026-03-31
Analysis: `roadmap/docs/messaging_analysis_20260331.md`
Priority: Low
Status: Proposal

## Problem
Currently cubics are tightly coupled to the host OpenClaw gateway. Can't scale beyond one machine. Need a central coordination hub that works with any agent type (OpenClaw native, Gemini, Claude, etc.).

## Vision
ClawHub = the orchestration brain for a multi-machine, multi-provider agent fleet.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  ClawHub                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ MCP 40+  │  │SpacetimeDB│ │Config Vault│  │
│  │ tools    │  │(state,msg)│ │(keys,model)│  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│  Gateway: WebSocket (local) + Tunnel (ext.)  │
└─────────────────────────────────────────────┘
         ▲              ▲              ▲
    ┌────┴───┐     ┌────┴───┐     ┌────┴────┐
    │Cubic-1 │     │Cubic-2 │     │Cubic-N  │
    │(local) │     │(local) │     │(remote) │
    └────────┘     └────────┘     └─────────┘
```

## Key Principles
- **Cubics are disposable** — any machine, any cloud, just needs MCP_URL + SDB_URL
- **Config fetched at boot** — never bake API keys into images
- **OpenClaw as transport** — use `openclaw-acp` for lightweight sessions, not full gateway
- **SpacetimeDB as state** — persistent team channels, work claiming, coordination
- **Bridge Pattern** — OpenClaw = radio (how), ClawHub = studio (what/why)

## Components to Build
- [ ] ClawHub Docker image (MCP + SpacetimeDB + Config Vault)
- [ ] Self-contained cubic image with `openclaw-acp`
- [ ] Config API (model, keys, agent profiles)
- [ ] Gateway tunnel for external cubics (Tailscale/WireGuard)
- [ ] Docker Compose one-command deploy (`clawhub up`)
- [ ] TOOLS.md auto-generation from active MCP servers

## Multi-Provider Support
- OpenClaw native cubics: `sessions_send()` direct
- External AI (Gemini, Claude): REST/webhook adapter layer
- All agents register with ClawHub SpacetimeDB

## Dependencies
- Fully isolated cubic (prerequisite)
- OpenClaw `openclaw-acp` CLI availability
- SpacetimeDB schema for agent registration + work claiming

## Deployment Path
- Primary: Docker Compose (`docker compose up clawhub`)
- Advanced: Systemd (single-machine setups)
- External: Tailscale/WireGuard for multi-machine

## Notes
- Deferred until core product is stable
- Reference: roadmap/docs/messaging_analysis_20260331.md
