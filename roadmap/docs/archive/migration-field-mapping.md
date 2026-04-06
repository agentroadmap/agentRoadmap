# Field Mapping: .md Frontmatter → Postgres Tables
**STATE-095 AC#3** | Created: 2026-03-25 15:05 UTC | Author: Carter

## Purpose

Map every field from state `.md` frontmatter and body sections to corresponding Postgres table columns, ensuring zero data loss during migration.

---

## Primary Table: `states`

### Frontmatter → Column Mapping

| .md Frontmatter Field | Postgres Column | Postgres Type | Notes |
|----------------------|------------|----------|-------|
| `id` | `id` | `string` | Primary key, e.g., "STATE-074" |
| `title` | `title` | `string` | Required |
| `status` | `status` | `string` | Enum: potential, contracted, active, reached, complete, abandoned |
| `priority` | `priority` | `string` | Enum: critical, high, medium, low, minimal |
| `maturity` | `maturity` | `string` | Enum: seedling, budding, etc. |
| `assignee` | `assignee` | `string` | Comma-separated (frontmatter is array → join) |
| `created_date` | `createdDate` | `number` | ISO string → epoch ms |
| `updated_date` | `updatedDate` | `number` | ISO string → epoch ms |
| `type` | `type` | `string` | Enum: terminal, transitional, operational, spike, incident |
| `ready` | `ready` | `boolean` | Default: false |
| `milestone` | `milestone` | `string \| null` | Nullable |
| `dependencies` | `dependencies` | `string` | Array → comma-separated |
| `reporter` | `reporter` | `string \| null` | Agent ID of reporter |
| `parent_state_id` | (see `state_relations`) | — | Self-referential, separate table |

### Body Section → Column Mapping

| .md Body Section | Postgres Column | Postgres Type | Notes |
|-----------------|------------|----------|-------|
| `## Description` (raw) | `description` | `string \| null` | First H2 section |
| `## Implementation Plan` | `implementationPlan` | `string \| null` | Markdown content |
| `## Implementation Notes` | `implementationNotes` | `string \| null` | Markdown content |
| `## Audit Notes` | `auditNotes` | `string \| null` | Markdown content |
| `## Final Summary` | `finalSummary` | `string \| null` | Markdown content |
| `## Proof of Arrival` | `proof` | `string` | Full section content |
| `## Scope Summary` | `scopeSummary` | `string \| null` | Synthesis section |
| Entire body (no frontmatter) | `content` | `string` | Full raw markdown |

### Fields with Default Values

| Field | Default | Source |
|-------|---------|--------|
| `status` | `'potential'` | `DEFAULT_STATUS` |
| `priority` | `'medium'` | `DEFAULT_PRIORITY` |
| `maturity` | `'seedling'` | `DEFAULT_MATURITY` |
| `ready` | `false` | Hard-coded |
| `type` | `'operational'` | Assumed if missing |

---

## Secondary Table: `state_labels` (Many-to-Many)

| .md Frontmatter | Postgres Column | Postgres Type |
|----------------|------------|----------|
| `labels[]` | `label` | `string` |
| (parent state) | `stateId` | `string` (FK → states.id) |

**Example:**
```yaml
labels:
  - migration
  - architecture
```
→ Two rows in `state_labels`:
```
{ stateId: "STATE-095", label: "migration" }
{ stateId: "STATE-095", label: "architecture" }
```

---

## Secondary Table: `state_relations` (Hierarchy)

| .md Field | Postgres Column | Postgres Type |
|-----------|------------|----------|
| `parent_state_id` | `parentId` | `string` |
| `id` | `childId` | `string` |
| (computed) | `relationType` | `'parent' \| 'substate'` |

**Replaces:** `parentStateId` in states table (denormalized → normalized).

---

## Secondary Table: `state_references` (External Links)

| .md Frontmatter | Postgres Column | Postgres Type |
|----------------|------------|----------|
| `references[]` | `url` | `string` |
| (parent state) | `stateId` | `string` |

---

## Secondary Table: `state_proof_items` (Structured Proof)

| Parsed From | Postgres Column | Postgres Type |
|-------------|------------|----------|
| `## Proof of Arrival` body | `stateId` | `string` |
| parsed item | `type` | `'uri' \| 'commit' \| 'test' \| 'log'` |
| parsed item | `value` | `string` |
| parsed item | `verified` | `boolean` |

---

## Secondary Table: `acceptance_criteria` (Structured ACs)

| Parsed From | Postgres Column | Postgres Type |
|-------------|------------|----------|
| `<!-- AC:BEGIN -->` block | `stateId` | `string` |
| parsed item | `index` | `number` |
| parsed item | `text` | `string` |
| parsed item | `checked` | `boolean` |

---

## Secondary Table: `activity_log` (Transitions)

| Source | Postgres Column | Postgres Type |
|--------|------------|----------|
| `activityLog[]` | `stateId` | `string` |
| entry | `timestamp` | `number` |
| entry | `action` | `string` |
| entry | `agentId` | `string` |
| entry | `details` | `string \| null` |

---

## Fields NOT Migrated to DB

These remain file-only or are computed at runtime:

| Field | Reason |
|-------|--------|
| `filePath` | Computed from state ID + roadmap dir |
| `rawContent` | Read-only, cached in memory |
| `substates` | Computed from `state_relations` table |
| `substateSummaries` | Computed query on `state_relations` + `states` |
| `depth` | Computed from parent chain traversal |
| `hype` | Deprecated/non-critical |
| `requires` | Deprecated, use `needs_capabilities` |
| `needs_capabilities` | File-only (rarely used, future candidate) |
| `external_injections` | File-only (rarely used, future candidate) |
| `unlocks` | File-only (rarely used, future candidate) |
| `verificationStatements` | Parsed at runtime from body |

---

## Data Type Conversions

### Date Handling

```typescript
// Frontmatter (ISO string) → Postgres (epoch ms)
function frontmatterDateToEpoch(iso: string | undefined): number {
  if (!iso) return Date.now();
  return new Date(iso).getTime();
}

// Postgres (epoch ms) → Frontmatter (ISO string)
function epochToFrontmatterDate(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 16); // "YYYY-MM-DD HH:MM"
}
```

### Array Handling

```typescript
// Frontmatter array → Postgres comma-separated string
function arrayToSdbField(arr: string[] | undefined): string {
  return (arr ?? []).join(', ');
}

// Postgres comma-separated → Frontmatter array
function sdbFieldToArray(field: string | null): string[] {
  if (!field) return [];
  return field.split(',').map(s => s.trim()).filter(Boolean);
}
```

### Status Mapping

Frontmatter uses kebab-case, Postgres uses exact enum match:

| Frontmatter | Postgres |
|-------------|-----|
| `potential` | `potential` |
| `contracted` | `contracted` |
| `active` | `active` |
| `reached` | `complete` (STATE-59) |
| `complete` | `complete` |
| `abandoned` | `abandoned` |

---

## Migration Transform Function

```typescript
function markdownStateToSdbRow(markdown: string): {
  state: RoadmapStateRow;
  labels: Omit<StateLabelRow, 'id'>[];
  relations: { parentId: string; childId: string }[];
  criteria: Omit<AcceptanceCriterionRow, 'id'>[];
} {
  const parsed = parseState(markdown);
  
  return {
    state: {
      id: parsed.id,
      title: parsed.title,
      status: normalizeStatus(parsed.status),
      priority: parsed.priority ?? 'medium',
      maturity: parsed.maturity ?? 'seedling',
      assignee: parsed.assignee?.join(', ') ?? null,
      createdDate: frontmatterDateToEpoch(parsed.createdDate),
      updatedDate: frontmatterDateToEpoch(parsed.updatedDate),
      content: parsed.rawContent ?? '',
      dependencies: parsed.dependencies?.join(', ') ?? '',
      type: parsed.type ?? 'operational',
      ready: parsed.ready ?? false,
      milestone: parsed.milestone ?? null,
      reporter: parsed.reporter ?? null,
    },
    labels: (parsed.labels ?? []).map(label => ({
      stateId: parsed.id,
      label,
    })),
    relations: parsed.parentStateId ? [{
      parentId: parsed.parentStateId,
      childId: parsed.id,
    }] : [],
    criteria: (parsed.acceptanceCriteriaItems ?? []).map((ac, i) => ({
      stateId: parsed.id,
      index: i,
      text: ac.text,
      checked: ac.checked,
    })),
  };
}
```

---

## Verification: Field Coverage

| Category | Fields | Migrated | File-Only |
|----------|--------|----------|-----------|
| Identity | id, title | 2 | 0 |
| Status | status, priority, maturity, type, ready | 5 | 0 |
| Ownership | assignee, reporter | 2 | 0 |
| Timestamps | created_date, updated_date | 2 | 0 |
| Relations | dependencies, parent_state_id, references | 3 | 0 |
| Content | description, plan, notes, proof, summary, content | 6 | 0 |
| Labels | labels | 1 (separate table) | 0 |
| Structured | AC items, proof items, activity log | 3 (separate tables) | 0 |
| Computed | filePath, substates, depth, substateSummaries | 0 | 4 |
| Deprecated | hype, requires | 0 | 2 |
| Capability | needs_capabilities, external_injections, unlocks | 0 | 3 |
| **Total** | **31** | **21** | **9** |

**Coverage: 68% of fields migrate to Postgres, 32% are computed/file-only.**

---

## Next Steps

- [ ] AC#4: Define rollback strategy
- [ ] Implement transform function in `src/postgres/migration-transform.ts`
- [ ] Add integration tests for field mapping
