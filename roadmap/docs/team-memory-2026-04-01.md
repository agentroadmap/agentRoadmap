# Team Memory — Sprint 2026-04-01

## What Worked

- **GitLab CI pipeline** — type-check + test + build + security scans on every push to origin
- **Pre-push local check** — `npm run check:types && npm test` catches errors before CI
- **node:test as unified test framework** — converted vitest/bun:test imports
- **Security scanning** — gitleaks for secrets, npm audit for vulnerabilities
- **GitLab runner** — registered on local server with shell executor

## Pain Points

- **89 type errors from multi-agent parallel work** — multiple agents edited same files (notes/index.ts, agents/index.ts, db-security.ts)
- **Wrong test framework imports** — vitest and bun:test leaked in, not in project deps
- **Interface changes not propagated** — `reachedDate` removed from Proposal type but callers still referenced it
- **No scope boundaries** — agents didn't know which files were "theirs"

## Rules for Next Sprint

1. **Test framework**: only import from `node:test` + `node:assert/strict`
2. **Type changes**: run `grep -rn "TypeName" src/` before modifying an interface
3. **Scope discipline**: only edit files assigned to your proposal
4. **Pre-push**: always run `npm run check:types && npm test`
5. **Commit messages**: include error count tracking (e.g. "fix: 89 → 42 errors")
6. **CI checks**: `npm run check` (biome) is soft-fail for now

## Error Tracking

| Time | Errors | Agent |
|------|--------|-------|
| 04:00 | 87 | gilbert (start) |
| 04:30 | 69 | gilbert |
| 04:45 | 60 | gilbert |
| 05:00 | 49 | gilbert |
| 05:10 | 42 | gilbert + other agents |
