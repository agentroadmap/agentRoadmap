# Exhaustive Verification Standards

## Overview

This document defines the standards for exhaustive product-level testing within the Proof of Arrival mandate. These standards ensure that states cannot be marked Reached without comprehensive verification across multiple test categories.

## Test Categories

### 1. Unit Tests

**Scope**: Individual functions, classes, and modules in isolation.

**Criteria**:
- Direct import and function invocation (no CLI spawning)
- Fast execution (< 100ms per test)
- No filesystem or network dependencies (mocked)
- Coverage: All public APIs and exported functions

**When Required**: Always. Every state with code changes must pass unit tests.

### 2. Integration Tests

**Scope**: Multiple modules working together, often involving CLI spawning and filesystem operations.

**Criteria**:
- Test CLI commands end-to-end via `execSync()`
- Verify state creation, editing, and transitions
- Test MCP tool invocations
- Use isolated test directories (`createUniqueTestDir()`)

**When Required**: When state modifies CLI behavior, MCP tools, or state management.

### 3. End-to-End (E2E) Tests

**Scope**: Complete user workflows spanning multiple components.

**Criteria**:
- Simulate real user journeys (create state -> edit -> add ACs -> mark reached)
- Test cross-feature interactions (board + states + search)
- Verify platform-specific behavior (Windows/Mac/Linux)
- Include error recovery scenarios

**When Required**: When state affects user-facing workflows or cross-cutting concerns.

### 4. Regression Tests

**Scope**: Previously broken functionality that must not break again.

**Criteria**:
- Named with `regression-` prefix or tagged with `[regression]`
- Document the original bug in test description
- Test the exact scenario that previously failed
- Run as part of every CI pipeline

**When Required**: When a bug fix needs permanent protection.

## Verification Statement Format

Peer testers use verification statements to specify required test coverage:

```yaml
verificationStatements:
  - description: "Unit tests pass for new API"
    evidenceType: test-result
    verifier: builder
    testCategory: unit

  - description: "Integration tests cover CLI workflow"
    evidenceType: test-result
    verifier: peer-tester
    testCategory: integration

  - description: "E2E regression for bug #123"
    evidenceType: test-result
    verifier: peer-tester
    testCategory: regression
```

## Test Discovery Convention

Test files must follow these naming patterns:

| Pattern | Category | Example |
|---------|----------|---------|
| `*.test.ts` | Unit | `markdown.test.ts` |
| `cli-*.test.ts` | Integration | `cli-search.test.ts` |
| `mcp-*.test.ts` | Integration | `mcp-states.test.ts` |
| `e2e-*.test.ts` | E2E | `e2e-workflow.test.ts` |
| `regression-*.test.ts` | Regression | `regression-issue-123.test.ts` |
| `board-*.test.ts` | Integration | `board-render.test.ts` |

## Issue Tracking

### Test Issues

A test issue is a finding from testing that indicates a bug or regression. Issues are tracked per-state:

```typescript
interface TestIssue {
  id: string;           // e.g., "ISSUE-10.1-1"
  stateId: string;      // State that introduced or is affected by the issue
  title: string;        // Brief description
  severity: "critical" | "major" | "minor";
  testFile: string;     // Test that found the issue
  discoveredAt: string; // ISO timestamp
  status: "open" | "resolved" | "wontfix";
}
```

### Blocking Rules

- **Critical issues**: Block Reached transition immediately
- **Major issues**: Block Reached unless explicitly waived with justification
- **Minor issues**: Logged but do not block

## Exhaustive Verification Checklist

A state meets exhaustive verification when:

- [ ] All required test categories (unit/integration/E2E/regression) pass
- [ ] No open critical or major test issues
- [ ] Verification statements are satisfied with evidence
- [ ] Test coverage meets category thresholds
- [ ] Peer tester has reviewed and approved (if required)
