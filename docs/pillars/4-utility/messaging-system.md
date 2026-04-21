# AgentHive MCP Messaging System

## Overview

The AgentHive MCP messaging system enables real-time agent-to-agent communication via channels and direct messages. Built on PostgreSQL with `pg_notify` for push notifications, it eliminates the need for wasteful polling loops.

**Key Features:**
- Channel-based messaging (broadcast, team, direct)
- Push notifications via `pg_notify` (sub-500ms delivery)
- Subscription-based message routing (only subscribed agents receive)
- Bidirectional direct messaging with content preservation
- Graceful fallback to 5s polling if `pg_notify` unavailable

## Architecture

### Data Flow

```
Agent A → msg_send → message_ledger (INSERT)
                          ↓
                   trg_message_notify (pg_notify)
                          ↓
                   MCP Server Listener
                          ↓
                   channel_subscription lookup
                          ↓
                   Deliver to subscribed agents
```

### Database Components

| Component | Schema | Purpose |
|-----------|--------|---------|
| `message_ledger` | `roadmap` | Durable message store (all messages) |
| `channel_subscription` | `roadmap` | Agent channel subscriptions |
| `trg_message_notify` | `roadmap` | pg_notify trigger on INSERT |
| `fn_notify_new_message()` | `roadmap` | Trigger function |

## MCP Tools

### msg_send

Send a message to a channel or agent.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from_agent` | string | Yes | Sender agent identity (must be in `agent_registry`) |
| `message_content` | string | Yes | Message text |
| `channel` | string | No | Target channel: `direct`, `team:{name}`, `broadcast`, `system` |
| `to_agent` | string | No | Recipient agent identity (for DMs) |
| `message_type` | string | No | `text`, `task`, `notify`, `ack`, `error`, `event` (default: `text`) |
| `proposal_id` | string | No | Link message to a proposal |

**Examples:**
```
# Direct message
msg_send(from_agent="agent-a", to_agent="agent-b", message_content="Ready for review")

# Team channel broadcast
msg_send(from_agent="agent-a", channel="team:dev", message_content="Sprint update: PR merged")

# System notification
msg_send(from_agent="gate-agent", channel="system", message_content="P149 promoted to Mature")
```

### msg_read

Read messages from a channel or as a specific agent.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent` | string | No | Filter messages where agent is recipient |
| `channel` | string | No | Filter by channel |
| `since` | string | No | ISO timestamp — only messages after this time |
| `limit` | int | No | Max messages to return (default: 50) |
| `wait_ms` | int | No | Block up to N ms for new message via pg_notify (0-30000) |

**Push Notification Mode:**
When `wait_ms > 0`, the tool blocks until a `pg_notify` notification arrives or timeout. This eliminates polling — the agent sleeps until a message arrives.

```
# Wait up to 5 seconds for a new message
msg_read(agent="agent-b", wait_ms=5000)

# Returns immediately if message available, blocks if not
msg_read(channel="team:dev", wait_ms=10000)
```

### chan_subscribe

Subscribe or unsubscribe from a channel.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | string | Yes | Agent identity |
| `channel` | string | Yes | Channel to subscribe to |
| `subscribe` | bool | No | `true` (default) to subscribe, `false` to unsubscribe |

**Channel Types:**
- `direct` — receive DMs
- `team:{name}` — receive team channel messages (e.g., `team:dev`, `team:engineering`)
- `broadcast` — receive system-wide announcements
- `system` — receive system notifications

**Examples:**
```
# Subscribe to direct messages
chan_subscribe(from="agent-b", channel="direct")

# Subscribe to team channel
chan_subscribe(from="agent-b", channel="team:dev")

# Unsubscribe
chan_subscribe(from="agent-b", channel="team:dev", subscribe=false)
```

### chan_list

List available channels with message and subscriber counts.

**Returns:**
```
## Available Channels

| Channel | Messages | Subscribers |
|---------|----------|-------------|
| broadcast | 42 | 15 |
| system | 8 | 2 |
| team:dev | 23 | 5 |
| team:engineering | 12 | 3 |
```

### chan_subscriptions

List all subscriptions for an agent.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent` | string | Yes | Agent identity |

**Returns:**
```
## Channel Subscriptions

- **agent-a** → direct (since Mon Apr 13 2026 ...)
- **agent-a** → team:dev (since Mon Apr 13 2026 ...)
- **agent-a** → broadcast (since Mon Apr 13 2026 ...)
```

## pg_notify Implementation

### Trigger: trg_message_notify

Fires after INSERT on `message_ledger`. Sends notification on channel `new_message`.

**Payload (JSON):**
```json
{
  "message_id": 603,
  "from_agent": "agent-a",
  "to_agent": "agent-b",
  "channel": "direct",
  "message_type": "text",
  "proposal_id": null,
  "created_at": "2026-04-21T22:56:13.896329+00"
}
```

### Listener Pattern

The MCP server subscribes to `pg_notify('new_message')` and routes notifications to matching subscribers in `channel_subscription`. This mirrors the proven gate pipeline pattern (`trg_gate_ready` → PipelineCron).

### Fallback

If `pg_notify` connection is unavailable:
1. Log warning: `"pg_notify unavailable, falling back to 5s polling"`
2. `msg_read` with `wait_ms` degrades to 5-second polling loop
3. No messages lost — `message_ledger` is durable

## Schema Reference

### channel_subscription

```sql
CREATE TABLE roadmap.channel_subscription (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_identity  TEXT NOT NULL REFERENCES agent_registry(agent_identity) ON DELETE CASCADE,
    channel         TEXT NOT NULL,
    subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT channel_subscription_unique UNIQUE (agent_identity, channel),
    CONSTRAINT channel_subscription_channel_check CHECK (channel ~ '^(direct|team:.+|broadcast|system)$')
);
```

### message_ledger

```sql
CREATE TABLE roadmap.message_ledger (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_agent      TEXT NOT NULL REFERENCES agent_registry(agent_identity),
    to_agent        TEXT REFERENCES agent_registry(agent_identity),
    channel         TEXT,
    message_type    TEXT DEFAULT 'text',
    message_content TEXT,
    proposal_id     BIGINT REFERENCES proposal(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at         TIMESTAMPTZ,
    reply_to        BIGINT,
    metadata        JSONB DEFAULT '{}',
    CONSTRAINT message_ledger_channel_check CHECK (channel ~ '^(direct|team:.+|broadcast|system)$'),
    CONSTRAINT message_ledger_type_check CHECK (message_type IN ('text', 'task', 'notify', 'ack', 'error', 'event'))
);
```

## Acceptance Criteria (Verified)

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | `channel_subscription` table with FK, UNIQUE constraint, indexes | ✓ |
| AC-2 | `chan_subscribe` MCP tool for subscribe/unsubscribe | ✓ |
| AC-3 | `pg_notify` trigger on `message_ledger` INSERT (<500ms delivery) | ✓ |
| AC-4 | `msg_read` supports `wait_ms` parameter (0-30000) | ✓ |
| AC-5 | Fallback to 5s polling with logged warning | ✓ |
| AC-6 | Bidirectional DM delivery with content preserved | ✓ |
| AC-7 | Full A→B→A round-trip within 10 seconds | ✓ |
| AC-8 | Push notification on DM (wait_ms returns <500ms) | ✓ |
| AC-9 | Channel broadcast to subscribers only | ✓ |
| AC-10 | No blast — unsubscribed agents don't see DMs | ✓ |
| AC-11 | Content preserved end-to-end (non-null) | ✓ |
| AC-12 | E2E test script for CI | ✓ |

## Agent Registration

Before using messaging, agents must be registered in `agent_registry`:

```sql
INSERT INTO roadmap.agent_registry (agent_identity, agent_type, role, status)
VALUES ('my-agent', 'ai', 'worker', 'active')
ON CONFLICT (agent_identity) DO NOTHING;
```

Or via MCP agent tools.

## Common Patterns

### Real-time DM between two agents

```
# Agent A subscribes to direct
chan_subscribe(from="agent-a", channel="direct")

# Agent B subscribes to direct
chan_subscribe(from="agent-b", channel="direct")

# Agent A sends DM
msg_send(from_agent="agent-a", to_agent="agent-b", message_content="Ready for review")

# Agent B receives via push (no polling needed)
msg_read(agent="agent-b", wait_ms=5000)
```

### Team channel discussion

```
# Both agents subscribe to team channel
chan_subscribe(from="agent-a", channel="team:dev")
chan_subscribe(from="agent-b", channel="team:dev")

# Agent A posts update
msg_send(from_agent="agent-a", channel="team:dev", message_content="PR #42 merged")

# Agent B receives notification
msg_read(channel="team:dev", wait_ms=5000)
```

### Gate pipeline notification

```
# Gate agent subscribes to system channel
chan_subscribe(from="gate-agent", channel="system")

# When proposal matures, system sends notification
msg_send(from_agent="orchestrator", channel="system",
         message_content="P149 promoted to Mature", message_type="notify")

# Gate agent wakes up and processes
msg_read(agent="gate-agent", wait_ms=10000)
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Message content is null | Using `message` param instead of `message_content` | Use `message_content` in msg_send |
| Agent not receiving | Not subscribed to channel | Call `chan_subscribe` first |
| Slow message delivery | pg_notify fallback active | Check PostgreSQL LISTEN/NOTIFY status |
| "null value violates not-null constraint" | Agent not in `agent_registry` | Register agent first |
| "Proposal undefined not found" | MCP prop_get bug | Use psql for direct reads |

## Related Proposals

| Proposal | Feature |
|----------|---------|
| P149 | Channel subscription and push notifications |
| P050 | DAG dependency engine |
| P063 | Fleet observability (spending, heartbeats) |

## Files

| File | Purpose |
|------|---------|
| `src/apps/mcp-server/tools/messages/pg-handlers.ts` | Postgres message handlers |
| `src/apps/mcp-server/tools/messages/index.ts` | MCP tool registration |
| `database/ddl/roadmap-ddl-v3.sql` | Schema DDL |
| `tests/e2e/mcp-messages.test.ts` | E2E messaging tests |
