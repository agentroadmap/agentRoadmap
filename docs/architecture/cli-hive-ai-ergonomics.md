> **Type:** design note | architecture  
> **MCP-tracked:** P306 (AI-agent ergonomics layer for `hive` CLI)  
> **Source-of-truth:** This document
> **Status:** Draft, informing parallel Software Architect work on command tree and Backend Architect work on system ops

## Overview

The legacy `roadmap` CLI was designed for humans first — every status check, proposal CRUD, and audit requires parsing human-formatted text or running multiple sequential commands. AI agents (Claude Code, Codex, Hermes, Copilot, Aider, Cursor) now use AgentHive daily, but the CLI forces them into inefficient workflows: 5 round-trips to see a proposal's full state, JSON parsing of grep output, error recovery via retry loops, and context loss between commands.

The new `hive` CLI **inverts the priority: AI agents are first-class citizens**. Every command provides:
- Structured output (JSON, JSONL, YAML) with a stable envelope and versioned schema
- Machine-readable discovery (command tree, recipes, decision support)
- Idempotency and batch-friendly flags
- Concurrency hints and lease semantics
- Token-economy patterns designed for AI context windows

This document specifies the cross-cutting AI-ergonomics layer. The Software Architect specifies the command tree shape; the Backend Architect covers system-ops commands; this layer provides the universal behavioral contract that makes every command usable by AI agents with minimal overhead.

---

## 1. Universal AI-Agent Output Contract

### 1.1 Format Support

Every command must support:

```
--format text       # Default for humans; plain text, rewrapped to terminal width
--format json       # Single record or array, with universal envelope and versioning
--format jsonl      # Newline-delimited JSON, for streams and large lists
--format yaml       # Human-edit-friendly for some outputs (e.g., context config)
--format sarif      # SARIF (Static Analysis Results Interchange Format) — for hive scan/lint only
```

Rationale:
- `--format text` is terminal-friendly for humans; rewrapping is acceptable.
- `--format json` is the default for single-record outputs; AI agents call this once per session to bootstrap.
- `--format jsonl` is the default for lists; agents stream JSONL through pipelines without buffering.
- `--format yaml` for edit-friendly outputs (config, policy rules).
- `--format sarif` for SARIF compliance in scanning tools (P309).

When `--format` is non-text, the CLI MUST NOT wrap output to terminal width. AI agents should never have to deal with reflowed artifacts.

### 1.2 Universal JSON Envelope

Every JSON response (single record or top-level array) must be wrapped in this envelope:

```json
{
  "schema_version": 1,
  "command": "hive proposal get",
  "context": {
    "project": "agenthive",
    "agency": "hermes/agency-xiaomi",
    "host": "hermes",
    "mcp_url": "http://127.0.0.1:6421/sse",
    "resolved_at": "2026-04-25T14:30:00Z"
  },
  "ok": true,
  "data": {
    "proposal_id": "P123",
    "display_id": "P123",
    "title": "Example proposal",
    "status": "DEVELOP",
    "maturity": "active",
    "type": "feature"
  },
  "warnings": [
    {
      "code": "SCHEMA_DRIFT_DETECTED",
      "message": "CLI schema_version (1) is older than control-plane (2). Some fields may be missing.",
      "retriable": false
    }
  ],
  "next_cursor": null,
  "elapsed_ms": 234
}
```

Fields:

| Field | Required | Type | Purpose |
| --- | --- | --- | --- |
| `schema_version` | yes | integer | Envelope schema version for this CLI release. Increments on breaking changes. AI agents target a range; mismatch is a structured error. Current: 1. |
| `command` | yes | string | The full command that produced this output (e.g., `hive proposal get`, `hive proposal list`). |
| `context` | yes | object | Resolved runtime context at execution time: project, agency, host, mcp_url, resolved_at timestamp. See §1.3. |
| `ok` | yes | boolean | True if the command succeeded; false if error occurred. Mutually exclusive with `error` field. |
| `data` | no | object \| array | Command-specific payload. Present only if `ok: true`. |
| `warnings` | no | array | Array of non-fatal warnings (schema drift, deprecated flags, soft resource limits approaching). |
| `next_cursor` | no | string \| null | For paginated responses, the cursor to fetch the next page. Null if no more pages. |
| `elapsed_ms` | yes | integer | Wall-clock milliseconds from command entry to response ready. Helps agents detect hanging operations. |

### 1.3 Error Response Format

When a command fails (`ok: false`):

```json
{
  "schema_version": 1,
  "command": "hive proposal claim P999",
  "context": { ... },
  "ok": false,
  "error": {
    "code": "PROPOSAL_NOT_FOUND",
    "message": "Proposal P999 does not exist in project 'agenthive'.",
    "hint": "Run `hive proposal list --format json` to see available IDs.",
    "detail": {
      "proposal_id": "P999",
      "project": "agenthive",
      "checked_at": "2026-04-25T14:30:00Z"
    },
    "retriable": false,
    "exit_code": 2
  },
  "warnings": [],
  "elapsed_ms": 87
}
```

Fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `code` | string | Stable error code (enum, see §1.4). Maps to exit code. |
| `message` | string | Human-readable error description. |
| `hint` | string | Actionable recovery hint. Often references another command or a flag. |
| `detail` | object | Command-specific error context (e.g., which proposal, which user, timestamps). |
| `retriable` | boolean | True if the error is transient (rate limit, temporary service outage) and a retry is likely to succeed. |
| `exit_code` | integer | POSIX exit code to use. Stable per error code. |

### 1.4 Stable Error Code Enumeration

| Code | Exit | Meaning | Retriable | Example |
| --- | --- | --- | --- | --- |
| `USAGE` | 1 | Invalid flags, missing arguments, or command misuse | no | Missing required `--project` |
| `NOT_FOUND` | 2 | Resource does not exist (proposal, agency, document, etc.) | no | Proposal P999 does not exist |
| `PERMISSION_DENIED` | 3 | User/agency lacks required permission or role | no | Agency cannot claim proposal in MERGE state |
| `CONFLICT` | 4 | State conflict (e.g., already claimed, already mature, incompatible state transition) | no | Proposal already claimed by another agency |
| `REMOTE_FAILURE` | 5 | Remote MCP or database operation failed | yes | MCP timeout, DB connection lost |
| `INVALID_STATE` | 6 | Proposal state does not allow this operation | no | Cannot claim a proposal in COMPLETE state |
| `BUDGET_EXHAUSTED` | 7 | Budget cap reached (global, project, proposal, or dispatch level) | no | Project monthly budget spent |
| `POLICY_DENIED` | 8 | Host policy, provider policy, or security policy blocks the operation | no | Host does not allow Anthropic models |
| `TIMEOUT` | 9 | Operation exceeded time limit (e.g., long-running scan, MCP poll timeout) | yes | `hive scan` took >120 seconds |
| `RATE_LIMITED` | 10 | API or service rate limit hit | yes | Too many MCP requests; try again in 30s |
| `SCHEMA_DRIFT` | 11 | CLI schema_version is incompatible with control-plane schema_version | no | CLI v1.0 cannot parse schema_version 2 responses |
| `MCP_UNREACHABLE` | 12 | MCP server is not reachable (mutation refused; read falls back to DB) | yes | Cannot reach `http://127.0.0.1:6421/sse` |
| `DB_UNREACHABLE` | 13 | Direct database fallback not available; MCP required | yes | Cannot connect to `agenthive@127.0.0.1:5432` |
| `ENCODING_ERROR` | 14 | Encoding or serialization failure (e.g., invalid JSON in input) | no | JSONL input line is not valid JSON |
| `INTERNAL_ERROR` | 99 | Unexpected server error; likely a bug | yes | Nil pointer, uncaught exception |

Naming convention: `SCREAMING_SNAKE_CASE`. Always present in `error.code`.

Exit codes follow POSIX conventions: 0 = success, 1–127 = specific errors (mapped 1:1 by code), 99 = internal error, 130+ reserved for signal termination.

### 1.5 Context Envelope Field

Every response includes a `context` object resolved at command execution time:

```json
"context": {
  "project": "agenthive",
  "agency": "hermes/agency-xiaomi",
  "host": "hermes",
  "mcp_url": "http://127.0.0.1:6421/sse",
  "db_host": "127.0.0.1",
  "db_port": 5432,
  "resolved_at": "2026-04-25T14:30:00.123Z"
}
```

This grounds the response in the execution context. AI agents read `context` to confirm they are working in the intended project and agency. If the resolved context does not match expectations, the agent can refuse the result.

Resolution rules:
- `project`: from `--project` flag, `HIVE_PROJECT` env, or cwd-based `.hive/config.json` project hint.
- `agency`: from `--agency` flag, `HIVE_AGENCY` env, or `cwd/.hive/config.json`.
- `host`: from `AGENTHIVE_HOST` env or hostname of MCP connection.
- `mcp_url`: from `HIVE_MCP_URL` env, `roadmap.yaml`, or fallback control-plane lookup.
- `resolved_at`: ISO 8601 timestamp when the context was resolved.

---

## 2. Machine-Readable Discovery

### 2.1 Command Tree Schema

```bash
hive --schema
```

Returns the complete command tree as JSON, including every command, subcommand, flag, type, description, and supported format. AI agents call this once at session start to understand the CLI surface.

```json
{
  "schema_version": 1,
  "cli_version": "0.5.0",
  "mcp_protocol_version": "1.0",
  "commands": [
    {
      "name": "proposal",
      "aliases": ["proposals"],
      "description": "Proposal CRUD, workflow, and state management",
      "subcommands": [
        {
          "name": "get",
          "signature": "hive proposal get <proposal_id>",
          "description": "Get a single proposal by ID",
          "parameters": [
            {
              "name": "proposal_id",
              "type": "string",
              "required": true,
              "description": "Proposal ID (e.g., P123)"
            }
          ],
          "flags": [
            {
              "name": "include",
              "short": "i",
              "type": "string[]",
              "default": null,
              "repeatable": true,
              "description": "Relations to expand: leases, dispatches, events, ac, dependencies, discussions, gate_status. One round-trip instead of five.",
              "example": "--include leases --include ac"
            },
            {
              "name": "format",
              "type": "enum",
              "enum": ["text", "json", "yaml"],
              "default": "text",
              "description": "Output format"
            }
          ],
          "output": {
            "type": "object",
            "schema": { ... proposal schema ... }
          },
          "idempotency": "idempotent",
          "formats_supported": ["text", "json", "yaml"],
          "example_command": "hive proposal get P123 --format json --include all",
          "example_output": { ... }
        },
        {
          "name": "claim",
          "signature": "hive proposal claim <proposal_id> [--idempotency-key <uuid>]",
          "description": "Claim a proposal for work (acquires a lease)",
          "parameters": [
            {
              "name": "proposal_id",
              "type": "string",
              "required": true
            }
          ],
          "flags": [
            {
              "name": "idempotency-key",
              "type": "string",
              "description": "UUID for idempotent retries. Same key, same agency, returns the same lease.",
              "example": "--idempotency-key 550e8400-e29b-41d4-a716-446655440000"
            },
            {
              "name": "duration",
              "type": "duration",
              "default": "30m",
              "description": "Lease duration (e.g., 5m, 30m, 2h)"
            }
          ],
          "idempotency": "idempotent",
          "formats_supported": ["text", "json"],
          "exit_codes": {
            "0": "Claim successful",
            "2": "Proposal not found",
            "3": "Permission denied (agency not allowed to claim)",
            "4": "Proposal already claimed by another agency",
            "6": "Invalid state (proposal not claimable in current state)"
          }
        }
      ]
    },
    {
      "name": "context",
      "description": "Print resolved runtime context (project, agency, host, MCP, etc.)",
      "signature": "hive context",
      "parameters": [],
      "flags": [
        {
          "name": "format",
          "type": "enum",
          "enum": ["text", "json"],
          "default": "text"
        }
      ],
      "output": {
        "type": "object",
        "schema": { ... context schema ... }
      },
      "formats_supported": ["text", "json"]
    },
    {
      "name": "doctor",
      "description": "System health check: MCP, DB, schema, agency registration, host policy",
      "signature": "hive doctor [--format json]",
      "formats_supported": ["text", "json"],
      "fields": {
        "mcp_reachable": "boolean",
        "db_reachable": "boolean",
        "schema_migrated": "boolean",
        "control_plane_consistency": "boolean",
        "agency_registered": "boolean",
        "host_policy_resolved": "boolean",
        "scanner_selftest": "boolean"
      }
    }
  ]
}
```

Single-command schema:

```bash
hive proposal --schema
# or
hive proposal get --schema
```

### 2.2 Recipes Discovery

```bash
hive --recipes
```

Returns a curated list of common multi-command workflows in JSONL, each with title, when_to_use, steps, and expected terminal state. Agents read this to plan multi-step work without trial-and-error.

```jsonl
{"id":"claim-and-develop","title":"Pick the next claimable proposal and start work","when_to_use":"Agent has capacity for new work","steps":[{"cmd":"hive context --format json","reads":["agency","project"],"description":"Resolve current context"},{"cmd":"hive proposal next --format json","reads":["proposal_id","status"],"description":"Get next claimable proposal ranked by gate-readiness"},{"cmd":"hive proposal claim ${proposal_id} --duration 4h","description":"Acquire lease"},{"cmd":"hive proposal show ${proposal_id} --include all --format json","reads":["ac","dependencies","discussions"],"description":"Load full proposal state in one call"},{"cmd":"hive proposal maturity ${proposal_id} active","description":"Mark as active in current state"}],"terminal_state":"Proposal claimed, lease active, maturity=active in DEVELOP state"}
{"id":"audit-before-commit","title":"Scan for new hardcoding, lint, run tests, then commit","when_to_use":"Agent is ready to commit local changes","steps":[{"cmd":"git diff HEAD --name-only","reads":["files_changed"]},{"cmd":"hive scan --since HEAD --format sarif > /tmp/audit.sarif","description":"Detect hardcoding, secrets, TODOs added in this branch"},{"cmd":"if [ $(jq '.runs[0].results | length' /tmp/audit.sarif) -gt 0 ]; then hive scan --format json --since HEAD; fi","description":"Show results if any findings"},{"cmd":"hive lint --files ${files_changed} --format sarif","description":"Lint only changed files"},{"cmd":"npm test 2>&1 | tee /tmp/test.log","description":"Run test suite"},{"cmd":"if [ $? -eq 0 ]; then git add -A && git commit -m 'WIP'; else false; fi","description":"Commit only if tests pass"}],"terminal_state":"Local changes committed, no new findings"}
{"id":"investigate-stuck-proposal","title":"Understand why a proposal is stalled in a state","when_to_use":"Proposal has been in same state >7 days without maturity change","steps":[{"cmd":"hive proposal show P### --include all --format json","reads":["status","maturity","ac","dependencies","discussions","gate_status","events"],"description":"Load full state"},{"cmd":"hive proposal ac verify P### --format json","description":"Check which AC are blocking"},{"cmd":"hive proposal dependencies P### --format json","description":"List blocking dependencies and their status"},{"cmd":"hive proposal events P### --limit 20 --format jsonl","description":"Recent events to understand what happened"},{"cmd":"hive workflow next-state P### --format json","reads":["legal_next_states","blocker","why_blocked"],"description":"What would unblock the proposal"}],"terminal_state":"Agent understands blockers and next action"}
{"id":"operator-stop-runaway","title":"Emergency: stop a runaway worker/dispatch and escalate if needed","when_to_use":"Agent or dispatch is hung or consuming excessive budget","steps":[{"cmd":"hive context --format json","description":"Confirm context"},{"cmd":"hive job list --filter status=RUNNING --format jsonl | head -1 > /tmp/job.jsonl","description":"Get the runaway job"},{"cmd":"jq -r '.job_id' /tmp/job.jsonl","reads":["job_id"]},{"cmd":"hive operator-stop ${job_id} --confirm","description":"Force-terminate the job"},{"cmd":"hive proposal escalate P### --reason 'runaway dispatch'","description":"Escalate if needed"}],"terminal_state":"Runaway job stopped, escalation logged"}
{"id":"project-bootstrap","title":"Initialize a new project in AgentHive","when_to_use":"Starting a new project from scratch","steps":[{"cmd":"hive project init --name 'my-project' --git-root ~/my-project --format json","reads":["project_id"],"description":"Create project record"},{"cmd":"hive project db create ${project_id}","description":"Allocate project database"},{"cmd":"hive agency register --project ${project_id} --identity 'hermes/agency-myproject' --capabilities 'propose,develop,review'","description":"Register agency for the project"},{"cmd":"hive config set --scope project --key initial_budget_usd --value '1000'","description":"Set initial budget"},{"cmd":"hive doctor --format json","description":"Verify system health"}],"terminal_state":"Project initialized, agency registered, budget set, health check pass"}
{"id":"fix-a-finding-loop","title":"Automatically fix common scanner findings and re-check","when_to_use":"Scanner reports fixable findings (e.g., secrets in logs, TODO hardcoding)","steps":[{"cmd":"hive completion check --rule-id hardcoded-api-key --format json","reads":["satisfied","violations"],"description":"Check if rule is currently satisfied"},{"cmd":"if [ $(jq '.violations | length' /tmp/check.json) -gt 0 ]; then echo 'violations found'; fi","description":"Conditional next step"},{"cmd":"find . -name '*.ts' -o -name '*.js' | xargs grep -l 'API_KEY.*=' | while read f; do sed -i 's/API_KEY=.*/API_KEY=${process.env.API_KEY}/g' \"$f\"; done","description":"Apply fix (example: replace hardcoded secrets)"},{"cmd":"git diff --no-ext-diff | head -50","description":"Preview changes"},{"cmd":"git add -A && git commit -m 'fix: remove hardcoded secrets'","description":"Commit fix"},{"cmd":"hive completion check --rule-id hardcoded-api-key --format json","reads":["satisfied"],"description":"Re-check; should now pass"}],"terminal_state":"Finding fixed and verification passed"}
```

### 2.3 Doctor Endpoint

```bash
hive doctor --format json
```

Returns a machine-readable health snapshot. Designed so an agent can decide whether the system is usable in <1 second of CLI time.

```json
{
  "schema_version": 1,
  "command": "hive doctor",
  "context": { ... },
  "ok": true,
  "data": {
    "overall_status": "healthy",
    "checks": [
      {
        "name": "mcp_reachable",
        "status": "ok",
        "message": "MCP server reachable at http://127.0.0.1:6421/sse",
        "latency_ms": 42
      },
      {
        "name": "db_reachable",
        "status": "ok",
        "message": "Postgres 'agenthive' database reachable",
        "latency_ms": 18
      },
      {
        "name": "schema_migrated",
        "status": "ok",
        "message": "Schema up-to-date: version 012",
        "migration_lag_seconds": 0
      },
      {
        "name": "control_plane_consistency",
        "status": "ok",
        "message": "Control-plane state consistent across tables"
      },
      {
        "name": "agency_registered",
        "status": "ok",
        "message": "Agency 'hermes/agency-xiaomi' registered",
        "agency_id": "agency-42"
      },
      {
        "name": "host_policy_resolved",
        "status": "ok",
        "message": "Host 'hermes' allows routes: [claude-opus-4-5, claude-sonnet-4-5, llama-3.1]"
      },
      {
        "name": "scanner_selftest",
        "status": "ok",
        "message": "Scanner health check passed",
        "rules_loaded": 47
      }
    ],
    "issues": [],
    "warnings": [
      {
        "code": "BUDGET_WARNING",
        "message": "Project 'agenthive' at 85% of monthly budget",
        "remaining_usd": 150,
        "days_until_reset": 6
      }
    ]
  },
  "elapsed_ms": 234
}
```

If there are known-fixable issues, include a `remediation` field:

```json
"issues": [
  {
    "code": "ORPHAN_LEASE",
    "severity": "warning",
    "message": "Orphan lease detected: P123 claimed by worker-8899 (no heartbeat for 2h)",
    "remediation": {
      "commands": [
        "hive proposal release P123 --force",
        "hive proposal maturity P123 new"
      ],
      "description": "Commands to release the orphan lease and reset proposal to new state"
    }
  }
]
```

---

## 3. Idempotency, Locking, and Concurrency

### 3.1 Idempotency Keys

Every state-mutating command must accept `--idempotency-key <uuid>`:

```bash
hive proposal claim P123 --idempotency-key 550e8400-e29b-41d4-a716-446655440000
```

On first invocation, the command executes normally and returns:

```json
{
  "ok": true,
  "data": {
    "proposal_id": "P123",
    "lease_id": "lease-99",
    "idempotent_replay": false,
    "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

On a retry with the same key by the same agency in the same project, the command returns:

```json
{
  "ok": true,
  "data": {
    "proposal_id": "P123",
    "lease_id": "lease-99",
    "idempotent_replay": true,
    "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

The `idempotent_replay: true` flag tells the agent that no new work was done; the result is from a previous invocation. This is critical for agents that retry on transient failures.

Idempotency scope: `(agency_id, project_id, idempotency_key, command_signature)`. Same key with different agency or project creates a new result.

### 3.2 Idempotency Modes

Every command must document its idempotency mode in the schema:

| Mode | Behavior | When to Use |
| --- | --- | --- |
| `idempotent` | Repeated invocation with same key returns identical result. Safe for retries. | State mutations (claim, release, transition, maturity set) |
| `at-most-once` | Executes at most once per key; may fail on retry if first execution succeeded but response was lost. | Batch edits, archive operations where re-execution is costly |
| `at-least-once` | Repeated invocation may execute multiple times; idempotency_key is advisory (not enforced in database). | Logging, notification, event streaming |

### 3.3 Automatic Lease Acquisition

For commands that require a lease (e.g., `hive proposal edit`, `hive proposal dispatch`), the CLI automatically acquires a lease if the agency does not already hold one:

```bash
hive proposal edit P123 --status MERGE
```

Internally:
1. Check if agency already has an active lease on P123.
2. If not, acquire one automatically with a default TTL (5 minutes for CLI operations).
3. Apply the mutation within the lease scope.
4. Return the lease_id in the response for the agent to track.

For long-running work, the agent can explicitly renew:

```bash
hive proposal lease-renew P123 --lease-id lease-99 --duration 30m
```

### 3.4 Orphan Lease Detection

Leases auto-expire per TTL (default 5 minutes for CLI claims, tunable per lease type). The `hive doctor` endpoint surfaces orphan leases (claimed but no heartbeat in 2× TTL):

```bash
hive doctor --format json | jq '.issues[] | select(.code == "ORPHAN_LEASE")'
```

For long-running agent work, the CLI provides:

```bash
hive proposal lease-heartbeat P123 --lease-id lease-99
```

to extend the TTL without changing the proposal state. Agents call this periodically during long operations (e.g., every 2 minutes for a 5-minute TTL).

---

## 4. Batch and Pipeline Flags

### 4.1 List/Search Flags

For any list or search command:

```bash
hive proposal list \
  --limit 50 \
  --cursor eyJsYXN0X2lkIjogIlAxMjMifQ== \
  --filter status=DRAFT \
  --filter maturity=active \
  --fields proposal_id,title,status,maturity \
  --include leases \
  --format jsonl
```

| Flag | Type | Purpose | Example |
| --- | --- | --- | --- |
| `--limit <n>` | integer | Max results per response. Default 50. | `--limit 100` |
| `--cursor <token>` | string | Pagination cursor (opaque, base64-encoded offset). | `--cursor eyJsYXN0X2lkIjog...` |
| `--filter <key>=<value>` | repeatable | Server-side filter. Multiple filters are AND'd. Supports `=`, `!=`, `>`, `<`, `in`, `~` (regex). | `--filter status=DRAFT --filter type=feature` |
| `--fields <a,b,c>` | string | Project only specified fields (saves tokens). | `--fields proposal_id,title,status` |
| `--include <relation>` | repeatable | Expand related entities in one round-trip. See §4.2. | `--include leases --include ac` |
| `--sort <field>:<asc\|desc>` | repeatable | Server-side sort. Default: `created_at:desc`. | `--sort maturity:asc --sort status:asc` |
| `--format <fmt>` | enum | Output format. | `--format jsonl` |

### 4.2 Include Relations

For commands that return a single record or a list, `--include <relation>` expands related entities without additional round-trips. This is critical for agents: fetching a proposal's full state today requires 5 sequential calls; with `--include all`, it's 1 call.

```bash
hive proposal show P123 --include all --format json
# Expands: leases, dispatches, events, ac (acceptance criteria), dependencies, discussions, gate_status
```

Supported relations (per command):
- `proposal show`: `leases`, `dispatches`, `events`, `ac`, `dependencies`, `discussions`, `gate_status`, `recent_versions`, `all`
- `proposal list`: `leases`, `recent_events`, `all`
- `agency show`: `workers`, `active_leases`, `recent_dispatches`, `all`
- `job show`: `logs`, `context_usage`, `spending`, `events`, `all`

Each relation is documented in the command schema.

### 4.3 Stdin/Stdout Pipelines

For commands that take input from another command:

```bash
# List all DRAFT proposals as JSONL
hive proposal list --filter status=DRAFT --format jsonl | \
  # Pipe to claim: each line is one proposal
  hive proposal claim --from-stdin --idempotency-key abc-123
```

Input format: JSONL, one record per line. The receiving command documents which field it uses (usually `proposal_id` or `id`).

For example:

```bash
# Batch claim multiple proposals
cat <<'EOF' | hive proposal claim --from-stdin
{"proposal_id": "P001"}
{"proposal_id": "P002"}
{"proposal_id": "P003"}
EOF
```

Output: JSONL, one result per input line.

### 4.4 Long-Running Operations

For operations that take >5 seconds:

```bash
# Option 1: Watch until complete
hive scan --since HEAD --format jsonl --watch --timeout 120s

# Option 2: Background + poll
hive scan --since HEAD --background --format json
# Returns: { "ok": true, "data": { "job_id": "job-123" } }

hive job show job-123 --format json --watch
```

Flags:

| Flag | Purpose |
| --- | --- |
| `--watch` | Stream JSONL events until the operation reaches a terminal state. |
| `--timeout <duration>` | Bound the wait (e.g., `120s`, `5m`, `1h`). |
| `--background` | Return immediately with `job_id`. Agent polls separately with `hive job show`. |

When `--watch` is used, the CLI streams JSONL events to stdout, one per line:

```jsonl
{"type":"started","job_id":"scan-123","timestamp":"2026-04-25T14:30:00Z"}
{"type":"progress","job_id":"scan-123","percent":25,"current":"checking hardcoding in src/","timestamp":"2026-04-25T14:30:05Z"}
{"type":"progress","job_id":"scan-123","percent":50,"current":"checking secrets in tests/","timestamp":"2026-04-25T14:30:10Z"}
{"type":"complete","job_id":"scan-123","result":{"findings":3,"warnings":0},"exit_code":0,"timestamp":"2026-04-25T14:30:15Z"}
```

---

## 5. AI-First Command Shapes

These commands differ significantly from a human-first CLI. They are designed to support common AI-agent workflows with minimal overhead.

### 5.1 hive context

**Use case:** At session start, agent resolves the current context (project, agency, host, DB, MCP).

```bash
hive context --format json
```

Response:

```json
{
  "ok": true,
  "data": {
    "project": "agenthive",
    "agency": "hermes/agency-xiaomi",
    "host": "hermes",
    "mcp_url": "http://127.0.0.1:6421/sse",
    "db_host": "127.0.0.1",
    "db_port": 5432,
    "resolved_at": "2026-04-25T14:30:00.123Z"
  }
}
```

If the resolved context does not match the agent's expectations, it can refuse to proceed.

### 5.2 hive proposal next

**Use case:** Agent with available capacity asks for the next claimable proposal, ranked by gate-readiness and priority.

```bash
hive proposal next --format json --capabilities "develop,review" --project agenthive
```

Response:

```json
{
  "ok": true,
  "data": {
    "proposal_id": "P404",
    "display_id": "P404",
    "title": "Implement scan rule for hardcoded API keys",
    "type": "feature",
    "status": "DEVELOP",
    "maturity": "new",
    "gate_readiness_score": 92,
    "priority": "high",
    "estimated_scope_days": 3,
    "required_capabilities": ["develop"],
    "blocking_proposal_ids": [],
    "ac_complete_percent": 80
  }
}
```

Returns a single proposal (the best candidate) rather than a list. Agents use this to auto-claim work without listing and filtering.

### 5.3 hive proposal show with --include all

**Use case:** Agent needs full proposal state in a single call instead of 5 sequential calls.

```bash
hive proposal show P123 --include all --format json
```

Response: A single JSON document containing:

```json
{
  "ok": true,
  "data": {
    "proposal": { ... proposal fields ... },
    "leases": [ ... current and recent leases ... ],
    "dispatches": [ ... related dispatches ... ],
    "events": [ ... recent events ... ],
    "ac": [ ... acceptance criteria and verification ... ],
    "dependencies": [ ... dependency graph edges ... ],
    "discussions": [ ... threaded discussions ... ],
    "gate_status": {
      "current_state": "DEVELOP",
      "next_legal_states": ["MERGE"],
      "gate_blocker": null,
      "ready_to_advance": true
    },
    "recent_versions": [ ... proposal version history ... ]
  }
}
```

Single round-trip instead of 5.

### 5.4 hive scan --since <ref> --format sarif/json

**Use case:** Before-commit checking for new hardcoding, secrets, TODOs.

```bash
hive scan --since HEAD --format json --limit-findings 100
```

Returns a structured list of findings with stable IDs, source locations, and remediation hints. The `--format sarif` variant returns SARIF format (P309). The `--format json` variant returns AgentHive's native findings format.

Response (JSON):

```json
{
  "ok": true,
  "data": {
    "scan_id": "scan-456",
    "baseline_ref": "HEAD",
    "findings": [
      {
        "id": "hardcoding:001",
        "rule_id": "hardcoded-api-key",
        "severity": "error",
        "file": "src/main.ts",
        "line": 42,
        "column": 10,
        "message": "Hardcoded API key detected",
        "snippet": "const API_KEY = 'sk-1234567...'",
        "remediation": "Use environment variable: const API_KEY = process.env.API_KEY",
        "tags": ["security", "secrets"]
      }
    ],
    "summary": {
      "total_findings": 5,
      "errors": 2,
      "warnings": 3,
      "by_rule": { "hardcoded-api-key": 2, "todo-hardcoding": 3 }
    }
  }
}
```

### 5.5 hive workflow next-state <proposal_id>

**Use case:** Agent checks whether a proposal can transition to the next state, and if not, why.

```bash
hive workflow next-state P123 --format json
```

Response:

```json
{
  "ok": true,
  "data": {
    "proposal_id": "P123",
    "current_state": "DEVELOP",
    "current_maturity": "active",
    "legal_next_states": ["MERGE"],
    "can_transition": true,
    "blockers": [],
    "ac_status": {
      "total": 10,
      "verified": 9,
      "pending": 1,
      "unverified": [
        {
          "id": "ac-007",
          "description": "E2E tests pass in CI",
          "verification_status": "PENDING"
        }
      ]
    },
    "dependency_status": {
      "total": 2,
      "satisfied": 2,
      "unsatisfied": []
    },
    "gate_decision": null,
    "why_blocked": null
  }
}
```

Agents use this to decide whether calling `hive proposal transition` will succeed. If `can_transition: false`, the agent reads `blockers` and `why_blocked` to understand what to do next.

### 5.6 hive doctor --remediate <issue-code>

**Use case:** For known-fixable issues (orphan leases, schema mismatches), print the exact CLI commands or SQL to fix.

```bash
hive doctor --remediate ORPHAN_LEASE --format json
```

Response:

```json
{
  "ok": true,
  "data": {
    "issue": "ORPHAN_LEASE",
    "message": "Orphan lease detected: P123 claimed by worker-8899 (no heartbeat for 2h)",
    "remediation": {
      "type": "commands",
      "steps": [
        {
          "description": "Release the orphan lease",
          "command": "hive proposal release P123 --force"
        },
        {
          "description": "Reset proposal to new state",
          "command": "hive proposal maturity P123 new"
        }
      ]
    }
  }
}
```

### 5.7 hive recipe run <recipe-id>

**Use case:** Agent runs a curated multi-step workflow with progress streamed.

```bash
hive recipe run claim-and-develop --project agenthive --watch
```

Returns: JSONL stream of step events until completion.

```jsonl
{"type":"recipe_started","recipe_id":"claim-and-develop","timestamp":"2026-04-25T14:30:00Z"}
{"type":"step_started","step":0,"command":"hive context --format json","timestamp":"2026-04-25T14:30:00Z"}
{"type":"step_output","step":0,"data":{"project":"agenthive","agency":"hermes/agency-xiaomi"},"timestamp":"2026-04-25T14:30:01Z"}
{"type":"step_started","step":1,"command":"hive proposal next --format json","timestamp":"2026-04-25T14:30:01Z"}
{"type":"step_output","step":1,"data":{"proposal_id":"P404"},"timestamp":"2026-04-25T14:30:02Z"}
{"type":"recipe_complete","recipe_id":"claim-and-develop","exit_code":0,"timestamp":"2026-04-25T14:30:10Z"}
```

### 5.8 hive completion check --rule-id <id>

**Use case:** For scanner integration, check whether a specific rule is currently satisfied.

```bash
hive completion check --rule-id hardcoded-api-key --format json
```

Response:

```json
{
  "ok": true,
  "data": {
    "rule_id": "hardcoded-api-key",
    "satisfied": false,
    "violations": [
      {
        "file": "src/main.ts",
        "line": 42,
        "message": "Hardcoded API key detected"
      }
    ]
  }
}
```

---

## 6. Token-Economy Patterns

AI agents have limited context windows. Every CLI invocation and every byte of output costs tokens. Document these patterns explicitly in the CLI documentation and command help:

1. **Prefer `--fields` to limit output payload.** Instead of:
   ```bash
   hive proposal list --format json | jq '.data[].proposal_id'
   ```
   Use:
   ```bash
   hive proposal list --fields proposal_id --format jsonl
   ```
   Saves ~60% of output tokens.

2. **Prefer `--include` over multiple round-trips.** Instead of:
   ```bash
   P=P123
   hive proposal show $P --format json > /tmp/p.json
   hive proposal ac verify $P --format json >> /tmp/p.json
   hive proposal dependencies $P --format json >> /tmp/p.json
   ```
   Use:
   ```bash
   hive proposal show P123 --include all --format json
   ```
   Saves ~80% of round-trip overhead and ~70% of CLI overhead.

3. **Prefer `--format jsonl` for large lists.** JSONL is line-buffered and allows streaming; JSON requires buffering the entire list in memory. For lists >100 items, JSONL is faster and uses less memory.

4. **Prefer `hive doctor --format json` over running 6 separate health checks.** One call, all checks.

5. **The `--explain` flag costs ~200 tokens once; skipping it can cost 2000 tokens of error recovery.** When an agent sees an unfamiliar command, it should call it once with `--explain`:
   ```bash
   hive proposal next --explain
   ```

6. **CLI never wraps output to terminal width when `--format` is non-text.** Agents should never have to deal with reflow artifacts. If `--format json`, the CLI outputs raw JSON even if it's 10,000 characters per line.

---

## 7. MCP Bridge

When the CLI runs in an environment where the AgentHive MCP server is reachable (`HIVE_MCP_URL` env or default control-plane lookup), proposal mutations route through MCP for full audit trail (`proposal_event` outbox). When MCP is unreachable, the CLI degrades gracefully.

### 7.1 Command-Level Bridge Configuration

| Command | MCP | Direct DB | Fallback |
| --- | --- | --- | --- |
| `proposal get` | optional (for full context) | yes | DB only |
| `proposal list` | optional (for full context) | yes | DB only |
| `proposal create` | required | n/a | Refuse with `MCP_UNREACHABLE` |
| `proposal claim` | required | n/a | Refuse with `MCP_UNREACHABLE` |
| `proposal transition` | required | n/a | Refuse with `MCP_UNREACHABLE` |
| `proposal maturity` | required | n/a | Refuse with `MCP_UNREACHABLE` |
| `proposal ac add` | required | n/a | Refuse with `MCP_UNREACHABLE` |
| `proposal ac verify` | required | n/a | Refuse with `MCP_UNREACHABLE` |
| `context` | optional | yes | DB only |
| `doctor` | optional | yes | Partial health check |

For read commands: fall back to direct DB queries if MCP is unreachable.

For mutations: refuse with `error.code = MCP_UNREACHABLE` and a hint pointing at `hive doctor`. NEVER bypass MCP for mutations silently — the audit trail is sacred.

### 7.2 Configuration

MCP reachability is determined in this order:

1. `HIVE_MCP_URL` env variable (if set).
2. `$CWD/.hive/config.json` → `mcp_url` field.
3. `roadmap.yaml` → `mcp.url` field.
4. DNS lookup of `agenthive-mcp.local` (internal naming convention).
5. Hardcoded fallback `http://127.0.0.1:6421/sse`.

Once MCP reachability is determined, retry logic:
- First attempt: synchronous, 5-second timeout.
- On timeout or connection refused: mark MCP as unreachable.
- Subsequent commands: skip MCP, use fallback (read from DB or refuse mutation).
- Periodic retry (every 30 seconds): re-test MCP reachability.

---

## 8. Versioning, Compatibility, and Drift Detection

### 8.1 Version Commands

```bash
hive --version
```

Returns:

```
hive version 0.5.0
schema_version: 1
mcp_protocol_version: 1.0
mcp_server_version: 0.5.2
control_plane_db_version: 012
```

### 8.2 Schema Drift Detection

Every response includes `schema_version: 1`. If the CLI's schema version is older than the control-plane's, the CLI warns:

```json
"warnings": [
  {
    "code": "SCHEMA_DRIFT_DETECTED",
    "message": "CLI schema_version (1) is older than control-plane (2). Some fields may be missing. Upgrade the CLI.",
    "retriable": false
  }
]
```

If the gap is breaking (e.g., CLI v1.0 cannot parse control-plane v2), the CLI refuses mutations:

```json
{
  "ok": false,
  "error": {
    "code": "SCHEMA_DRIFT",
    "message": "CLI schema_version (1) is incompatible with control-plane schema_version (2). Upgrade required.",
    "hint": "Run `hive --upgrade` or install the latest version."
  }
}
```

### 8.3 Deprecation Warnings

Deprecated flags and commands are warned in JSON `warnings[]`, not hidden:

```json
"warnings": [
  {
    "code": "DEPRECATED_FLAG",
    "message": "Flag `--agent` is deprecated. Use `--agency` instead.",
    "removal_version": "1.0.0"
  }
]
```

AI agents see these and can update their scripts accordingly.

---

## 9. Error Handling and Exit Codes

### 9.1 Structured Error Examples

**Missing required argument:**

```json
{
  "ok": false,
  "error": {
    "code": "USAGE",
    "message": "Missing required argument: <proposal_id>",
    "hint": "Usage: hive proposal claim <proposal_id>",
    "exit_code": 1
  }
}
```

**Proposal not found:**

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Proposal P999 does not exist in project 'agenthive'.",
    "hint": "Run `hive proposal list --format json` to see available IDs.",
    "detail": { "proposal_id": "P999", "project": "agenthive" },
    "exit_code": 2
  }
}
```

**Permission denied:**

```json
{
  "ok": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Agency 'codex/agency-alpha' cannot claim a proposal in MERGE state.",
    "hint": "Only architects and gate agents can claim MERGE proposals.",
    "exit_code": 3
  }
}
```

**MCP unreachable:**

```json
{
  "ok": false,
  "error": {
    "code": "MCP_UNREACHABLE",
    "message": "MCP server at http://127.0.0.1:6421/sse is not reachable.",
    "hint": "Run `hive doctor` to diagnose. Check that agenthive-mcp.service is running.",
    "retriable": true,
    "exit_code": 12
  }
}
```

### 9.2 Quiet and Verbose Modes

```bash
hive proposal claim P123 --quiet         # Suppress progress chatter on stderr
hive proposal claim P123 --verbose       # Add detailed progress and timing
```

`--quiet` suppresses:
- Progress messages ("Checking proposal state...", "Acquiring lease...")
- Elapsed time on stdout or stderr
- Non-critical warnings

`--verbose` adds:
- Detailed progress messages
- Timing information for each step
- MCP and DB latency
- Resolved context confirmation

---

## 10. AI-First Recipes (JSONL Examples)

The `hive --recipes` endpoint returns JSONL. Here are 6 curated recipes:

```jsonl
{"id":"claim-and-develop","title":"Pick the next claimable proposal and start work","when_to_use":"Agent has capacity for new work","steps":[{"step":0,"description":"Resolve current context","cmd":"hive context --format json","reads":["agency","project"],"expect_ok":true},{"step":1,"description":"Get next claimable proposal ranked by gate-readiness","cmd":"hive proposal next --format json --project ${project} --capabilities develop,review","reads":["proposal_id"],"expect_ok":true},{"step":2,"description":"Acquire a lease for 4 hours","cmd":"hive proposal claim ${proposal_id} --duration 4h --idempotency-key $(uuidgen) --format json","reads":["lease_id"],"expect_ok":true},{"step":3,"description":"Load full proposal state in one call","cmd":"hive proposal show ${proposal_id} --include all --format json","reads":["ac","dependencies","discussions","gate_status"],"expect_ok":true},{"step":4,"description":"Mark as active in current state","cmd":"hive proposal maturity ${proposal_id} active --format json","expect_ok":true}],"terminal_state":"Proposal claimed, lease active for 4h, maturity=active in current state"}
{"id":"audit-before-commit","title":"Scan for new hardcoding, lint, run tests, then commit","when_to_use":"Agent is ready to commit local changes","steps":[{"step":0,"description":"List changed files","cmd":"git diff HEAD --name-only | sort","reads":["files_changed"],"store_as":"FILES"},{"step":1,"description":"Scan for new hardcoding and secrets","cmd":"hive scan --since HEAD --format json | jq '.data.findings | length' ","reads":["finding_count"],"store_as":"FINDINGS"},{"step":2,"description":"Show findings if any","cmd":"if [ ${FINDINGS} -gt 0 ]; then hive scan --since HEAD --format json | jq '.data.findings'; fi","expect_ok":true},{"step":3,"description":"Lint changed files only","cmd":"hive lint --files ${FILES} --format sarif 2>/dev/null | jq '.runs[0].results | length'","store_as":"LINT_ISSUES"},{"step":4,"description":"Run test suite","cmd":"npm test 2>&1","expect_exit_code":0},{"step":5,"description":"Commit if tests pass","cmd":"if [ $? -eq 0 ]; then git add -A && git commit -m 'WIP: scan/lint/test pass'; else false; fi","expect_exit_code":0}],"terminal_state":"Changes committed, scan clean, no new lint issues, tests pass"}
{"id":"investigate-stuck-proposal","title":"Understand why a proposal is stalled in a state","when_to_use":"Proposal has been in same state >7 days without maturity change","steps":[{"step":0,"description":"Load full proposal state and history","cmd":"hive proposal show ${PROPOSAL_ID} --include all --format json","reads":["status","maturity","ac","dependencies","discussions","gate_status","events"]},{"step":1,"description":"Check which AC are blocking","cmd":"hive proposal ac verify ${PROPOSAL_ID} --format json | jq '.data.unverified'","reads":["unverified_ac"]},{"step":2,"description":"List blocking dependencies and their status","cmd":"hive proposal dependencies ${PROPOSAL_ID} --format json | jq '.data[] | select(.status != \"satisfied\")'","reads":["unsatisfied_deps"]},{"step":3,"description":"Show recent events to understand what happened","cmd":"hive proposal events ${PROPOSAL_ID} --limit 20 --format jsonl","reads":["recent_events"]},{"step":4,"description":"Check what would unblock the proposal","cmd":"hive workflow next-state ${PROPOSAL_ID} --format json | jq '{legal_next_states, blockers, why_blocked}'","reads":["blockers"]}],"terminal_state":"Agent understands blockers and next action"}
{"id":"operator-stop-runaway","title":"Emergency: stop a runaway worker/dispatch and escalate if needed","when_to_use":"Agent or dispatch is hung or consuming excessive budget","steps":[{"step":0,"description":"Confirm context","cmd":"hive context --format json","reads":["project","agency"]},{"step":1,"description":"Find the runaway job (first RUNNING job, usually the suspect)","cmd":"hive job list --filter status=RUNNING --format jsonl --limit 1","reads":["job_id"],"store_as":"JOB_ID"},{"step":2,"description":"Force-terminate the job","cmd":"hive operator-stop ${JOB_ID} --confirm --format json","expect_ok":true},{"step":3,"description":"Escalate the proposal if a dispatch/proposal is involved","cmd":"if [ -n \"${PROPOSAL_ID}\" ]; then hive proposal escalate ${PROPOSAL_ID} --reason 'runaway dispatch, force-stopped by operator' --format json; fi","expect_ok":true}],"terminal_state":"Runaway job stopped, escalation logged"}
{"id":"project-bootstrap","title":"Initialize a new project in AgentHive","when_to_use":"Starting a new project from scratch","steps":[{"step":0,"description":"Create project record","cmd":"hive project init --name 'my-project' --git-root ~/my-project --format json","reads":["project_id"],"store_as":"PROJECT_ID"},{"step":1,"description":"Allocate project database","cmd":"hive project db create ${PROJECT_ID} --format json","expect_ok":true},{"step":2,"description":"Register agency for the project","cmd":"hive agency register --project ${PROJECT_ID} --identity 'hermes/agency-myproject' --capabilities 'propose,develop,review' --format json","reads":["agency_id"]},{"step":3,"description":"Set initial budget","cmd":"hive config set --scope project --key initial_budget_usd --value '1000' --project ${PROJECT_ID} --format json","expect_ok":true},{"step":4,"description":"Verify system health","cmd":"hive doctor --format json | jq '.data.overall_status'","expect_output":"healthy"}],"terminal_state":"Project initialized, agency registered, budget set, health check pass"}
{"id":"fix-a-finding-loop","title":"Automatically fix common scanner findings and re-check until clean","when_to_use":"Scanner reports fixable findings (e.g., secrets in logs, hardcoded TODO)","steps":[{"step":0,"description":"Check if rule is currently satisfied","cmd":"hive completion check --rule-id ${RULE_ID} --format json","reads":["satisfied","violations"],"store_as":"INITIAL_STATUS"},{"step":1,"description":"If violations exist, apply automatic fix","cmd":"if [ $(jq '.data.violations | length' <<< $INITIAL_STATUS) -gt 0 ]; then bash /tmp/apply-fix-${RULE_ID}.sh; fi","expect_exit_code":0},{"step":2,"description":"Preview changes","cmd":"git diff --no-ext-diff | head -100","store_as":"PREVIEW"},{"step":3,"description":"Commit if changes are reasonable","cmd":"if [ -n \"$PREVIEW\" ]; then git add -A && git commit -m 'fix: resolve ${RULE_ID} violation'; fi","expect_exit_code":0},{"step":4,"description":"Re-check rule; should now pass","cmd":"hive completion check --rule-id ${RULE_ID} --format json | jq '.data.satisfied'","expect_output":"true"}],"terminal_state":"Finding fixed and verification passed"}
```

---

## 11. Quiet Flags and Suppress Output

Every command supports:

```bash
hive proposal claim P123 --quiet     # Suppress progress on stderr
hive proposal claim P123 --quiet --format json  # JSON only, no progress
```

In `--quiet` mode:
- No progress messages to stderr.
- No elapsed time reported (unless `--format json`).
- Only the result (or error) is output.
- Exit code is still meaningful.

This is critical for scripts and pipelines.

---

## 12. Summary of Design Decisions

### 6 Most Consequential Design Decisions

1. **Universal JSON Envelope with Schema Versioning:** Every JSON response (success or error) is wrapped in a consistent envelope with `schema_version`, `command`, `context`, `ok`, `data`, `warnings`, `next_cursor`, and `elapsed_ms`. This makes it safe for agents to detect breaking changes (schema drift) and degrade gracefully. The alternative (ad-hoc JSON per command) would require agents to implement parser fallback logic.

2. **Idempotency Keys Everywhere:** Every state-mutating command accepts `--idempotency-key <uuid>`. Agents can retry safely without creating duplicate leases, transitions, or disputes. The alternative (no idempotency) forces agents to implement complex retry-with-check-first logic, increasing context overhead.

3. **MCP Mutations, DB Read Fallback:** Mutations route through MCP (audit trail preserved) but reads fall back to direct DB if MCP is unreachable. This prevents agents from being blocked by transient MCP outages for read-heavy workflows. The alternative (all-or-nothing MCP dependency) would make the system fragile.

4. **`--include` Relations to Collapse Round-Trips:** A single `hive proposal show P123 --include all` returns the proposal, leases, AC, dependencies, discussions, and gate status in one call. Without this, agents need 5+ sequential calls. This reduces context overhead by ~70% and latency by ~80%.

5. **AI-Specific Commands (`hive context`, `hive proposal next`, `hive workflow next-state`):** These commands do not have human equivalents and are designed purely for agent workflows. `hive proposal next` returns a single ranked proposal instead of a full list; agents use this to auto-claim work. `hive workflow next-state` returns decision support (blockers, why blocked) instead of just the legal states. This reduces decision overhead for agents.

6. **Recipes as Machine-Readable Workflows:** `hive --recipes` returns curated multi-step workflows as JSONL. Agents read this once to understand the "happy path" for common operations (claim-and-develop, audit-before-commit, operator-stop-runaway). Without recipes, agents discover patterns through trial-and-error, wasting context.

---

## 13. Implementation Roadmap

This design informs the Software Architect's command-tree work and the Backend Architect's system-ops commands. Immediate next steps:

1. Update command schemas in `src/apps/cli.ts` and command handlers to emit the universal JSON envelope on `--format json`.
2. Add `--schema` endpoint to every command via a shared helper.
3. Implement `hive --recipes` and `hive --schema` (full tree).
4. Add `hive context` and `hive doctor` commands (likely in a new `hive system` or `hive meta` namespace).
5. Implement `--idempotency-key` support in all mutation handlers.
6. Refactor existing commands to support `--fields` and `--include` flags via shared query builders.
7. Update all list commands to support `--limit`, `--cursor`, `--filter`, `--sort`.
8. Add MCP bridge logic: detect MCP reachability, degrade gracefully for reads, refuse mutations if MCP is down.
9. Implement the 6 AI-first commands (`proposal next`, `proposal show --include all`, `workflow next-state`, `scan --format sarif`, `doctor --remediate`, `recipe run`).
10. Add deprecation warnings to legacy `roadmap` command and gently redirect agents to `hive`.

---

## Appendix A: Glossary

- **Idempotency Key:** UUID that identifies a retryable operation. Same key + same agency + same project = same result, even on repeated invocations.
- **Lease:** Time-limited claim on a proposal. Held by an agency. Auto-expires per TTL. Used to prevent concurrent edits.
- **MCP Bridge:** Logic that routes mutations through MCP (audit trail) but falls back to direct DB for reads.
- **Schema Drift:** Version mismatch between CLI and control-plane. Detected by comparing `schema_version` fields.
- **SARIF:** Static Analysis Results Interchange Format, an open standard for tool output.
- **Terminal State:** A proposal state or job state from which no further transitions are legal (e.g., COMPLETE, WONT_FIX, DEPLOYED).
- **Gate-Readiness:** Score (0–100) indicating how close a proposal is to being ready for the next gate (all AC verified, dependencies satisfied, no blockers).

