# Strategic Analysis: sdb (SpacetimeDB) Data Migration & Structured Model

**Date:** 2026-03-25  
**Domain:** Product Lifecycle Persistence & Real-time Neural Core  
**Platform:** sdb (SpacetimeDB)

---

## 1. Vision: From Markdown Files to Structured Neural Core

The transition to **sdb** (SpacetimeDB) represents more than a database migration; it is the transition from an "asynchronous, file-based" coordination model to a "real-time, transactional" neural core. This enables the **Cubic Architecture** to function with sub-100ms latency across isolated sandboxes.

## 2. Structured Domain: Roadmap & Product Evolution

To capture the journey from **Seed Inspiration** to **Vision Achievement**, the following structured models are required.

### 2.1 Product Composition & Components
Defines *what* the product is, organized by hierarchical components.

| Table | Purpose | Key Fields |
|---|---|---|
| `component` | High-level product modules (e.g., "Web UI", "MCP Engine") | `id`, `name`, `parentId`, `description`, `ownerAgentId` |
| `state` | Evolution nodes (the "how" and "when") | `id`, `title`, `componentId`, `status`, `priority`, `milestone`, `body` |
| `state_dependency` | The DAG edges | `parentStateId`, `childStateId`, `type` (hard/soft) |

### 2.2 Evolution & Implementation History
Captures the detailed history of every state, from design to coding to testing.

| Table | Purpose | Key Fields |
|---|---|---|
| `state_history` | Snapshots of state changes | `stateId`, `timestamp`, `agentId`, `diff`, `statusFrom`, `statusTo` |
| `acceptance_criterion` | Verifiable goals | `id`, `stateId`, `description`, `verified`, `verifiedBy`, `verifiedAt` |
| `decision` | ADRs (Architectural Decision Records) | `id`, `title`, `context`, `decision`, `consequences`, `relatedStateId` |
| `artifact` | Links to code, docs, or logs | `id`, `stateId`, `type` (code/doc/log), `uri`, `hash`, `agentId` |
| `audit_review` | Peer & PM "Guidance" | `id`, `stateId`, `auditorId`, `verdict` (feedback/guidance), `notes` |

### 2.3 Verification & Testing
Detailed history of the quality signals.

| Table | Purpose | Key Fields |
|---|---|---|
| `test_case` | Test definitions | `id`, `stateId`, `name`, `category`, `codePath` |
| `test_result` | Execution history | `id`, `testCaseId`, `passed`, `duration`, `logs`, `timestamp`, `agentId` |

## 3. Structured Domain: Real-time Messaging Engine

To support the **Utility Belt** (CLI/MCP) and **Socket-based** interaction (Docker/Podman), the messaging engine must be high-frequency and multi-channel.

### 3.1 Communication Schema

| Table | Purpose | Key Fields |
|---|---|---|
| `channel` | Scoped contexts for talk | `id`, `name`, `type` (public/group/private), `metadata` |
| `message` | Atomic communication unit | `id`, `channelId`, `fromAgentId`, `toAgentId`, `body`, `timestamp` |
| `presence` | Real-time agent pulse | `agentId`, `status`, `activeStateId`, `connected`, `lastSeen` |
| `mention` | Notification indexing | `messageId`, `targetAgentId`, `readStatus` |

### 3.2 Transport Support
- **CLI/MCP:** Uses standard sdb client subscriptions for instant board/log updates.
- **Docker/Podman:** Cubics connect via WebSocket to the sdb instance, subscribing only to the `channel` and `state` relevant to their phase (Design/Build/Test/Ship).

---

## 4. Implementation Phases (Migration)

### Phase 1: Parallel Write (Shadow Mode)
- Daemon continues writing to `.md` files (source of truth).
- Shadow-writer mirrors all changes to **sdb**.
- Messaging moves to **sdb** primary (real-time chat).

### Phase 2: Dual Authority
- **sdb** becomes primary for `status`, `claims`, and `messages`.
- `.md` files are "projected" (exported) from **sdb** on every commit for Git persistence.
- AC checking and Handoff Protocols (`STATE-094`) run via sdb reducers.

### Phase 3: sdb as Single Source of Truth
- Full structured metadata (Coding history, ADRs, Test results) resides in **sdb**.
- Advanced search and analytics run against sdb.
- High-frequency "Cubic" coordination enabled.

---

## 5. Next Steps
1. **Refine `spacetimedb/src/index.ts`** to match this expanded schema.
2. **Implement `dual-write-adapter`** (`STATE-071`) to begin shadow mode.
3. **Migrate `roadmap talk`** to use sdb `message` table.
