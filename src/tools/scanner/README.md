# Hardcoding Scanner

A comprehensive static analysis utility for detecting hardcoded configuration, paths, credentials, and multi-tenant-unfriendly literals in AgentHive codebase.

## Why

AgentHive is a multi-tenant, multi-project, multi-AI-provider system where hardcoded user names, paths, DB credentials, MCP URLs, model names, agency names, and workflow-state string literals are **operationally destructive**. Switching agencies on the shared host requires multi-file edits because of these literals. This scanner prevents them from being committed.

## Quick Start

```bash
# Scan the entire repo with human-readable output
npm run scan

# Run all rule examples (validates rule definitions)
npm run scan:self-test

# See all available rules
npm run scan -- --list-rules

# Explain a specific rule
npm run scan -- --explain example-hardcoded-tmpdir

# Scan only staged files before commit
npm run scan -- --git-staged

# Output as JSON Lines for CI/CD integration
npm run scan -- --format jsonl --out findings.jsonl

# Compare against baseline (fail only on NEW findings)
npm run scan -- --baseline .scanignore-baseline.jsonl

# Save findings for future comparison
npm run scan -- --emit-baseline .scanignore-baseline.jsonl
```

## Rule System

### Loading Rules

Rules live as YAML files in `src/tools/scanner/rules/`. Files are loaded in alphanumeric order:

- `00-example.yaml` - Framework validation examples
- `01-identity.yaml` - User/agency hardcoding patterns (to be added)
- `02-endpoints.yaml` - MCP/API URLs, hosts, ports (to be added)
- `03-credentials.yaml` - Passwords, tokens, keys (to be added)
- `04-models.yaml` - Model names, routes (to be added)
- `05-agencies.yaml` - Agency/project names (to be added)
- `06-workflow-states.yaml` - State machine string literals (to be added)
- `07-paths.yaml` - Filesystem paths, project roots (to be added)
- `08-misc.yaml` - Other multi-tenant issues (to be added)

### Rule Schema

Every rule file must contain:

```yaml
ruleset: paths
description: Filesystem paths that block multi-tenant operation
rules:
  - id: agenthive-project-root
    description: Hardcoded /data/code/AgentHive project root
    severity: high
    confidence: high
    proposal: P448
    pattern: '"/data/code/AgentHive"'  # or: regex, or: ast_query
    file_glob:
      - "src/**/*.ts"
      - "scripts/**/*.sh"
    file_glob_exclude:
      - "**/*.test.ts"
      - "src/shared/runtime/paths.ts"
    fix_suggestion: |
      Replace with getProjectRoot() from src/shared/runtime/paths.ts.
      If paths.ts does not exist yet, mark: // TODO(P448): use getProjectRoot()
    examples_match:
      - 'const ROOT = "/data/code/AgentHive";'
    examples_no_match:
      - 'const ROOT = process.env.AGENTHIVE_PROJECT_ROOT ?? "/data/code/AgentHive";'
    tags: ["paths", "multi-tenant"]
```

**Required fields:** `id`, `description`, `severity`, `confidence`, `proposal`, one of `{pattern|regex|ast_query}`, `fix_suggestion`, `examples_match`, `examples_no_match`

**Optional fields:** `file_glob`, `file_glob_exclude`, `tags`

See `src/tools/scanner/rules/SCHEMA.yaml` for the full specification.

## Adding a New Rule

1. Edit or create a rule file in `src/tools/scanner/rules/` (e.g., `02-endpoints.yaml`)
2. Add your rule with required fields
3. Include at least one `examples_match` and one `examples_no_match`
4. Run `npm run scan:self-test` — the scanner validates your rule definitions automatically
5. Commit the YAML file

No code changes needed.

## Suppressing Findings

### Inline Suppression (in source code)

Single-line suppress:
```typescript
const URL = "http://127.0.0.1:6421"; // scan:allow endpoints-mcp-hardcoded reason="local dev only"
```

Block suppress:
```typescript
/* scan:allow-block endpoints-mcp-hardcoded reason="legacy bootstrap code" */
const targets = [
  "http://127.0.0.1:6421",
  "http://127.0.0.1:6422",
];
/* scan:end-allow */
```

Acknowledged debt (reduces severity by one tier):
```typescript
const WORKTREE = "/data/code/worktree"; // TODO(P448): use getWorktreeRoot()
```

### Repository Allowlist (.scanignore.yaml)

At the repo root:
```yaml
- path: scripts/agenthive.cjs.js
  rules: "*"
  reason: generated bundle, hardcoded literals acceptable

- path: docs/architecture/control-plane.md
  rules:
    - paths.agenthive-project-root
    - endpoints.mcp-url
  reason: architecture doc must show target literals
```

## CLI Reference

### Basic Usage

```
scan-hardcoding [options] [paths...]
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `--rules <dir>` | string | `src/tools/scanner/rules` | Rule directory |
| `--rule <id>` | string | all | Run only this rule (repeatable) |
| `--rule-tag <tag>` | string | all | Run only rules with this tag |
| `--min-confidence <lvl>` | enum | `medium` | Minimum confidence (high\|medium\|low) |
| `--min-severity <lvl>` | enum | `low` | Minimum severity (critical\|high\|medium\|low) |
| `--format <fmt>` | enum | `human` | Output format (human\|jsonl\|sarif\|mcp) |
| `--out <file>` | string | stdout | Write findings to file |
| `--fail-on <severity>` | enum | — | Exit 1 if findings ≥ severity |
| `--allowlist <file>` | string | `.scanignore.yaml` | Custom allowlist YAML |
| `--self-test` | flag | — | Validate all rule examples, exit |
| `--explain <rule-id>` | string | — | Print rule details, exit |
| `--list-rules` | flag | — | Print all rules, exit |
| `--baseline <file>` | string | — | Compare against baseline; fail only on NEW findings |
| `--emit-baseline <file>` | string | — | Write findings to baseline file |
| `--concurrency <n>` | number | cpu count | File-walk parallelism |
| `--include-binary` | flag | false | Don't skip binary files |
| `--git-staged` | flag | false | Scan only staged files |
| `--git-changed` | flag | false | Scan only files changed since main |
| `-v, --verbose` | flag | false | Per-file progress |
| `--init-allowlist` | flag | — | Create `.scanignore.yaml` template, exit |

### Output Formats

**human (default):**
```
src/core/orchestration/agent-spawner.ts:27:24  high  paths.agenthive-project-root  P448
  | const WORKTREE_ROOT = "/data/code/worktree";
  | Fix: Replace with getWorktreeRoot() from src/shared/runtime/paths.ts.

Summary:
  140 findings across 47 files
   |  critical: 2  high: 87  medium: 38  low: 13
  Top rules: paths.worktree-root (25), endpoints.mcp-url (30)
  Acknowledged debt (TODO): 14 findings
  Suppressed (allowlist): 23 findings
```

**jsonl (one finding per line for AI processing):**
```jsonl
{"rule":"paths.worktree-root","file":"src/core/...","line":27,"col":24,"severity":"high","confidence":"high","proposal":"P448","match":"/data/code/worktree","snippet":"...","fix":"...","acknowledged_debt":false}
```

**sarif:** SARIF 2.1.0 for IDE integration (VS Code, GitHub code scanning).

**mcp:** (Future) Posts findings summary to an MCP proposal discussion thread.

## CI/CD Integration

### GitHub Actions

```yaml
- name: Scan for hardcoding
  run: npm run scan -- --format jsonl --out findings.jsonl --fail-on high
  
- name: Upload to code scanning
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: findings.sarif
```

### Baseline-based (fail only on new findings)

```bash
# First run: save baseline
npm run scan -- --emit-baseline .scanignore-baseline.jsonl

# Subsequent runs: fail only on new findings
npm run scan -- --baseline .scanignore-baseline.jsonl --fail-on high
```

## How AI Agents Use JSONL Output

The `--format jsonl` output is designed for downstream AI agents:

```jsonl
{"rule":"paths.worktree-root","file":"src/...","line":27,...,"fix":"Replace with getWorktreeRoot()..."}
{"rule":"endpoints.mcp-url","file":"src/...","line":92,...,"fix":"Use getDatabaseConfig()..."}
```

An AI agent can:
1. Parse each line as JSON
2. Extract the `file`, `line`, `fix` fields
3. Use `--explain <rule-id>` to get full context
4. Generate fixes in a worktree and test them

## Performance

- Scans ~2000 files in <5 seconds on a typical machine
- Respects `.gitignore` by default
- Skips binary files (unless `--include-binary`)
- Each rule compiles its regex once
- File contents read once; rules iterate the buffer
- Parallelizable: `--concurrency` controls worker count

## Testing

```bash
# Validate all rule examples (part of CI)
npm run scan:self-test

# Test a specific rule
npm run scan -- --explain my-rule-id

# Run full test suite
npm test -- tests/scanner/*.test.ts
```

Rule examples are the test suite. When you add a rule, your `examples_match` and `examples_no_match` are automatically validated on load.

## Troubleshooting

### "Rule load errors"

Run `npm run scan:self-test` to validate all rules. Errors include:
- Missing required fields
- Invalid regex
- examples_match that don't actually match
- examples_no_match that incorrectly match

### False positives

Add the example to the rule's `examples_no_match` and adjust the pattern/regex. Run `npm run scan:self-test` to validate.

### How to reduce severity of known debt

Add a `TODO(Pxxx):` comment on the line mentioning the proposal ID:
```typescript
const ROOT = "/data/code/AgentHive"; // TODO(P448): use getProjectRoot()
```

The scanner reduces severity by one tier and tags it `acknowledged_debt: true`.

## Architecture

```
src/tools/scanner/
  engine.ts        - Core scan loop, file walk, rule matching, finding aggregation
  rules.ts         - Rule type definitions, loader, validation, baseline I/O
  allowlist.ts     - .scanignore.yaml parsing, inline suppression detection
  output.ts        - Output formatters: human, jsonl, sarif
  rules/
    SCHEMA.yaml      - Canonical rule schema specification
    00-example.yaml  - Framework validation examples
    01-*.yaml        - (To be added by Security Engineer)
README.md          - This file

scripts/
  scan-hardcoding.ts - CLI entrypoint (Commander.js)

tests/
  scanner/
    engine.test.ts    - File walk, rule matching, allowlist, baseline
    rules-self-test.ts - Validates all rule examples (run in CI)

.scanignore.yaml   - Repository allowlist
```

## References

- Proposal P448: Path/user hardcoding cascade remediation
- Proposal P449: MCP URL hardcoding fixes
- Proposal P450: CLI-builders hardcoded models
- Proposal P451: Workflow state literal migration
- Proposal P452: Folder litter and temp file cleanup
- Proposal P453: Workflow-state accessor module
- CONVENTIONS.md §4a: Folder Discipline
- CONVENTIONS.md §9: (future Hardcoding Red Flags table)
