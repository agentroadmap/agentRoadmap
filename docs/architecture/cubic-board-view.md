# Cubic Board View & State-Machine Visualization

Design doc for a new roadmap board view that shows, at a glance:

- which cubics are alive,
- which agent is deployed in each,
- which proposal the agent is working on,
- the proposal's workflow state + maturity,
- and a visual state-machine graph that animates as proposals advance.

The existing board surfaces only a state-changes feed. This adds a
**cubic-centric** perspective and **state-machine** perspective without
replacing the feed.

## 1. Data Model Recap

Tables already in place (no new core tables required):

| Table | Key columns | Role |
| --- | --- | --- |
| `roadmap.cubics` | `cubic_id, agent_identity, status, phase, worktree_path, budget_usd` | The cubic (isolated execution env). |
| `roadmap_workforce.agent_registry` | `agent_identity, role, status` | Agent identity. |
| `roadmap_proposal.proposal_lease` | `proposal_id, agent_identity, released_at` | Active when `released_at IS NULL`. |
| `roadmap_workforce.squad_dispatch` | `proposal_id, agent_identity, dispatch_status, lease_id` | Explicit squad assignment. |
| `roadmap_proposal.proposal` | `id, display_id, title, status, maturity, workflow_id` | Proposal + its position. |

The join path is **cubic → agent → active lease → proposal**. Cubics don't
own a `proposal_id` directly; the lease is the binding.

## 2. New Projection: `v_cubic_board`

A read-only view that the board API consumes. Materialized projection is
unnecessary; the base tables are small and already indexed on
`(proposal_id) WHERE released_at IS NULL`.

```sql
CREATE OR REPLACE VIEW roadmap.v_cubic_board AS
SELECT
    c.cubic_id,
    c.status          AS cubic_status,     -- idle|active|locked|completed
    c.phase           AS cubic_phase,      -- design|build|merge|...
    c.agent_identity,
    ar.role           AS agent_role,
    ar.status         AS agent_status,     -- online|offline|busy
    c.worktree_path,
    c.budget_usd,
    c.locked_at,
    -- active lease + proposal under work
    l.id              AS lease_id,
    l.claimed_at,
    l.expires_at,
    p.id              AS proposal_id,
    p.display_id,
    p.title,
    p.status          AS proposal_state,   -- Draft|Review|Develop|Merge|Complete
    p.maturity,                            -- new|active|mature|obsolete
    p.workflow_id,
    -- optional squad context (null if not dispatched via squad)
    sd.squad_name,
    sd.dispatch_role,
    sd.dispatch_status
FROM roadmap.cubics c
LEFT JOIN roadmap_workforce.agent_registry ar
       ON ar.agent_identity = c.agent_identity
LEFT JOIN roadmap_proposal.proposal_lease l
       ON l.agent_identity = c.agent_identity
      AND l.released_at IS NULL
LEFT JOIN roadmap_proposal.proposal p
       ON p.id = l.proposal_id
LEFT JOIN roadmap_workforce.squad_dispatch sd
       ON sd.lease_id = l.id
      AND sd.dispatch_status IN ('assigned','active')
ORDER BY
    (c.status = 'active') DESC,
    c.locked_at DESC NULLS LAST,
    c.created_at DESC;
```

### Why a view (not a materialized view)
- Updates arrive through lease inserts and cubic status changes — already
  triggering `fn_event_lease_change`. Adding materialized-view refresh on
  every lease event would just double-write.
- Cardinality is bounded (cubics ≈ agent slots, tens not thousands).
- Board render cadence is human-speed (1–2 Hz at most).

### Index coverage check
Already present:
- `idx_cubics_status` on `roadmap.cubics(status)`
- `idx_lease_proposal` partial on `proposal_lease(proposal_id) WHERE released_at IS NULL`
- `squad_dispatch_lease_id_fkey` backing index
No new indexes required.

## 3. API Surface

Extend `src/web/lib/board-api.ts`:

```ts
// GET /api/board/cubic-board
router.get('/cubic-board', (_req, res) => {
  const rows = dbQuery('SELECT * FROM roadmap.v_cubic_board');
  res.json({ cubics: rows });
});

// GET /api/board/state-machine?workflow=standard_rfc
router.get('/state-machine', (req, res) => {
  const workflowId = String(req.query.workflow ?? 'standard_rfc');
  const nodes = dbQuery(
    `SELECT state_key AS id, display_name AS label, phase
       FROM roadmap.workflow_state
      WHERE workflow_id = '${workflowId}' ORDER BY sort_order`
  );
  const edges = dbQuery(
    `SELECT from_state AS source, to_state AS target, gate_id AS label
       FROM roadmap.workflow_transition
      WHERE workflow_id = '${workflowId}'`
  );
  const counts = dbQuery(
    `SELECT status AS state, COUNT(*)::int AS n, maturity
       FROM roadmap_proposal.proposal
      WHERE workflow_id = '${workflowId}' AND maturity <> 'obsolete'
      GROUP BY status, maturity`
  );
  res.json({ workflowId, nodes, edges, counts });
});
```

> Note: the existing endpoint code builds SQL via string concatenation.
> This is a pre-existing code-smell we should not propagate in new code —
> the new endpoints should be parameterized once we introduce the pg
> driver into this file. Flag as follow-up (not in-scope here).

## 4. Frontend — Two Tabs, Shared Layout

Add a tab switcher next to the existing "Feed" tab in `src/web/`:

```
[ Feed ]  [ Cubics ]  [ State Machine ]
```

### 4.1 Cubics tab

Card grid. One card per cubic. Column layout:

```
┌─ cubic-7a3f (ACTIVE · develop) ───────── $1.24 / $5 ─┐
│ Agent : claude-opus@hermes     [●online busy]        │
│ Prop  : P245 · Host spawn policy                     │
│ State : Develop / mature   ← (pulsing ring)          │
│ Squad : hermes-infra / builder                       │
│ Lease : claimed 14m ago · expires in 46m             │
│ WT    : /data/code/worktree/hermes-p245              │
└──────────────────────────────────────────────────────┘
```

Visual rules:
- **cubic_status** → card border color (idle=grey, active=green, locked=amber, completed=dim).
- **proposal maturity** → badge (`new`→blue, `active`→green, `mature`→gold pulse, `obsolete`→strikethrough).
- **budget bar** in the header, clamps at 100%.
- Idle cubics (no active lease) render collapsed with just the agent + "idle" tag.
- Click a card → opens the proposal detail drawer (reuses the existing
  proposal viewer).

### 4.2 State Machine tab

A directed graph per workflow. Nodes are states, edges are gates.

Render stack:
- Library: **React Flow** (already MIT, tree-shakable, ~40 kB gzipped).
  Alternative: Mermaid with `stateDiagram-v2` rendered via `mermaid`
  package if we want to stay text-first. **Recommend React Flow** for
  live updates and animated edges; Mermaid is one-shot rendered.
- Layout: `dagre` with `rankdir=LR` for Standard RFC
  (`Draft → Review → Develop → Merge → Complete`).
- Node badge: count of proposals currently in that state, broken down
  by maturity (small stacked bars or color dots).
- Edge highlight: pulse for ~1.5 s when a `workflow_event` with that
  transition arrives via SSE.
- Legend: maturity color key + gate id.

Sketch:

```
  Draft ──D1──▶ Review ──D2──▶ Develop ──D3──▶ Merge ──D4──▶ Complete
   (3)            (5 · 1★)       (2)             (1)           (7)
                         ★ = maturity:mature (gate-ready)
```

### 4.3 Live updates

Reuse the existing `websocket-server.ts` feed. It already broadcasts
`proposal.state_change` and `lease.change` events. Add two client-side
reducers:

- On `lease.change` → patch the matching cubic card (lease claimed or
  released).
- On `proposal.state_change` → re-request `/state-machine?workflow=...`
  (cheap; the response is tiny) and pulse the edge that fired.

No new server-side broadcast channels required.

## 5. DDL Deltas

Single migration, low-risk, DML + CREATE VIEW only:

```
database/ddl/v4/003_cubic_board_view.sql
```

Content:

```sql
BEGIN;

CREATE OR REPLACE VIEW roadmap.v_cubic_board AS
/* ...as shown above... */;

COMMENT ON VIEW roadmap.v_cubic_board IS
  'Projection for the Cubic Board UI. Joins cubic -> agent -> active lease -> proposal -> optional squad dispatch.';

GRANT SELECT ON roadmap.v_cubic_board TO claude;

COMMIT;
```

(must be applied as `andy` — `roadmap` schema ownership constraint, same
as P245).

## 6. Code Deltas (sketch)

Files to touch:

| File | Change |
| --- | --- |
| `database/ddl/v4/003_cubic_board_view.sql` | **NEW** — the view + grant. |
| `src/web/lib/board-api.ts` | Add `/cubic-board` and `/state-machine` endpoints. |
| `src/web/components/CubicBoard.tsx` | **NEW** — card grid consuming `/cubic-board`. |
| `src/web/components/StateMachineGraph.tsx` | **NEW** — React Flow graph with count badges + edge pulses. |
| `src/web/App.tsx` | Register the two new tabs. |
| `package.json` | Add `reactflow` + `dagre` dev deps. |

Estimated impl effort: 1 builder day. Zero new DB tables, zero new events,
zero new services.

## 7. Why this shape (tradeoffs)

- **View, not table.** Avoids write amplification on every lease change.
  The board is a consumer, not a source of truth.
- **React Flow over D3.** D3 gives us more control but costs more code
  for the same result; React Flow's built-ins (minimap, controls,
  animated edges) match what the board needs.
- **Maturity as a node badge, not a separate swimlane.** Keeps the
  graph narrow and matches the P240 Implicit Maturity model — maturity
  is orthogonal to state, so it's a badge on the state node, not a
  parallel dimension.
- **No new event channels.** The existing SSE stream already carries
  the signals we need; splitting them would duplicate plumbing.

## 8. Out of Scope

- Per-agent timelines (P063 fleet view covers this).
- Cost/spending breakdowns per cubic (P090 dashboards cover this).
- Writable actions from the board (gate decisions, lease release) —
  stays read-only in v1 to keep the surface small.

## 9. Open Questions

1. Should idle cubics be hidden by default, or shown as dim cards?
   Recommend **dim cards** so Gary can see capacity at a glance.
2. Should the state-machine view switch per-workflow (Standard RFC vs
   Hotfix), or overlay them? Recommend **per-workflow**, defaulting to
   Standard RFC, with a workflow selector.
3. Do we want historical replay (scrub through the last hour of
   transitions)? Not v1; log it as a follow-up if demand appears.
