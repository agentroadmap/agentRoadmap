# Proposal Migration Plan: Postgres → Postgres

**Target**: AgentHive v0.6.0  
**Author**: Carter  
**Date**: 2026-04-04

---

## Current State

| Metric | Postgres | Postgres |
|--------|------------|----------|
| Database | `roadmap2` (localhost:3000) | `agenthive` (port 5432) |
| Proposals | 32 entries | 3 seeded entries |
| Schema | Postgres workflow actions | 11 relational tables + pgvector |
| MCP Tools | Postgres handlers | 28 Pg-backed tools (merged) |
| Embeddings | N/A | `body_embedding vector(1536)` ✅ |

## Phase 1: Export from Postgres ✅ (Infrastructure Ready)

**Tools available**:
- `roadmap state list` — CLI lists all proposals from Postgres
- `scripts/generate-docs.ts` — generates markdown from state files
- MCP `prop_list` (Postgres) — JSON export of proposals

**What needs exporting**:
- 32 proposals with full metadata (id, title, type, category, domain, body, status, tags, maturity, budget)
- Attachments (file attachments referenced by proposal IDs)
- Message history (message_ledger linked to proposals)
- Spending data (spending_log linked to proposals)

## Phase 2: Transform (Postgres → Relational)

**Mapping rules**:
| Postgres Field | PG Column | Notes |
|-----------|-----------|-------|
| `proposal_id` (P001 format) | `display_id` | String format preserved |
| `title` | `title` | Direct map |
| `body` | `body_markdown` | Direct map |
| `status` | `status` | Map Postgres status → PG status enum |
| `tags` | `tags` (JSONB) | Convert Postgres array → JSONB |
| `budget` | `budget_limit_usd` | Numeric conversion |
| `display_order` | — | Not in PG (use display_id sort) |
| `final_summary` | `body_markdown` (appended) | Append to body if present |
| `reached_date` | — | Drop or add to metadata |

**Embedding generation**:
- Run proposals through local text embedding model
- Store 1536-dim vectors in `body_embedding` column
- Enables semantic search via `memory_search`/proposal search

**Parent-child relationships**:
- Resolve `parent_id` from display_id → internal bigint ID
- Foreign key constraint enforced on insert

## Phase 3: Migration Script

**Approach: idempotent upsert via display_id**

```
1. Fetch all 32 proposals from Postgres (via MCP or CLI)
2. For each proposal:
   a. INSERT ... ON CONFLICT (display_id) DO UPDATE
   b. Resolve display_id → bigint id for parent references
   c. Generate embeddings (batch via embedding API)
   d. Migrate attachments → attachment_registry
   e. Migrate messages → message_ledger
   f. Migrate spending → spending_log
3. Verify: SELECT COUNT(*) = 32 + 3 (seeded)
4. Generate body_embeddings for all proposals
5. Run semantic search smoke test
```

**Implementation file**: `scripts/migrate-sdb-to-pg.ts`

## Phase 4: cutover

1. Run migration script (dry-run first, then real)
2. Verify all 35 proposals in Postgres
3. Switch `config.yaml`: `database.provider: Postgres`
4. Restart MCP server → tools route to Pg
5. Test all 28 MCP tools against migrated data
6. Optional: keep Postgres as read-only fallback for 1 sprint

## Phase 5: Deprecate Postgres

1. Remove Postgres proposal handlers from backend-switch
2. Remove Postgres CLI dependency from core proposal flow
3. Archive `roadmap2` Postgres database
4. Document Pg-only migration path for new projects

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Data loss during migration | Dry-run validation + Postgres kept as read-only backup |
| Embedding generation fails | Post-migration batch job, fallback to NULL |
| Parent ID resolution breaks | Two-pass: insert proposals first, then resolve parents |
| Schema mismatch | Explicit field mapping above; manual transform where needed |

## Estimated Effort

- Phase 2 (transform): 2-3 hours scripting
- Phase 3 (migration script): 3-4 hours
- Phase 4 (cutover + testing): 1-2 hours
- **Total**: 6-9 hours (single session)
