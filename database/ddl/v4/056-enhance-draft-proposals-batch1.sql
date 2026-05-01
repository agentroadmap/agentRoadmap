-- ============================================================
-- 056 — Enhance 9 thin DRAFT proposals to developer-ready MATURE
-- Proposals: P184, P242, P246, P248, P303, P403, P477, P747, P249
--
-- Rules:
--   • DML targets roadmap_proposal.proposal (NOT the roadmap.proposal view)
--   • ACs land in roadmap_proposal.proposal_acceptance_criteria
--   • maturity='mature' set AFTER all content is written
--   • gate_decision_log NOT touched (gating is a separate role)
--   • P249: ACs only — motivation/design untouched (already 24k chars)
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- P184 — Belbin / team-role coverage as queue-role composition
-- ════════════════════════════════════════════════════════════

UPDATE roadmap_proposal.proposal
SET
  motivation = $mot$
AgentHive dispatches agents to proposals through the five-axis pickup scorer
(capability_fit, cost_efficiency, difficulty_match, importance_weight,
load_balance). This treats agents as homogeneous workers differentiated only
by cost class and skill tags. Real high-performing teams require complementary
*cognitive* roles.

Meredith Belbin's Team Role framework identifies nine archetypes that naturally
emerge in effective teams:

  Thought roles  — Plant (creative), Monitor Evaluator (critical analyst),
                   Specialist (domain expert)
  Action roles   — Shaper (driver), Implementer (executes), Completer Finisher
                   (quality gatekeeper)
  Social roles   — Coordinator (facilitates), Resource Investigator (external
                   contact), Teamworker (cohesive glue)

When a proposal squad consists entirely of Implementers, no one challenges the
design. When it consists entirely of Plants, nothing ships. The current
system has no guard against this: the pickup scorer can — and does — assemble
squads of identically-biased agents.

The cost is visible in the gate pipeline: squads of similarly-biased agents
sail through their own D1/D2 reviews only to stall at D3 or D4 when a fresh
evaluator first encounters the proposal. Retrofitting critical analysis late
in the pipeline is expensive (context re-loading, revision cycles, budget
overrun).

Belbin-informed queue-slot composition solves this at dispatch time by
ensuring every squad includes at least one critical evaluator (Monitor
Evaluator), one execution anchor (Implementer or Completer Finisher), and one
facilitator (Coordinator) before a squad is considered 'balanced'. Squads
dispatched without balance are flagged; their coverage gap is recorded in the
audit trail for post-hoc analysis.

This is opt-in per queue template: existing squad_dispatch rows continue to
work unchanged unless a `required_belbin_roles` array is specified.
$mot$,

  design = $des$
## Role Taxonomy Table

```sql
CREATE TABLE roadmap_workforce.belbin_role (
  role_slug    TEXT PRIMARY KEY,          -- e.g. 'monitor_evaluator'
  role_name    TEXT NOT NULL,             -- e.g. 'Monitor Evaluator'
  role_category TEXT NOT NULL            -- 'thought' | 'action' | 'social'
    CHECK (role_category IN ('thought','action','social')),
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO roadmap_workforce.belbin_role VALUES
  ('plant',               'Plant',               'thought', 'Creative problem-solver', true),
  ('monitor_evaluator',   'Monitor Evaluator',   'thought', 'Critical analyst, impartial judge', true),
  ('specialist',          'Specialist',          'thought', 'Deep subject-matter expert', true),
  ('shaper',              'Shaper',              'action',  'Drives progress, challenges inertia', true),
  ('implementer',         'Implementer',         'action',  'Turns plans into practical action', true),
  ('completer_finisher',  'Completer Finisher',  'action',  'Ensures quality and on-time delivery', true),
  ('coordinator',         'Coordinator',         'social',  'Clarifies goals, delegates effectively', true),
  ('resource_investigator','Resource Investigator','social','Explores opportunities, external contacts', true),
  ('teamworker',          'Teamworker',          'social',  'Builds cohesion, resolves interpersonal friction', true),
  ('generalist',          'Generalist',          'action',  'Fallback; no specific Belbin classification', true);
```

## Agent Role Assignment

Add to `roadmap_workforce.agent_registry`:
```sql
ALTER TABLE roadmap_workforce.agent_registry
  ADD COLUMN IF NOT EXISTS primary_belbin_role TEXT
    REFERENCES roadmap_workforce.belbin_role(role_slug)
    DEFAULT 'generalist';
```

Multi-role junction (optional, for agents with secondary roles):
```sql
CREATE TABLE roadmap_workforce.agent_belbin_roles (
  agent_identity TEXT  NOT NULL,
  role_slug      TEXT  NOT NULL REFERENCES roadmap_workforce.belbin_role(role_slug),
  is_primary     BOOL  NOT NULL DEFAULT false,
  confidence     SMALLINT NOT NULL DEFAULT 3 CHECK (confidence BETWEEN 1 AND 5),
  PRIMARY KEY (agent_identity, role_slug)
);
```

## Queue Slot Role Requirements

Add to `roadmap_workforce.squad_dispatch`:
```sql
ALTER TABLE roadmap_workforce.squad_dispatch
  ADD COLUMN IF NOT EXISTS required_belbin_roles TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS min_role_coverage     SMALLINT DEFAULT 0;
```

When `min_role_coverage > 0` and `required_belbin_roles` is non-empty, the
claim function checks that the candidate agent's `primary_belbin_role` fills
at least one unfilled slot from `required_belbin_roles` for this proposal.

## Assignment Algorithm (fn_claim_work_offer extension)

1. Compute current squad role coverage:
   ```sql
   SELECT primary_belbin_role, COUNT(*)
   FROM   roadmap_workforce.agent_registry ar
   JOIN   roadmap_proposal.proposal_lease pl ON pl.agent_identity = ar.agent_identity
   WHERE  pl.proposal_id = $proposal_id AND pl.released_at IS NULL
   GROUP BY 1;
   ```
2. Identify uncovered required roles:
   `uncovered = required_belbin_roles - covered_roles`
3. Apply role-coverage multiplier to pickup score:
   - Agent fills an uncovered role → score × 1.25
   - Agent fills an already-covered role when uncovered roles exist → score × 0.85
   - `min_role_coverage` satisfied → no adjustment
4. Standard five-axis score calculation follows unchanged.

## Fallback

If no agent with a needed role is available within `claim_ttl_seconds`:
- Relax the role constraint and claim any eligible agent.
- Emit a `coverage_gap_event` pg_notify payload:
  `{"proposal_id":N,"missing_roles":["monitor_evaluator"],"fallback":true}`
- Record the gap in `roadmap_workforce.squad_coverage_audit`
  (proposal_id, required_roles, actual_roles, gap_roles, claimed_at).

## Coverage View

```sql
CREATE OR REPLACE VIEW roadmap_workforce.v_squad_role_coverage AS
SELECT
  pl.proposal_id,
  p.display_id,
  COUNT(DISTINCT ar.primary_belbin_role) FILTER
    (WHERE br.role_category = 'thought') AS thought_count,
  COUNT(DISTINCT ar.primary_belbin_role) FILTER
    (WHERE br.role_category = 'action') AS action_count,
  COUNT(DISTINCT ar.primary_belbin_role) FILTER
    (WHERE br.role_category = 'social') AS social_count
FROM roadmap_proposal.proposal_lease pl
JOIN roadmap_workforce.agent_registry ar ON ar.agent_identity = pl.agent_identity
JOIN roadmap_workforce.belbin_role br     ON br.role_slug = ar.primary_belbin_role
JOIN roadmap_proposal.proposal p          ON p.id = pl.proposal_id
WHERE pl.released_at IS NULL
GROUP BY pl.proposal_id, p.display_id;
```
$des$,

  alternatives = $alt$
**A1 — Simple skill-tag approach** (`tag: critic`, `tag: builder`)
Avoids a formal taxonomy. Easier to implement. Loses category-balance
enforcement and theoretical grounding. Doesn't distinguish between thought/
action/social gaps. Rejected: insufficient for squad-health diagnostics.

**A2 — Hardcode roles directly on agent_registry without taxonomy table**
Faster to ship. Inflexible as roles evolve (no FK, no description, no
category). Rejected: schema rigidity outweighs the speed gain.

**A3 — Orchestrator-layer-only role weights (no schema change)**
No schema dependency. Not queryable or auditable. Requires every orchestrator
to re-implement the same logic. Rejected: duplicates logic, no audit trail.

**A4 — Do nothing; rely on gate reviewers to catch blind spots**
Zero engineering cost. Fails entirely for fully-automated pipelines and adds
cost when blind spots are caught late at D3/D4. Deferred, not rejected —
acceptable as a temporary measure during phased rollout.
$alt$,

  drawbacks = $drw$
- **Assignment latency**: role-coverage query adds one extra DB round-trip per
  `fn_claim_work_offer` call. Must be indexed on (proposal_id, released_at).

- **Classification accuracy**: incorrect Belbin assignments produce worse squads
  than no classification. Agents should be classified by observed behaviour,
  not self-declaration. An audit of classification accuracy is needed post-
  rollout (target: ≥80% agreement between declared and gate-review-observed role
  at 60 days).

- **Small agent pools**: pools of fewer than 5 active agents may not cover all
  nine roles, causing frequent fallback and audit noise. Threshold-based
  disabling recommended when pool size < `min_role_coverage` × 2.

- **Framework mismatch**: Belbin was designed for human teams. LLM agents
  exhibit probabilistic rather than stable behavioural archetypes. The mapping
  is heuristic; treat coverage metrics as directional, not prescriptive.

- **Schema coupling**: adds a hard dependency between the orchestration path and
  the `roadmap_workforce.belbin_role` reference table. Schema drift (e.g.,
  role_slug rename) breaks claim logic.
$drw$
WHERE id = 184;

-- ACs for P184
INSERT INTO roadmap_proposal.proposal_acceptance_criteria
  (proposal_id, item_number, criterion_text) VALUES
(184, 1, 'Given the belbin_role table is seeded, when SELECT * FROM roadmap_workforce.belbin_role is run, then exactly 10 rows (9 Belbin archetypes + generalist) are returned with correct role_category values.'),
(184, 2, 'Given an agent with primary_belbin_role = ''monitor_evaluator'' and a squad_dispatch requiring [''monitor_evaluator'',''implementer''], when fn_claim_work_offer is called, then the monitor_evaluator slot is marked covered and the agent receives a 1.25× score multiplier.'),
(184, 3, 'Given no agent with a required role is available within claim_ttl_seconds, when fn_claim_work_offer falls back, then a coverage_gap_event pg_notify is emitted and a row is inserted into squad_coverage_audit with gap_roles populated.'),
(184, 4, 'Given a proposal with 3 active leases all with role_category=''action'', when v_squad_role_coverage is queried, then thought_count=0 and social_count=0 are returned for that proposal_id.'),
(184, 5, 'Given an agent_registry row without a primary_belbin_role set, when a squad is assembled, then the agent''s role defaults to ''generalist'' and no NOT NULL violation occurs.'),
(184, 6, 'Given a squad_dispatch with required_belbin_roles={} and min_role_coverage=0, when fn_claim_work_offer runs, then no role-coverage filtering is applied and behaviour is identical to pre-P184 logic.'),
(184, 7, 'Given a squad that achieves full thought/action/social coverage, when the coverage view is queried, then thought_count ≥ 1, action_count ≥ 1, social_count ≥ 1 for that proposal.')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- P242 — Complete Mature Re-Evaluation Loop
-- ════════════════════════════════════════════════════════════

UPDATE roadmap_proposal.proposal
SET
  motivation = $mot$
When proposals advance to DEVELOP status they claim a valuable slot in the
implementation queue. In practice many stall: their implementing agent context-
switched, a blocking dependency was never resolved, or the underlying
requirement was superseded by later work. No mechanism currently detects this
staleness and re-examines whether the proposal still deserves its DEVELOP slot.

The result is a dead-weight accumulation problem. The queue grows, scheduling
pressure increases, and agents occasionally pick up stale proposals mid-
implementation only to discover the design is outdated — wasting budget and
reopening scope already considered closed.

Three distinct staleness signals should trigger re-evaluation:

1. **Time-based**: `modified_at` has not changed in > N days and no active
   lease exists. Indicates work has silently stopped.
2. **Dependency-resolved-but-unpicked**: all blocking dependencies have
   resolved, yet no agent has claimed the proposal within M days. Indicates the
   pick-up queue is backlogged or the proposal is orphaned.
3. **Supersession**: a newer proposal explicitly supersedes this one (via
   proposal_dependencies.dependency_type='supersedes') but the older proposal
   remains in DEVELOP.

Without the re-evaluation loop, the only way to clean up stale proposals is
manual PM intervention — a process that doesn't scale and requires context
re-loading that should have been automated.

The loop resolves to one of three outcomes: **keep** (proposal is still
relevant; refresh timestamp), **revise** (proposal needs rework; revert to
REVIEW), or **obsolete** (proposal is superseded or no longer needed; close
with audit note). These outcomes are written to the re-eval queue and the
maturity transition history so no information is lost.
$mot$,

  design = $des$
## Staleness Criteria (configurable via runtime_config)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `reeval_stale_days` | 21 | Days since modified_at before time-based flag triggers |
| `reeval_unblocked_pickup_days` | 7 | Days after last dependency resolves before unpicked flag |
| `reeval_superseded_auto_obsolete` | false | Whether superseded proposals auto-obsolete without reeval |

## Re-Eval Queue Table

```sql
CREATE TABLE roadmap_proposal.proposal_reeval_queue (
  id               BIGSERIAL PRIMARY KEY,
  proposal_id      BIGINT NOT NULL REFERENCES roadmap_proposal.proposal(id),
  flagged_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  staleness_reason TEXT NOT NULL   -- 'time_based' | 'unblocked_unpicked' | 'superseded'
    CHECK (staleness_reason IN ('time_based','unblocked_unpicked','superseded')),
  outcome          TEXT            -- NULL = pending; 'keep'|'revise'|'obsolete'
    CHECK (outcome IS NULL OR outcome IN ('keep','revise','obsolete')),
  decided_by       TEXT,           -- agent_identity or 'system'
  decision_notes   TEXT,
  resolved_at      TIMESTAMPTZ,
  UNIQUE (proposal_id)             -- only one open reeval per proposal
    DEFERRABLE INITIALLY DEFERRED
);
```

## Staleness Detection Function

```sql
CREATE OR REPLACE FUNCTION roadmap.fn_flag_stale_proposals()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_stale_days  INT := COALESCE(
    (SELECT value::int FROM roadmap.runtime_config WHERE key='reeval_stale_days'), 21);
  v_pickup_days INT := COALESCE(
    (SELECT value::int FROM roadmap.runtime_config WHERE key='reeval_unblocked_pickup_days'), 7);
  v_flagged     INT := 0;
BEGIN
  -- Time-based staleness
  INSERT INTO roadmap_proposal.proposal_reeval_queue (proposal_id, staleness_reason)
  SELECT p.id, 'time_based'
  FROM   roadmap_proposal.proposal p
  WHERE  p.status = 'DEVELOP'
    AND  p.modified_at < now() - (v_stale_days || ' days')::interval
    AND  NOT EXISTS (
           SELECT 1 FROM roadmap_proposal.proposal_lease pl
           WHERE  pl.proposal_id = p.id AND pl.released_at IS NULL)
    AND  NOT EXISTS (
           SELECT 1 FROM roadmap_proposal.proposal_reeval_queue q
           WHERE  q.proposal_id = p.id AND q.outcome IS NULL)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_flagged = ROW_COUNT;

  -- Unblocked-but-unpicked staleness
  INSERT INTO roadmap_proposal.proposal_reeval_queue (proposal_id, staleness_reason)
  SELECT p.id, 'unblocked_unpicked'
  FROM   roadmap_proposal.proposal p
  WHERE  p.status = 'DEVELOP'
    AND  NOT EXISTS (
           SELECT 1 FROM roadmap_proposal.proposal_dependencies d
           WHERE  d.to_proposal_id = p.id
             AND  d.dependency_type = 'blocks'
             AND  d.resolved = false)
    AND  p.modified_at < now() - (v_pickup_days || ' days')::interval
    AND  NOT EXISTS (
           SELECT 1 FROM roadmap_proposal.proposal_reeval_queue q
           WHERE  q.proposal_id = p.id AND q.outcome IS NULL)
  ON CONFLICT DO NOTHING;

  RETURN v_flagged;
END;
$$;
```

Schedule: `SELECT cron.schedule('flag-stale-proposals', '0 2 * * *',
'SELECT roadmap.fn_flag_stale_proposals()');`

## MCP Re-Eval Dispatch

The MCP server polls `proposal_reeval_queue WHERE outcome IS NULL` every 30s.
For each row it spawns a 'reeval' agent task with instructions to:
1. Read the proposal motivation, design, current dependencies.
2. Assess continued relevance against the current roadmap state.
3. Write a brief assessment note to `proposal_discussions` with
   `context_prefix = 'feedback:'`.
4. Call the `reeval_decide` MCP tool with `outcome` ∈ {'keep','revise','obsolete'}
   and `decision_notes`.

## Outcome State Transitions

| Outcome | Status change | Maturity change | Audit note |
|---------|--------------|-----------------|------------|
| keep    | none         | none            | modified_at refreshed; reeval row resolved |
| revise  | DEVELOP → REVIEW | mature → new | 'reverted-by-reeval: {reason}' |
| obsolete | any → COMPLETE | any → obsolete | 'obsoleted-by-reeval: {reason}' |

All transitions write to `proposal_maturity_transitions` with
`transition_agent = 'system:reeval'`.

## Audit Trail

Every reeval outcome inserts into `proposal_maturity_transitions`:
```
(proposal_id, from_maturity, to_maturity, transition_agent,
 transition_reason, transitioned_at)
```
$des$,

  alternatives = $alt$
**A1 — Human-driven review cadence (weekly PM triage of stale DEVELOP)**
No automation. High human overhead; doesn't scale past ~50 active proposals.
Acceptable as a temporary bridge until P242 ships.

**A2 — Simple TTL: auto-revert DEVELOP → REVIEW after N days**
Blunt instrument. Reverts legitimate long-running proposals. No intelligence
about whether staleness is genuine. Rejected: too many false positives.

**A3 — Reuse decision_queue with a new 'reeval' decision type**
Reuses existing infrastructure. Conflates gate decisions (D1-D4 quality gates)
with staleness reviews (orthogonal concern). Rejected: separation of concerns.

**A4 — pg_notify event-driven approach on dependency resolution**
More real-time for the 'unblocked-unpicked' case. Misses time-based staleness
entirely. Complementary, not a replacement — could be added as a fast-path
alongside the nightly batch function.
$alt$,

  drawbacks = $drw$
- **Token cost**: reeval agents consume LLM budget for proposals a human could
  dismiss in seconds. Mitigate by limiting reeval tasks to lightweight
  (budget-tier) models.

- **Threshold aggression**: N=21 days may revert legitimate proposals in active
  but slow-moving phases (e.g., waiting for an external API partner). Allow
  per-proposal override via a `reeval_exempt_until` date column.

- **pg_cron dependency**: adds an infrastructure requirement not currently
  verified in the stack. Alternative: call `fn_flag_stale_proposals()` from a
  Node.js setInterval in the MCP server process.

- **'Obsolete' is irreversible by convention**: marking a proposal obsolete may
  frustrate the original author if the reasoning is wrong. The decision_notes
  field must be mandatory for 'obsolete' outcomes.

- **Cascading revals**: a revised proposal (DEVELOP → REVIEW) that stalls again
  in REVIEW will re-enter the flag cycle. Add a `reeval_count` column and a
  hard cap (e.g., 3 reevals → mandatory human escalation).
$drw$
WHERE id = 242;

-- ACs for P242
INSERT INTO roadmap_proposal.proposal_acceptance_criteria
  (proposal_id, item_number, criterion_text) VALUES
(242, 1, 'Given a DEVELOP proposal with modified_at > 21 days ago and no active lease, when fn_flag_stale_proposals() is called, then a row with staleness_reason=''time_based'' is inserted into proposal_reeval_queue with outcome IS NULL.'),
(242, 2, 'Given a DEVELOP proposal whose last blocking dependency resolved > 7 days ago and no agent has claimed it, when fn_flag_stale_proposals() runs, then a row with staleness_reason=''unblocked_unpicked'' is inserted.'),
(242, 3, 'Given a reeval queue row with outcome IS NULL, when the reeval agent decides outcome=''revise'', then the proposal status transitions to REVIEW, maturity resets to ''new'', and a proposal_maturity_transitions row is written with transition_agent=''system:reeval''.'),
(242, 4, 'Given outcome=''obsolete'' is chosen by the reeval agent, when the outcome is committed, then proposal.status=''COMPLETE'', maturity=''obsolete'', and a proposal_discussions note with context_prefix=''feedback:'' is present.'),
(242, 5, 'Given a proposal already in the reeval queue with outcome IS NULL, when fn_flag_stale_proposals() runs again, then no duplicate row is inserted (ON CONFLICT DO NOTHING is respected).'),
(242, 6, 'Given runtime_config key reeval_stale_days is set to 14, when fn_flag_stale_proposals() runs, then proposals with modified_at < now()-14 days are flagged (not 21 days).'),
(242, 7, 'Given outcome=''keep'', when the decision is written, then proposal.modified_at is refreshed, no status change occurs, and proposal_reeval_queue.resolved_at is populated.')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- P246 — Per-million pricing + cache columns
-- ════════════════════════════════════════════════════════════

UPDATE roadmap_proposal.proposal
SET
  motivation = $mot$
The LLM pricing market standardised on per-million-token units in 2024.
Anthropic, OpenAI, and Google all publish prices as $/1M tokens. AgentHive's
`model_metadata` table uses $/1k (cost_per_1k_input, cost_per_1k_output) — a
legacy unit that requires a 1000× conversion at every billing call site.

Migration 005 added the per-million columns to the schema.
Migration 006 backfilled known prices. However, the code path that *uses* these
columns is gated behind `supportsPerMillionRoutePricing()` in agent-spawner.ts,
which probes `information_schema` for the column names. If the probe returns
false — due to schema search-path issues or a column rename — the entire per-
million billing path silently degrades to per-1k fallback or zero-billing.

This proposal:
1. Formalises the exact column names, precision, and NULL/zero semantics for
   both `model_metadata` and `model_routes`.
2. Specifies the robust column-existence probe (pg_attribute, not
   information_schema).
3. Addresses prompt-cache pricing: providers have distinct prices for cache
   *writes* (typically 125% of base input, Anthropic) and cache *reads* (10%
   of base input, Anthropic; 50%, OpenAI cached-input). These must be tracked
   as separate columns; conflating them under a single "cache cost" column
   causes systematic billing errors.
4. Defines the billing formula change at the spending layer so that
   `agent_runs.cost_usd` is correctly computed from per-million prices once the
   columns are live.

The economic risk of not shipping this is under-billing when cache hits are
frequent (the system charges full input price instead of 10% cache-read price)
and over-billing when cache writes are charged at 125% but the system uses the
base 100% price.
$mot$,

  design = $des$
## Exact DDL

### model_metadata (catalog — read reference)

```sql
ALTER TABLE roadmap.model_metadata
  ADD COLUMN IF NOT EXISTS cost_per_1m_input        numeric(12,6),
  ADD COLUMN IF NOT EXISTS cost_per_1m_output       numeric(12,6),
  ADD COLUMN IF NOT EXISTS cache_write_cost_per_1m  numeric(12,6),
  ADD COLUMN IF NOT EXISTS cache_read_cost_per_1m   numeric(12,6);

ALTER TABLE roadmap.model_metadata
  DROP CONSTRAINT IF EXISTS model_metadata_cost_per_1m_nonneg,
  ADD  CONSTRAINT model_metadata_cost_per_1m_nonneg CHECK (
    (cost_per_1m_input       IS NULL OR cost_per_1m_input       >= 0) AND
    (cost_per_1m_output      IS NULL OR cost_per_1m_output      >= 0) AND
    (cache_write_cost_per_1m IS NULL OR cache_write_cost_per_1m >= 0) AND
    (cache_read_cost_per_1m  IS NULL OR cache_read_cost_per_1m  >= 0)
  );
```

### model_routes (billing source of truth)

```sql
ALTER TABLE roadmap.model_routes
  ADD COLUMN IF NOT EXISTS cost_per_1m_input        numeric(12,6),
  ADD COLUMN IF NOT EXISTS cost_per_1m_output       numeric(12,6),
  ADD COLUMN IF NOT EXISTS cache_write_cost_per_1m  numeric(12,6),
  ADD COLUMN IF NOT EXISTS cache_read_cost_per_1m   numeric(12,6);

ALTER TABLE roadmap.model_routes
  DROP CONSTRAINT IF EXISTS model_routes_cost_per_1m_nonneg,
  ADD  CONSTRAINT model_routes_cost_per_1m_nonneg CHECK (
    (cost_per_1m_input       IS NULL OR cost_per_1m_input       >= 0) AND
    (cost_per_1m_output      IS NULL OR cost_per_1m_output      >= 0) AND
    (cache_write_cost_per_1m IS NULL OR cache_write_cost_per_1m >= 0) AND
    (cache_read_cost_per_1m  IS NULL OR cache_read_cost_per_1m  >= 0)
  );
```

## Precision Rationale

`numeric(12,6)` accommodates:
- Cheapest routed open-weight model: ~$0.000800/M → 0.000800 (6 dp)
- Frontier cache-write: ~$75.000000/M → 75.000000 (12 total digits)

`numeric(14,6)` was also considered; the extra 2 integer digits are unnecessary
for realistic LLM pricing but would not cause harm. Chosen for minimal storage.

## NULL vs 0 Semantics

| Column value | Meaning |
|--------------|---------|
| NULL         | Provider has no distinct price for this dimension; use base input/output price |
| 0            | Provider explicitly offers this dimension at no cost (e.g., free-tier cache) |

These must never be conflated. The billing formula must test `IS NOT NULL` before
using a cache column, not `> 0`.

## Billing Formula

```typescript
function computeCostUsd(run: AgentRun, route: ModelRoute): number {
  const inputCost = route.cost_per_1m_input != null
    ? (run.tokens_in / 1_000_000) * Number(route.cost_per_1m_input)
    : (run.tokens_in / 1000) * Number(route.cost_per_1k_input ?? 0);

  const outputCost = route.cost_per_1m_output != null
    ? (run.tokens_out / 1_000_000) * Number(route.cost_per_1m_output)
    : (run.tokens_out / 1000) * Number(route.cost_per_1k_output ?? 0);

  const cacheWriteCost = route.cache_write_cost_per_1m != null
    ? (run.cache_write_tokens / 1_000_000) * Number(route.cache_write_cost_per_1m)
    : 0;

  const cacheReadCost = route.cache_read_cost_per_1m != null
    ? (run.cache_read_tokens / 1_000_000) * Number(route.cache_read_cost_per_1m)
    : 0;

  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}
```

## Robust Column-Existence Probe

Replace the `information_schema` probe with `pg_attribute`:

```typescript
const result = await query(`
  SELECT COUNT(*) AS cnt
  FROM   pg_attribute
  WHERE  attrelid = 'roadmap.model_routes'::regclass
    AND  attname  = 'cost_per_1m_input'
    AND  NOT attisdropped
`);
return Number(result.rows[0].cnt) > 0;
```

`information_schema` reflects the current `search_path`; `pg_attribute` with a
schema-qualified regclass cast is unambiguous and faster.
$des$,

  alternatives = $alt$
**A1 — Keep per-1k pricing and multiply internally when displaying**
Avoids schema change. Perpetuates confusion at every call site and makes
provider price sheets difficult to compare directly. Rejected: tech debt that
grows with every new provider integration.

**A2 — Single flexible jsonb pricing column**
`pricing JSONB` can represent any price structure. Not constrainable with CHECK,
not indexable, not queryable with simple arithmetic. Rejected: operational
diagnostics require columnar access.

**A3 — Separate normalised model_pricing_tiers table**
Cleaner separation: model → pricing tier → price per dimension. More joins for
every cost calculation. Premature normalisation for a table with < 100 rows.
Rejected: overhead outweighs benefit at current scale.

**A4 — Accept both per-1k and per-1m columns permanently (no deprecation)**
Simplest migration path. Creates permanent confusion about which column is
canonical. Requires documenting which takes precedence. Accepted as *interim
state* pending a future migration that drops cost_per_1k_* after all call
sites are verified.
$alt$,

  drawbacks = $drw$
- **Dual-representation window**: both per-1k and per-1m columns exist during
  the transition. Agents or scripts that read cost_per_1k_input still work but
  silently use stale pricing. Every cost calculation must be audited to confirm
  it prefers the per-1m column.

- **Column naming drift**: migration 005 used `cost_per_million_cache_hit`;
  this proposal specifies `cache_read_cost_per_1m`. Renaming requires all
  references in TypeScript to be updated atomically with the DDL migration.
  A search-and-replace pass over the codebase is required before the migration
  runs.

- **Cache token tracking prerequisite**: the billing formula above references
  `run.cache_write_tokens` and `run.cache_read_tokens`, which may not exist on
  `agent_runs` today. A companion migration must add these columns before
  per-million cache billing is live.

- **Provider price-sheet maintenance**: NULL values are permissible at launch,
  but operators must actively populate cache columns as providers update their
  pricing. A stale NULL means cache savings go unreported even when they occur.
$drw$
WHERE id = 246;

-- ACs for P246
INSERT INTO roadmap_proposal.proposal_acceptance_criteria
  (proposal_id, item_number, criterion_text) VALUES
(246, 1, 'Given the DDL migration is applied, when SELECT attname FROM pg_attribute WHERE attrelid=''roadmap.model_routes''::regclass AND attname IN (''cost_per_1m_input'',''cost_per_1m_output'',''cache_write_cost_per_1m'',''cache_read_cost_per_1m''), then all 4 column names are returned.'),
(246, 2, 'Given a model_routes row with cost_per_1m_input=3.000000 and tokens_in=500000, when computeCostUsd is called, then cost_usd = (500000/1000000)*3.0 = 1.500000 USD (not the per-1k equivalent).'),
(246, 3, 'Given a model_routes row with cache_read_cost_per_1m=NULL, when computeCostUsd is called with cache_read_tokens=100000, then cache read cost contribution is 0.0 (NULL treated as "no cache pricing", not as free).'),
(246, 4, 'Given a model_routes row with cache_write_cost_per_1m=3.750000 (125% of $3/M input), when 1M cache-write tokens are billed, then cache_write_cost = $3.75, not $3.00.'),
(246, 5, 'Given the robust column-existence probe using pg_attribute, when supportsPerMillionRoutePricing() is called after the columns are added, then it returns true without relying on information_schema.'),
(246, 6, 'Given a CHECK constraint on model_routes, when an INSERT attempts cost_per_1m_input = -0.5, then the INSERT is rejected with a constraint violation error.'),
(246, 7, 'Given both per-1k and per-1m columns are populated on the same route row, when the billing formula runs, then the per-1m columns take precedence and per-1k columns are ignored.')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- P248 — Board workflow visualization from SMDL queues
-- ════════════════════════════════════════════════════════════

UPDATE roadmap_proposal.proposal
SET
  motivation = $mot$
The web board (Board.tsx + lib/lanes.ts) builds its Kanban columns from a
`statuses` array passed via WebSocket state. This array is populated from a
hardcoded list in the client or server bootstrap — not from the database. The
consequence is that the board layout is decoupled from the running workflow
state machine in two ways:

1. **New states aren't reflected until the code is redeployed.** When a new
   `workflow_stage` is added (e.g., a SECURITY_REVIEW stage for a new proposal
   type), the board shows no column for it and proposals in that state appear
   in an 'Unknown' catch-all.

2. **Per-project workflow variation is impossible.** P477 (multi-project
   control plane) introduces projects with different workflow templates
   (e.g., `RFC 5-Stage` vs `Hotfix 2-Stage`). A hardcoded column list serves
   only the default workflow.

The `roadmap.workflow_stages` table already encodes the authoritative ordered
stage list for every workflow template. The board should derive its column
definitions from this live data, making it a true mirror of the workflow state
machine. This also enables dwell-time analytics: how many days does a proposal
spend in each stage? That metric is critical for identifying pipeline
bottlenecks and is invisible without a board that knows its column definitions
from authoritative DB data.
$mot$,

  design = $des$
## Data Source

Column definitions are read from:

```sql
SELECT
  ws.stage_name,
  ws.stage_order,
  ws.stage_name                        AS display_label,
  CASE ws.stage_name
    WHEN 'COMPLETE' THEN true
    WHEN 'MERGE'    THEN true
    ELSE false
  END                                  AS is_terminal,
  ws.maturity_gate
FROM roadmap.workflow_stages ws
JOIN roadmap.workflow_templates wt ON wt.id = ws.template_id
WHERE wt.name = $1          -- e.g. 'RFC 5-Stage'
  AND ws.is_active = true
ORDER BY ws.stage_order;
```

## API Endpoint

Add to the WebSocket server (or as a REST route on the existing HTTP server):

```
GET /api/board-columns?workflowName=RFC+5-Stage
```

Response schema:
```json
[
  { "stage_name": "DRAFT",    "stage_order": 1, "display_label": "Draft",
    "is_terminal": false, "maturity_gate": null },
  { "stage_name": "REVIEW",   "stage_order": 2, "display_label": "Review",
    "is_terminal": false, "maturity_gate": 1 },
  ...
]
```

The endpoint is served with `Cache-Control: max-age=300` (5 minutes). A
`?bust=<ts>` parameter forces revalidation.

## Frontend Change (Board.tsx)

Replace:
```tsx
const statuses = ['DRAFT','REVIEW','DEVELOP','MERGE','COMPLETE'];
```

With:
```tsx
const { columns, isLoading } = useBoardColumns(projectSlug, workflowName);
```

`useBoardColumns` fetches `/api/board-columns` on mount and on WebSocket
reconnect, returns a loading skeleton while pending.

## Proposal Stage Dwell Table

```sql
CREATE TABLE roadmap_proposal.proposal_stage_dwell (
  id            BIGSERIAL PRIMARY KEY,
  proposal_id   BIGINT       NOT NULL REFERENCES roadmap_proposal.proposal(id),
  stage_name    TEXT         NOT NULL,
  entered_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  exited_at     TIMESTAMPTZ,
  dwell_seconds BIGINT GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (COALESCE(exited_at, now()) - entered_at))::BIGINT
  ) STORED
);

CREATE INDEX idx_stage_dwell_proposal ON roadmap_proposal.proposal_stage_dwell(proposal_id);
CREATE INDEX idx_stage_dwell_stage    ON roadmap_proposal.proposal_stage_dwell(stage_name);
```

Populated by extending `fn_sync_proposal_maturity`: on status change, set
`exited_at = now()` on the open row for the old status, insert a new row for
the new status.

## Dwell Statistics View

```sql
CREATE OR REPLACE VIEW roadmap_proposal.v_stage_dwell_stats AS
SELECT
  stage_name,
  COUNT(*)                                  AS proposal_count,
  ROUND(AVG(dwell_seconds)/86400.0, 1)      AS avg_dwell_days,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
        (ORDER BY dwell_seconds)/86400.0,1) AS median_dwell_days,
  MAX(dwell_seconds)/86400                  AS max_dwell_days
FROM roadmap_proposal.proposal_stage_dwell
WHERE exited_at IS NOT NULL
GROUP BY stage_name;
```

The board column tooltip shows `avg_dwell_days` from this view.

## Refresh Cadence

Column definitions: 5-minute client cache, manual refresh button in the board
header, automatic refresh on WebSocket reconnect.

Dwell stats: refreshed with every proposal WebSocket event (incremental).

## Multi-Workflow Column Union

When proposals of multiple workflow types are mixed on the board:
- Columns = UNION of all active workflow stage names, ordered by max(stage_order)
  across all templates.
- Proposals in a stage not in their own template appear in an 'Other' overflow lane.
$des$,

  alternatives = $alt$
**A1 — Hardcoded columns in a config file (e.g., board.config.json)**
Simpler. Still decoupled from the DB. Adds a third source of truth (DB,
server config, client code). Rejected: violates single-source-of-truth principle.

**A2 — Derive columns from distinct status values of current proposals**
Dynamic without any schema change. Lossy: stages with zero proposals disappear
from the board. Empty stages are informative (pipeline bottleneck visualisation).
Rejected: too lossy.

**A3 — Dedicated board_config table separate from workflow_stages**
Maximum flexibility to customise board appearance independently of workflow.
Diverges from the workflow definition as the single source of truth. Adds a
maintenance burden (keep board_config in sync with workflow_stages). Rejected:
complexity outweighs benefit.

**A4 — Per-project board config YAML in the repository**
Simple file-based approach. Requires a deploy to change the board. Doesn't
support runtime multi-project switching without per-project config files.
Rejected for live multi-project support; acceptable as a fallback for offline/
static deployments.
$alt$,

  drawbacks = $drw$
- **workflow_stages misconfiguration breaks the board for all users**: if a
  stage is accidentally deleted or marked inactive, it disappears from the board
  immediately. A minimum-columns guard (always show DRAFT..COMPLETE as fallback)
  is recommended.

- **Extra cold-start round-trip**: the board now makes a `/api/board-columns`
  request before it can render. On slow connections this adds perceivable
  latency. Mitigate with an optimistic render using cached column data from
  localStorage.

- **Multi-workflow column union UX**: when proposal types with very different
  lifecycles are mixed on one board (RFC 5-Stage has DEVELOP; Hotfix 2-Stage
  does not), the union creates confusing empty columns. A "filter by workflow"
  control is needed in the board header.

- **proposal_stage_dwell growth**: one row per proposal per stage transition.
  A 500-proposal project cycling through 5 stages = 2,500+ rows/year. Partition
  by year or add a TTL policy for terminal-state proposals.

- **Trigger coverage**: if proposals are moved between statuses via direct SQL
  (bypassing the trigger), dwell records are never written. All status-change
  paths must go through the trigger or call fn_sync_proposal_maturity explicitly.
$drw$
WHERE id = 248;

-- ACs for P248
INSERT INTO roadmap_proposal.proposal_acceptance_criteria
  (proposal_id, item_number, criterion_text) VALUES
(248, 1, 'Given workflow_stages for ''RFC 5-Stage'' contains 5 active rows, when GET /api/board-columns?workflowName=RFC+5-Stage is called, then exactly 5 column objects are returned in stage_order order.'),
(248, 2, 'Given a new workflow stage ''SECURITY_REVIEW'' is inserted into workflow_stages with stage_order=3, when the board-columns endpoint is called, then SECURITY_REVIEW appears as a column between REVIEW and DEVELOP without any code redeployment.'),
(248, 3, 'Given a proposal transitions from DRAFT to REVIEW, when the status-change trigger fires, then a proposal_stage_dwell row is inserted for REVIEW with entered_at=now() and the DRAFT row receives exited_at=now().'),
(248, 4, 'Given v_stage_dwell_stats is queried for a stage with 10 completed proposals, then avg_dwell_days and median_dwell_days are non-null and within a plausible range (0.1 to 365 days).'),
(248, 5, 'Given the board renders with columns derived from the API, when a column has zero proposals, it still renders as an empty column (not hidden), allowing pipeline-bottleneck visibility.'),
(248, 6, 'Given a Board.tsx component using useBoardColumns, when the WebSocket reconnects, then useBoardColumns re-fetches column definitions within 5 seconds.'),
(248, 7, 'Given the board-columns endpoint response, when Cache-Control: max-age=300 is set, then a second request within 5 minutes returns a 304 Not Modified or a cached response from the browser.')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- P303 — Platform messaging gateway as transport wake-up adapter
-- ════════════════════════════════════════════════════════════

UPDATE roadmap_proposal.proposal
SET
  motivation = $mot$
AgentHive's notification pipeline delivers messages to external transports
(Discord, email, SMS, push) via `notification_queue` polled by transport-
specific bridges. When a bridge is unavailable — Discord process restart, rate
limit, network partition — messages either accumulate indefinitely in the queue
with no retry semantics, or the bridge process crashes and drops them silently.
There is no shared concept of transport health, no wake-up protocol, and no
dead-letter queue.

As AgentHive adds more transports (the `notification_queue.channel` CHECK
constraint already anticipates: discord, email, sms, push, digest), each
transport will independently implement its own error handling. Without a
gateway abstraction, the codebase accumulates N slightly-different polling loops
with N slightly-different retry policies — a maintenance and reliability burden.

The messaging gateway solves this by providing:

1. **A unified dispatch surface** that routes messages to the correct transport
   adapter without callers needing to know which transport handles which channel.

2. **A wake-up contract**: a sleeping transport (one that has missed its
   heartbeat window) receives a `wakeUp()` call before message delivery is
   attempted, giving it a defined window to come online before the message is
   retried or dead-lettered.

3. **Shared retry/backoff policy** — all transports benefit from truncated
   exponential backoff implemented once in the gateway, not once per bridge.

4. **Observable health state** — transport registry in the DB means health
   status is queryable, alertable, and auditable. Today there is no
   authoritative record of which transports are online.

The economic case: Discord bridge downtime during a budget-threshold breach
event means the operator is never notified. At current spend rates this is a
material risk — a breached budget can continue spending for hours before
manual detection.
$mot$,

  design = $des$
## Adapter Interface

```typescript
// src/core/messaging/gateway/adapter.ts

export type NotificationChannel = 'discord'|'email'|'sms'|'push'|'digest';
export type FailureAction = 'retry' | 'dlq' | 'drop';

export interface OutboundMessage {
  notificationId: bigint;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata?: Record<string,unknown>;
}

export interface SendResult {
  success: boolean;
  externalId?: string;  // transport-assigned message ID for dedup
  errorCode?: string;
}

export interface TransportAdapter {
  readonly transportId: string;
  readonly channel: NotificationChannel;

  /** True if the transport is ready to accept messages right now. */
  isAvailable(): Promise<boolean>;

  /** Attempt to bring the transport online; resolves when ready or rejects
   *  after wakeTimeoutMs. Idempotent. */
  wakeUp(wakeTimeoutMs?: number): Promise<void>;

  send(msg: OutboundMessage): Promise<SendResult>;

  /** Called by the gateway on send failure. Returns desired failure action. */
  onFailure(msg: OutboundMessage, err: Error): Promise<FailureAction>;
}
```

## Transport Registry Table

```sql
CREATE TABLE roadmap.transport_registry (
  transport_id    TEXT PRIMARY KEY,     -- e.g. 'discord', 'email-sendgrid'
  channel         TEXT NOT NULL         -- matches notification_queue.channel
    CHECK (channel IN ('discord','email','sms','push','digest')),
  status          TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('online','offline','degraded','unknown')),
  last_heartbeat  TIMESTAMPTZ,
  config          JSONB,                -- transport-specific settings (no secrets)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Transports update their row's `status` and `last_heartbeat` every 30s.
The gateway considers a transport 'offline' when
`last_heartbeat < now() - interval '90 seconds'`.

## Wake-Up Contract

A wake-up call:
1. Checks transport `status` in `transport_registry`.
2. If status = 'online' → no-op; resolve immediately.
3. If status = 'offline'/'unknown' → emit `pg_notify('transport_wake',
   '{"transport":"discord"}')`.
4. Wait up to `wakeTimeoutMs` (default 10000) for the transport to update its
   `last_heartbeat` and set `status='online'` in the registry.
5. Poll the registry every 500ms during the wait window.
6. Resolve if online; reject with `TransportWakeTimeoutError` if timeout expires.

## Retry / Backoff Policy

| Attempt | Delay | Action on failure |
|---------|-------|-------------------|
| 1       | 5s    | retry             |
| 2       | 15s   | retry             |
| 3       | 60s   | retry             |
| 4       | 300s  | retry             |
| 5       | —     | DLQ               |

## Dead-Letter Queue

```sql
CREATE TABLE roadmap.notification_dlq (
  id               BIGSERIAL PRIMARY KEY,
  notification_id  BIGINT NOT NULL REFERENCES roadmap.notification(id),
  channel          TEXT   NOT NULL,
  last_error       TEXT,
  attempt_count    SMALLINT NOT NULL DEFAULT 0,
  first_failed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT
);
```

DLQ rows are retried manually by an operator or automatically after 24h via a
pg_cron job. Resolution is recorded in `resolution_note`.

## Gateway Dispatch Loop

Replace the existing notification_queue poller with:

```typescript
async function gatewayDispatchLoop() {
  const pending = await getPendingNotifications();  // WHERE status='pending'
  for (const msg of pending) {
    const adapter = registry.getAdapter(msg.channel);
    if (!await adapter.isAvailable()) {
      await adapter.wakeUp();   // may throw TransportWakeTimeoutError
    }
    const result = await retryWithBackoff(() => adapter.send(msg), BACKOFF_POLICY);
    if (result.success) {
      await markNotificationSent(msg.notificationId, result.externalId);
    } else {
      await moveToDlq(msg, result.errorCode);
    }
  }
}
```

## Transport Registration on Startup

Each transport adapter calls:
```sql
INSERT INTO roadmap.transport_registry (transport_id, channel, status, last_heartbeat)
VALUES ($1, $2, 'online', now())
ON CONFLICT (transport_id) DO UPDATE
  SET status='online', last_heartbeat=now(), updated_at=now();
```

The gateway subscribes to `pg_notify('transport_registry_changed')` to reload
the adapter map without restart.
$des$,

  alternatives = $alt$
**A1 — Simple restart-and-retry in each bridge (no gateway)**
Solves the immediate Discord problem. Duplicates retry logic in every future
transport. Rejected: the accumulating maintenance debt is the primary motivation.

**A2 — Dedicated message broker (RabbitMQ / Redis Streams)**
Robust, battle-tested retry and DLQ semantics. Adds a major infrastructure
dependency (new service to deploy, monitor, backup). The current `notification_queue`
table already provides the durability guarantee; a new broker is premature
given AgentHive's current scale. Revisit if volume exceeds 10k notifications/day.

**A3 — Per-transport dead-letter handling without a gateway**
Each bridge maintains its own DLQ table. Operationally fragmented: monitoring
requires checking N DLQ tables. Rejected: observability is worse than the
current state.

**A4 — Synchronous inline retry in the notification insert trigger**
Zero infrastructure change. Blocks the inserting transaction for up to 5×
retry attempts. Unacceptable for notifications triggered from user-facing
requests. Rejected: latency impact.
$alt$,

  drawbacks = $drw$
- **Gateway SPOF**: if the gateway process crashes, all transport delivery
  stops. Mitigate by running the gateway inside the MCP server process (already
  running under systemd with restart=always) rather than as an independent
  service.

- **Wake-up abstraction leakiness**: `wakeUp()` is inherently transport-
  specific (a Discord bridge is a process; an email relay is an HTTP endpoint).
  The 10-second timeout may be too aggressive for transports requiring full
  process initialisation. Make `wakeTimeoutMs` configurable per transport in
  the registry config column.

- **DLQ is a new operational surface**: operators must monitor the DLQ for
  unresolved messages. Add a `notification_dlq_count` metric to the web
  dashboard and a `URGENT` notification_queue entry when DLQ depth > 10.

- **Race between heartbeat check and actual availability**: a transport may
  report `status='online'` in the registry (stale heartbeat) but actually be
  unable to send. The `send()` call will fail and trigger the retry policy,
  which is the correct fallback.

- **Schema migration timing**: `transport_registry` and `notification_dlq` must
  be created before the gateway dispatch loop starts. Deployment order matters.
$drw$
WHERE id = 304;

-- ACs for P303
INSERT INTO roadmap_proposal.proposal_acceptance_criteria
  (proposal_id, item_number, criterion_text) VALUES
(304, 1, 'Given a transport_registry row with status=''offline'' and last_heartbeat > 90 seconds ago, when the gateway dispatch loop processes a pending notification for that channel, then wakeUp() is called before send() is attempted.'),
(304, 2, 'Given wakeUp() is called and the transport sets status=''online'' within 8 seconds, then the original message send() is attempted without entering the retry backoff policy.'),
(304, 3, 'Given wakeUp() times out (transport does not come online within wakeTimeoutMs), when the timeout fires, then the message is placed into the retry queue at attempt=1 and a TransportWakeTimeoutError is logged.'),
(304, 4, 'Given a send() fails 4 consecutive times (all retries exhausted), when the 5th attempt threshold is reached, then the notification row is moved to notification_dlq with attempt_count=4 and notification_queue.status=''failed''.'),
(304, 5, 'Given pg_notify(''transport_registry_changed'') is emitted when a new transport adapter registers, then the gateway reloads its adapter map within 2 seconds without a process restart.'),
(304, 6, 'Given a transport implements isAvailable() returning true, when the gateway processes a message for that channel, then wakeUp() is NOT called (no unnecessary wake calls for healthy transports).'),
(304, 7, 'Given the DLQ depth exceeds 10 unresolved rows, when the gateway checks DLQ depth, then a notification_queue entry with severity=''URGENT'' and channel=''discord'' is inserted to alert the operator.')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- P403 — Agent Scratch Space Management & Auto-Reaper
-- ════════════════════════════════════════════════════════════

UPDATE roadmap_proposal.proposal
SET
  motivation = $mot$
Agents running under AgentHive write temporary files during task execution:
intermediate analysis notes, downloaded assets, partial code outputs, prompt
fragments. Currently there is no enforced convention for where these files go
or when they are cleaned up. The `CONVENTIONS.md` acknowledges `tmp/<session>/`
as the untracked scratch area with "auto-reap" semantics, but no reaper
actually exists — the auto-reap is aspirational documentation, not working
code.

The observable consequences:

1. **Disk accumulation**: the `/data/code/AgentHive/tmp/` directory grows
   indefinitely. On a shared operator host running multiple concurrent agents,
   this is a material disk-pressure risk.

2. **Sensitive data at rest**: LLM agents may write prompt context, partial
   user data, or API response fragments to scratch files. Without guaranteed
   cleanup these persist beyond the run that created them, violating the
   principle of minimal data residency.

3. **Orphan detection gap**: when an agent run terminates abnormally (OOM,
   SIGKILL, process crash), there is no mechanism to identify its scratch
   directory and clean it up. The only current path is manual `rm -rf`.

4. **No forensic window**: there is value in keeping scratch files briefly
   after run completion for debugging, but the current state is either
   "never cleaned" or "immediately deleted" depending on which agent ran.

The auto-reaper formalises scratch lifecycle: every agent run gets a
deterministic path, a DB registration, and a guaranteed cleanup within N
minutes of completion — with a configurable forensic window for debugging.
$mot$,

  design = $des$
## Path Convention

Every agent run receives a scratch directory at:
```
/tmp/agenthive/{run_id}/
```
where `run_id` is the UUID primary key from `agent_runs.id` (cast to text,
validated against `^[0-9a-f-]{36}$` to prevent path traversal).

The orchestrator creates this directory before spawning the agent subprocess
and passes it as an environment variable:
```
AGENT_SCRATCH_DIR=/tmp/agenthive/{run_id}
```

Directory permissions: `0700`, owned by the agent OS user. Child processes
inherit the environment variable and should write exclusively within it.

## DB Registration Table

```sql
CREATE TABLE roadmap_workforce.agent_scratch_dir (
  run_id         TEXT         PRIMARY KEY
                   CHECK (run_id ~ '^[0-9a-f\-]{36}$'),
  agent_identity TEXT         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ  NOT NULL
                   DEFAULT now() + interval '4 hours',
  forensic_hold_until TIMESTAMPTZ,   -- set by debugger to delay reap
  reaped_at      TIMESTAMPTZ,
  reap_error     TEXT                -- populated if reap fails; NULL on success
);

CREATE INDEX idx_scratch_dir_unreaped
  ON roadmap_workforce.agent_scratch_dir (expires_at)
  WHERE reaped_at IS NULL;
```

The orchestrator inserts a row with `expires_at = now() + interval '4 hours'`
at spawn time. For high-frequency short-lived agents (e.g., reeval tasks),
`expires_at` can be overridden to `now() + interval '30 minutes'`.

## Lifecycle Hooks

In `agent-spawner.ts → runProcess()`:

```typescript
// Before spawn
const scratchDir = `/tmp/agenthive/${run_id}`;
await fs.mkdir(scratchDir, { recursive: true, mode: 0o700 });
await db.query(
  `INSERT INTO roadmap_workforce.agent_scratch_dir
   (run_id, agent_identity, expires_at)
   VALUES ($1, $2, now() + interval '4 hours')`,
  [run_id, agentIdentity]
);

// Finally block (normal + abnormal exit)
try {
  await reapScratch(run_id);
} catch (err) {
  log(`[Reaper] immediate reap failed for ${run_id}: ${err.message}`);
  // DeferredReap: the scheduled reaper will catch it
}
```

```typescript
async function reapScratch(run_id: string): Promise<void> {
  const dir = `/tmp/agenthive/${run_id}`;
  await fs.rm(dir, { recursive: true, force: true });
  await db.query(
    `UPDATE roadmap_workforce.agent_scratch_dir
     SET reaped_at = now(), reap_error = NULL
     WHERE run_id = $1`,
    [run_id]
  );
}
```

## Reaper Schedule

A `pg_cron` job (or setInterval in the MCP server):

```sql
CREATE OR REPLACE FUNCTION roadmap_workforce.fn_reap_orphan_scratch()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_row   RECORD;
  v_count INT := 0;
BEGIN
  FOR v_row IN
    SELECT sd.run_id
    FROM   roadmap_workforce.agent_scratch_dir sd
    WHERE  sd.reaped_at IS NULL
      AND  sd.expires_at < now()
      AND  (sd.forensic_hold_until IS NULL OR sd.forensic_hold_until < now())
  LOOP
    -- Shell-out is via a NOTIFY to a Node.js listener that does the actual rm
    PERFORM pg_notify('reap_scratch', v_row.run_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
```

Schedule: every 15 minutes.
`SELECT cron.schedule('reap-orphan-scratch','*/15 * * * *',
'SELECT roadmap_workforce.fn_reap_orphan_scratch()');`

The Node.js MCP server listens on `pg_notify('reap_scratch')` and executes
`reapScratch(run_id)` for each notified run_id.

## Orphan Detection

A run_id is an orphan when:
```sql
sd.reaped_at IS NULL
AND ar.status IN ('complete','failed','cancelled')
```
(via JOIN to `agent_runs` on `run_id`). These are flagged by the reaper.

## Security

Path construction is validated before use:
```typescript
const SCRATCH_ROOT = '/tmp/agenthive';
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!RUN_ID_RE.test(run_id)) throw new Error(`Invalid run_id: ${run_id}`);
const scratchDir = path.join(SCRATCH_ROOT, run_id);
// path.join is safe here because run_id is UUID-validated (no ../ possible)
```
$des$,

  alternatives = $alt$
**A1 — systemd RuntimeDirectory=agenthive**
Cleans up the entire `/run/agenthive/` tree on service stop. No per-run
granularity; all agents share a directory. No forensic window. Rejected for
primary use; acceptable as a safety net alongside the per-run reaper.

**A2 — RAM-disk (/dev/shm/agenthive/{run_id})**
Auto-cleared on reboot. Size-limited by available RAM (typically 50% of system
RAM on Linux). Binary artifacts from longer runs may exceed this limit. Rejected
as primary scratch for large artifact workloads; acceptable for prompt-only
scratch when RAM is plentiful.

**A3 — Agents write scratch to agent_memory table (DB only)**
Eliminates disk management entirely. Not suitable for large binary blobs or
streaming writes. Increases DB load significantly for high-frequency writes.
Rejected for general scratch; suitable as a complement for small key-value
scratch data.

**A4 — Named temp directory per agent type (not per run)**
Simpler path management. One directory survives across multiple runs; cleanup
is per-agent-restart, not per-run. Doesn't isolate concurrent runs of the
same agent. Rejected: concurrent-run isolation is a security requirement.
$alt$,

  drawbacks = $drw$
- **pg_notify → Node.js filesystem bridge**: `fn_reap_orphan_scratch()` uses
  pg_notify to trigger a Node.js listener that does the actual `rm -rf`. If the
  Node.js process is down, notifications are lost (PostgreSQL NOTIFY has no
  persistence guarantee). Mitigate by also querying `agent_scratch_dir` for
  unreaped expired rows on MCP server startup.

- **4-hour expiry is arbitrary**: long-running design agents may run for 6+
  hours legitimately. Provide per-spawn `expires_at` override via the spawn
  options payload. Add a DB check that `expires_at <= now() + interval '24 hours'`
  to prevent indefinite scratch retention.

- **Child process scope**: agents that spawn sub-processes (e.g., a bash agent
  running npm test) may create files outside `AGENT_SCRATCH_DIR`. The reaper
  only cleans the registered directory. Document that the convention is
  advisory; agents must be coded to respect it.

- **Reboot resilience**: `/tmp` is typically a tmpfs mount cleared on reboot.
  After an unexpected host reboot, `agent_scratch_dir` rows remain with
  `reaped_at IS NULL` but the directories no longer exist. The reaper must
  handle `ENOENT` on `rm -rf` gracefully (treat as already reaped).

- **Disk quota**: on a shared operator host, a misbehaving agent could
  fill `/tmp` before the reaper cycle. Consider adding a per-run disk quota via
  cgroup v2 `io.max` or a quota policy on the tmpfs mount.
$drw$
WHERE id = 404;

-- ACs for P403
INSERT INTO roadmap_proposal.proposal_acceptance_criteria
  (proposal_id, item_number, criterion_text) VALUES
(404, 1, 'Given a new agent run is spawned, when the orchestrator calls spawnAgent(), then /tmp/agenthive/{run_id}/ is created with permissions 0700 and a row is inserted into agent_scratch_dir with reaped_at IS NULL.'),
(404, 2, 'Given the agent run completes normally, when the finally block in runProcess() executes, then /tmp/agenthive/{run_id}/ is deleted from disk and agent_scratch_dir.reaped_at is set to a non-null timestamp.'),
(404, 3, 'Given an agent run terminates abnormally (simulated SIGKILL), when fn_reap_orphan_scratch() runs on the next 15-minute cycle, then pg_notify(''reap_scratch'', run_id) is emitted for the orphaned run_id.'),
(404, 4, 'Given reapScratch() is called on a run_id where the directory does not exist (ENOENT), when the rm -rf operation returns ENOENT, then the reap is treated as successful and reaped_at is set (no error thrown).'),
(404, 5, 'Given a path traversal attempt (run_id = ''../../etc/passwd''), when the path validation regex is applied, then an error is thrown before any filesystem operation is attempted.'),
(404, 6, 'Given forensic_hold_until is set to 2 hours in the future for a run_id, when fn_reap_orphan_scratch() runs even after expires_at has passed, then that run_id is NOT included in the reap notification list until after forensic_hold_until.'),
(404, 7, 'Given AGENT_SCRATCH_DIR is injected as an environment variable at spawn time, when the agent process reads process.env.AGENT_SCRATCH_DIR, then the value is /tmp/agenthive/{run_id} and the directory exists and is writable.')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- P477 — Web control-plane redesign for multi-project operations
-- ════════════════════════════════════════════════════════════

UPDATE roadmap_proposal.proposal
SET
  motivation = $mot$
The web dashboard (dashboard-web/) was built for a single project. Every
API call uses project_id=1 implicitly. Navigation components have no project
concept. URL structure has no project namespace. The WebSocket server queries
without a project filter on most routes.

P300 added multi-project support to the DB schema (projects table,
proposal.project_id, squad_dispatch.project_id). P429 will extract hiveCentral
as the control-plane DB. Both changes make multi-project operations *possible*
at the data layer — but the web UI remains a single-project surface that
cannot expose this capability to operators.

The risk of leaving the UI in its current state:

1. **Operator confusion**: as new projects (MonkeyKing-Audio, Georgia-Singer)
   are created in the DB, their proposals and agents are invisible in the web
   dashboard. Operators resort to direct SQL access, bypassing access controls
   and audit logging.

2. **Bookmark and link invalidity**: all links currently share a flat namespace
   (`/proposals/123`). When project isolation lands, proposal IDs may overlap
   between projects. Without project-namespaced URLs, a link becomes ambiguous.

3. **Token scoping mismatch**: migrations 022/023 added operator token rows
   scoped to a project_id. The web auth middleware doesn't enforce this scoping
   because the web UI doesn't know which project it's serving.

This proposal specifies the full UI and API changes needed to make the control
plane genuinely multi-project: project selector component, per-project API
namespace, shared nav shell, project context propagation, URL restructure, and
backwards-compatible redirect strategy.
$mot$,

  design = $des$
## URL Structure

New canonical URL pattern:
```
/p/{project_slug}/board
/p/{project_slug}/proposals
/p/{project_slug}/proposals/{proposal_id}
/p/{project_slug}/agents
/p/{project_slug}/settings
```

Redirect rules (backward compatibility):
```
/           → /p/agenthive/board
/proposals  → /p/agenthive/proposals
/agents     → /p/agenthive/agents
/board      → /p/agenthive/board
```

These redirects are implemented as React Router `<Navigate>` components at the
legacy route paths.

## ProjectContext

```typescript
// src/apps/dashboard-web/contexts/ProjectContext.tsx

interface ProjectContextValue {
  projectId:   number;
  projectSlug: string;
  projectName: string;
  setProject:  (slug: string) => void;
}

const ProjectContext = React.createContext<ProjectContextValue>({
  projectId: 1, projectSlug: 'agenthive', projectName: 'AgentHive',
  setProject: () => {},
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [slug, setSlug] = useState(
    () => localStorage.getItem('activeProject') ?? 'agenthive'
  );
  const { data: project } = useProjectBySlug(slug);  // fetches /api/projects/:slug

  const setProject = useCallback((s: string) => {
    setSlug(s);
    localStorage.setItem('activeProject', s);
  }, []);

  return (
    <ProjectContext.Provider value={{
      projectId: project?.id ?? 1,
      projectSlug: project?.slug ?? 'agenthive',
      projectName: project?.name ?? 'AgentHive',
      setProject,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export const useProject = () => useContext(ProjectContext);
```

## ProjectSelector Component

```tsx
// Placed in SideNavigation.tsx above the main nav links

const ProjectSelector: React.FC = () => {
  const { projectSlug, setProject } = useProject();
  const { data: projects } = useProjects();   // GET /api/projects

  return (
    <select
      value={projectSlug}
      onChange={e => setProject(e.target.value)}
      className="project-selector"
    >
      {projects?.map(p => (
        <option key={p.slug} value={p.slug}>{p.name}</option>
      ))}
    </select>
  );
};
```

## Per-Project API Namespace

All API routes prefixed with `/api/projects/{project_slug}/`:

```
GET  /api/projects                               → list all projects
GET  /api/projects/:slug                         → project metadata
GET  /api/projects/:slug/proposals               → proposals for project
GET  /api/projects/:slug/proposals/:id           → single proposal
GET  /api/projects/:slug/agents                  → agents for project
GET  /api/projects/:slug/board-columns           → workflow columns for project
GET  /api/projects/:slug/statistics              → stats scoped to project
```

Legacy single-project routes redirect to `/api/projects/agenthive/...` via
express middleware.

## WebSocket Server Changes

The WebSocket server adds project scoping to all proposal queries:

```typescript
// Before (single-project)
const proposals = await query(`SELECT * FROM roadmap_proposal.proposal`);

// After (multi-project)
const projectId = await resolveProjectId(projectSlug);
const proposals = await query(
  `SELECT * FROM roadmap_proposal.proposal WHERE project_id = $1`,
  [projectId]
);
```

The WebSocket connection accepts an initial `{ type: 'set_project', slug }` 
message. On receipt, the server filters all subsequent pushes to that project.

## Operator Token Scoping Enforcement

The auth middleware (if operator tokens are used) validates:
```typescript
if (token.project_id !== null && token.project_id !== resolvedProjectId) {
  return res.status(403).json({ error: 'token_project_mismatch' });
}
```

## Shared Nav Shell

Layout.tsx wraps all routes in `<ProjectProvider>`. The nav shell renders
`<ProjectSelector>` in the sidebar header. Active-project health indicators
(open proposal count, active agent count, budget remaining) are shown below
the selector.

## Migration of Existing Links / Bookmarks

A service-worker or server-side redirect handles legacy paths. The first time
an operator loads an unnamespaced URL they are redirected and notified of the
new URL structure via a dismissible banner: *"URLs now include your project
name. Update your bookmarks."*
$des$,

  alternatives = $alt$
**A1 — Separate web deployment per project**
Each project gets its own `npm run dev` instance. Simple per-project code.
No unified operator view. Operators managing 3 projects must maintain 3 browser
tabs with 3 auth sessions. Rejected: poor operator UX; no unified health view.

**A2 — Query-parameter project selection (?project=agenthive)**
Simpler URL structure. Breaks browser history/bookmarking (navigating away
loses the query param unless explicitly preserved everywhere). Rejected:
fragile history management.

**A3 — Project dropdown that reloads the entire page on change**
Minimal code change to existing components. Loses in-flight state on project
switch (unsaved form data, open modals). Very poor UX for power users switching
frequently. Acceptable as a v0 stepping stone; rejected as the target state.

**A4 — Keep single-project UI and add a CLI flag for project selection**
Operators use the CLI for project switching. Web stays simple. Loses the
benefit of a unified browser-based control surface. Rejected: the web UI is
the primary operational surface for non-technical stakeholders.
$alt$,

  drawbacks = $drw$
- **URL breakage**: every existing bookmark, document link, and CI script that
  references the old URL structure breaks. Redirects mitigate but do not
  eliminate this. Announce URL change with 2-week advance notice.

- **API consumer migration**: scripts and MCP tools that call web API endpoints
  directly must be updated. Identify all callers via access log analysis before
  cutting over.

- **Project context bugs**: components that forget to call `useProject()` and
  use hardcoded `project_id=1` will silently serve wrong data after the switch.
  A lint rule that flags any direct use of `project_id: 1` in component files
  would catch regressions.

- **Cold-start round-trip**: `ProjectProvider` must fetch project metadata on
  first render. Users on slow connections see a blank project name or loading
  spinner until the project list resolves. Mitigate with a localStorage-cached
  project fallback rendered immediately, refreshed in the background.

- **localStorage not shared across tabs**: two browser tabs on different
  projects can independently set their active project. The tabs may send
  conflicting API requests to the same WebSocket connection. Use tab-specific
  session storage or implement per-tab WebSocket connections.
$drw$
WHERE id = 477;

-- ACs for P477
INSERT INTO roadmap_proposal.proposal_acceptance_criteria
  (proposal_id, item_number, criterion_text) VALUES
(477, 1, 'Given a browser request to /proposals/123, when the redirect middleware runs, then the browser is redirected to /p/agenthive/proposals/123 with HTTP 301.'),
(477, 2, 'Given the active project is set to ''monkeyking-audio'' in localStorage, when the page is reloaded, then the ProjectSelector shows ''Monkey King Audio'' as the selected project and all API requests include project_slug=''monkeyking-audio''.'),
(477, 3, 'Given GET /api/projects/monkeyking-audio/proposals is called, when the server resolves project_slug to project_id, then only proposals with project_id matching monkeyking-audio are returned (not agenthive proposals).'),
(477, 4, 'Given an operator token scoped to project_id=2 (monkeyking-audio), when that token is used to call /api/projects/agenthive/proposals, then the server returns HTTP 403 with error=''token_project_mismatch''.'),
(477, 5, 'Given the WebSocket server receives a {type: ''set_project'', slug: ''georgia-singer''} message, when subsequent proposal events are pushed, then only proposals with the georgia-singer project_id are included.'),
(477, 6, 'Given ProjectProvider is rendered, when useProject() is called in any child component, then it returns the correct {projectId, projectSlug, projectName} without any component receiving hardcoded project_id=1.'),
(477, 7, 'Given the ProjectSelector renders with 3 projects in the database, when the user selects a different project from the dropdown, then all visible proposal and agent counts update to reflect the newly selected project within 2 seconds.')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- P747 — Umbrella D — Model Routing Restriction
-- ════════════════════════════════════════════════════════════

UPDATE roadmap_proposal.proposal
SET
  motivation = $mot$
The current model routing system resolves routes on a single dimension: which
provider (Anthropic, OpenAI, Google, etc.) is permitted on which host via
`host_model_policy`. Real routing decisions involve at least four independent
eligibility dimensions that the current system cannot express:

1. **Budget policy** — Is there remaining budget in the allowance tied to this
   proposal? A route that would exhaust the budget should yield to a cheaper
   fallback, not silently overspend.

2. **Capability flags** — Does the model support the capability the caller
   requires (e.g., `tool_use`, `vision`, `json_mode`, `long_context`)? Without
   this check, a caller requesting `tool_use` may receive a route to a model
   that doesn't support it, causing a hard API error.

3. **Provider tier** — Is this a frontier, standard, or budget-tier model? Some
   proposal types (e.g., reeval tasks) should be forced to use budget-tier
   models to control cost. Others (e.g., Gate 4 final review) should be pinned
   to frontier models for quality. No tier enforcement exists today.

4. **Latency class** — Is the model route expected to respond within the caller's
   timeout? Realtime callers (TUI typeahead) cannot afford a 60-second batch
   model. Batch callers (nightly reports) should not consume realtime quota.

The consequence of missing these checks is silent routing failures: agents are
assigned routes that are technically accessible but wrong for the context.
Budget overruns, capability errors, quality failures, and timeout violations
are all traceable to the absence of multi-dimensional route eligibility.

This umbrella proposal defines the eligibility check algorithm, fallback chain,
budget enforcement hook, and audit log so that every routing decision is
explicit, observable, and defensible.
$mot$,

  design = $des$
## Schema: Eligibility Dimensions on model_routes

```sql
ALTER TABLE roadmap.model_routes
  ADD COLUMN IF NOT EXISTS provider_tier   TEXT
    CHECK (provider_tier IN ('frontier','standard','budget')),
  ADD COLUMN IF NOT EXISTS latency_class   TEXT
    CHECK (latency_class IN ('realtime','interactive','batch')),
  ADD COLUMN IF NOT EXISTS capability_flags TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS budget_policy_id BIGINT
    REFERENCES roadmap_efficiency.budget_allowance(id) ON DELETE SET NULL;

COMMENT ON COLUMN roadmap.model_routes.provider_tier
  IS 'frontier=highest quality/cost, standard=balanced, budget=lowest cost';
COMMENT ON COLUMN roadmap.model_routes.latency_class
  IS 'realtime<30s P95, interactive<120s P95, batch=unbounded';
COMMENT ON COLUMN roadmap.model_routes.capability_flags
  IS 'Required capabilities: subset of model_metadata.capabilities jsonb keys';
COMMENT ON COLUMN roadmap.model_routes.budget_policy_id
  IS 'When set, route eligibility requires budget_allowance.allocated_usd - consumed_usd > 0';
```

## Latency Class Rank Function

```sql
CREATE OR REPLACE FUNCTION roadmap.fn_latency_rank(cls TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE cls
    WHEN 'realtime'    THEN 1
    WHEN 'interactive' THEN 2
    WHEN 'batch'       THEN 3
    ELSE 99
  END;
$$;
```

## Eligibility Check Function

```sql
CREATE OR REPLACE FUNCTION roadmap.fn_check_route_eligibility(
  p_route_id          BIGINT,
  p_proposal_id       BIGINT,
  p_required_caps     TEXT[]   DEFAULT '{}',
  p_max_latency_class TEXT     DEFAULT 'batch'
) RETURNS TABLE (
  eligible            BOOLEAN,
  fail_reason         TEXT
) LANGUAGE plpgsql AS $$
DECLARE
  r roadmap.model_routes%ROWTYPE;
  v_budget_remaining NUMERIC;
BEGIN
  SELECT * INTO r FROM roadmap.model_routes WHERE id = p_route_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'route_not_found';
    RETURN;
  END IF;

  -- 1. Budget check
  IF r.budget_policy_id IS NOT NULL THEN
    SELECT (allocated_usd - consumed_usd) INTO v_budget_remaining
    FROM   roadmap_efficiency.budget_allowance
    WHERE  id = r.budget_policy_id AND is_active = true;
    IF v_budget_remaining IS NULL OR v_budget_remaining <= 0 THEN
      RETURN QUERY SELECT false, 'budget_exhausted';
      RETURN;
    END IF;
  END IF;

  -- 2. Capability check (required caps must be a subset of route caps)
  IF p_required_caps <> '{}' AND NOT (p_required_caps <@ r.capability_flags) THEN
    RETURN QUERY SELECT false,
      'missing_capabilities:' || array_to_string(
        p_required_caps[1:] EXCEPT r.capability_flags, ',');
    RETURN;
  END IF;

  -- 3. Latency class check
  IF roadmap.fn_latency_rank(r.latency_class) >
     roadmap.fn_latency_rank(p_max_latency_class) THEN
    RETURN QUERY SELECT false, 'latency_class_too_slow:' || r.latency_class;
    RETURN;
  END IF;

  -- 4. Host policy check (delegate to existing policy function)
  -- (existing fn_check_host_policy called here)

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;
```

## Fallback Chain

Routes are evaluated in priority order:
```sql
SELECT r.id
FROM   roadmap.model_routes r
WHERE  r.is_active = true
ORDER BY
  CASE r.provider_tier WHEN 'frontier' THEN 3
                        WHEN 'standard' THEN 2
                        WHEN 'budget'   THEN 1 ELSE 0 END DESC,
  r.rating DESC NULLS LAST
```

For each route, call `fn_check_route_eligibility()`. Return the first eligible
route. If no route is eligible after checking all candidates, emit:
```sql
PERFORM pg_notify('budget_threshold_breached', jsonb_build_object(
  'proposal_id', p_proposal_id,
  'reason',      'no_eligible_route',
  'ts',          to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"')
)::TEXT);
```

## Budget Enforcement Hook

After `agent_runs` status is set to terminal ('complete','failed'):
```sql
UPDATE roadmap_efficiency.budget_allowance
SET    consumed_usd = consumed_usd + $cost_usd
WHERE  id = (
  SELECT budget_policy_id FROM roadmap.model_routes WHERE id = $route_id
)
AND    is_active = true;
```

When `(allocated_usd - consumed_usd) / allocated_usd <= 0.05`, the budget
threshold trigger fires (fn_budget_threshold_notify already handles this).
Routes with this budget_policy_id are now ineligible for frontier/standard tier;
only budget-tier routes bypass (no budget_policy_id constraint for budget tier
is acceptable policy).

## Route Eligibility Audit Log

```sql
CREATE TABLE roadmap.route_eligibility_log (
  id               BIGSERIAL PRIMARY KEY,
  route_id         BIGINT      NOT NULL,
  proposal_id      BIGINT,
  check_ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  budget_pass      BOOLEAN,
  capability_pass  BOOLEAN,
  tier             TEXT,
  latency_pass     BOOLEAN,
  host_pass        BOOLEAN,
  selected         BOOLEAN     NOT NULL DEFAULT false,
  fail_reason      TEXT
);

CREATE INDEX idx_eligibility_log_proposal
  ON roadmap.route_eligibility_log(proposal_id, check_ts DESC);
```
$des$,

  alternatives = $alt$
**A1 — Add only capability flags (single-dimension expansion)**
Addresses the most common immediate failure mode (tool_use mismatch). Leaves
budget and latency to ad-hoc application code. Acceptable as a Phase 1 scope
reduction; the full multi-dimensional design should follow in Phase 2.

**A2 — Move all eligibility logic to TypeScript application layer**
No schema changes required. Logic lives in `agent-spawner.ts`. Not queryable,
not auditable via SQL, not shareable with non-TypeScript callers (e.g., Python
scripts). Rejected: the audit log requirement alone mandates DB-side recording.

**A3 — Use a jsonb policy column on model_routes**
`eligibility_policy JSONB` can express any rule structure. More flexible but
harder to index, constrain, and query with simple arithmetic. Column-per-
dimension approach is more explicit, validated at the DB level, and queryable.
Rejected: column approach is clearer at current dimensionality.

**A4 — Per-provider eligibility plugins (registry pattern)**
Each provider registers an eligibility checker. Maximally extensible. Significant
complexity for 4 known dimensions. Rejected as premature abstraction; revisit
when a 5th eligibility dimension is identified.
$alt$,

  drawbacks = $drw$
- **Eligibility check latency**: `fn_check_route_eligibility` may be called
  multiple times per route resolution (once per candidate route until an
  eligible one is found). Index `budget_allowance(id)` and
  `model_routes(is_active, provider_tier, rating)` to keep each check < 5ms.

- **Budget enforcement race**: budget is checked at route selection time and
  decremented after run completion. Concurrent runs can both see sufficient
  budget, both start, and collectively exhaust the budget. Acceptable for the
  current scale; a row-level lock on `budget_allowance` would prevent this but
  serialises all route selections globally.

- **capability_flags array vs jsonb sync**: `capability_flags` on model_routes
  is TEXT[], while `model_metadata.capabilities` is JSONB. Keeping them in sync
  requires a migration or a computed column. Define a view that extracts
  JSONB keys into an array for comparison, or standardise on one format.

- **No_eligible_route is a hard failure**: if all routes are exhausted (budget
  gone + capability mismatch), the agent call fails completely. A "degrade
  gracefully to no-tool mode" fallback should be specified as an application-
  layer escape hatch (not in scope here but should be filed as a follow-on).

- **Audit log growth**: the eligibility log records every check, including
  failed checks on all evaluated-but-rejected routes. For a 10-route evaluation
  per call at 100 calls/day = 1000 rows/day. Partition by month or add a
  `RETAIN_DAYS=30` TTL policy.
$drw$
WHERE id = 747;

-- ACs for P747
INSERT INTO roadmap_proposal.proposal_acceptance_criteria
  (proposal_id, item_number, criterion_text) VALUES
(747, 1, 'Given a model_routes row with budget_policy_id pointing to a budget_allowance with consumed_usd >= allocated_usd, when fn_check_route_eligibility is called for that route, then eligible=false and fail_reason=''budget_exhausted'' are returned.'),
(747, 2, 'Given a route with capability_flags=[''tool_use'',''vision''] and a caller requiring p_required_caps=[''tool_use'',''json_mode''], when fn_check_route_eligibility is called, then eligible=false and fail_reason contains ''missing_capabilities:json_mode''.'),
(747, 3, 'Given a route with latency_class=''batch'' and a caller with p_max_latency_class=''realtime'', when fn_check_route_eligibility is called, then eligible=false and fail_reason=''latency_class_too_slow:batch''.'),
(747, 4, 'Given the fallback chain evaluates all routes and none are eligible, when the chain is exhausted, then pg_notify(''budget_threshold_breached'') is emitted with reason=''no_eligible_route''.'),
(747, 5, 'Given a frontier-tier route and a budget-tier route both eligible, when the fallback chain selects a route, then the frontier-tier route is selected first (higher priority).'),
(747, 6, 'Given an agent run completes and agent_runs.cost_usd is recorded, when the budget enforcement hook runs, then budget_allowance.consumed_usd is incremented by the exact cost_usd value of the run.'),
(747, 7, 'Given fn_check_route_eligibility is called with p_route_id pointing to a non-existent route, when the function executes, then eligible=false and fail_reason=''route_not_found'' are returned without raising an exception.'),
(747, 8, 'Given route_eligibility_log is written on every eligibility check, when 10 routes are evaluated for one proposal and 1 is selected, then 10 rows are present in route_eligibility_log for that proposal_id with selected=true for exactly 1 row.')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- P249 — Actual-cost tracking + model_* consolidation
-- ACs ONLY — do NOT touch motivation or design
-- ════════════════════════════════════════════════════════════

-- Existing ACs are assumed to be item_numbers 1, 2, 3.
-- Adding items 4–9 (6 new ACs).

INSERT INTO roadmap_proposal.proposal_acceptance_criteria
  (proposal_id, item_number, criterion_text) VALUES
(249, 4, 'Given agent_runs.cost_usd is populated from the per-million billing formula, when a spending_log row is inserted for the same run, then spending_log.cost_usd matches agent_runs.cost_usd within numeric(10,6) precision (no rounding discrepancy > $0.000001).'),
(249, 5, 'Given model_metadata and model_routes are consolidated such that model_routes is the billing source of truth, when a route row is queried for a model, then cost_per_1m_input, cost_per_1m_output, cache_write_cost_per_1m, and cache_read_cost_per_1m are all accessible on the route row without a JOIN to model_metadata.'),
(249, 6, 'Given the daily_cost_summary view (or equivalent) is queried for a date range, when grouped by model_name and proposal_id, then the summed cost_usd reconciles to within 1% of the sum of agent_runs.cost_usd for the same period and filters.'),
(249, 7, 'Given a cache-hit event occurs (Anthropic prompt cache read), when the spending_log row is inserted, then cache_read_tokens is populated and the cost is computed using cache_read_cost_per_1m (not cost_per_1m_input), resulting in a lower per-token cost than a standard input token.'),
(249, 8, 'Given the model_* table consolidation is complete, when a SELECT on the deprecated legacy model pricing columns (cost_per_1k_input, cost_per_1k_output) is executed, then either the columns are absent (DDL migration dropped them) or a deprecation notice view redirects to the per-million equivalents — no silent dual-billing path exists.'),
(249, 9, 'Given budget_allowance.consumed_usd is updated by a trigger on spending_log insert, when 100 concurrent agent runs each write a spending_log row in the same transaction window, then budget_allowance.consumed_usd equals the exact sum of all 100 cost_usd values with no lost updates (serialisation correctness under concurrent load).')
ON CONFLICT (proposal_id, item_number) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- SET maturity='mature' FOR ALL 9 PROPOSALS
-- Done last, after all content is written.
-- ════════════════════════════════════════════════════════════

UPDATE roadmap_proposal.proposal
SET    maturity = 'mature'
WHERE  id IN (184, 242, 246, 248, 304, 404, 477, 747, 249);

-- ════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: maturity='mature', design>1000 chars, acs>=5 for all rows
-- ════════════════════════════════════════════════════════════

SELECT
  p.id,
  p.display_id,
  p.maturity,
  LENGTH(COALESCE(p.motivation,''))  AS motiv,
  LENGTH(COALESCE(p.design,''))      AS design,
  COUNT(a.item_number)               AS acs
FROM roadmap_proposal.proposal p
LEFT JOIN roadmap_proposal.proposal_acceptance_criteria a
       ON a.proposal_id = p.id
WHERE p.id IN (184,242,246,248,304,404,477,747,249)
GROUP BY p.id, p.display_id, p.maturity
ORDER BY p.id;

COMMIT;
