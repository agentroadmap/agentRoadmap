# Review Standards & Format Guide

## Purpose
This document defines the standardized format that all reviewers MUST use when reviewing states in the agentRoadmap.md project. Consistent formatting ensures clarity, traceability, and quality across all state reviews.

## Status Indicators

| Symbol | Meaning | Usage |
|--------|---------|-------|
| ✅ | Complete/Verified/Passed | All checks passed, implementation verified |
| ❌ | Incomplete/Failed | Checks failed, implementation incomplete |
| ⚠️ | Warning/Attention needed | Issues found, needs review |

## Required Review Format

### 1. Components Verification Table
All reviewed components must be listed in a table format:

| Component | File | Status |
|-----------|------|--------|
| ComponentName | `path/to/file.tsx` | ✅ Complete |

### 2. Acceptance Criteria Verification Table
Each acceptance criterion must be verified and documented:

| AC | Description | Status |
|----|-------------|--------|
| #1 | Description of AC | ✅ |
| #2 | Description of AC | ✅ |

### 3. Definition of Reached Checklist
All DoD items must be checked with checkboxes:

- [x] Item 1 description
- [x] Item 2 description
- [ ] Item 3 description (if incomplete)

### 4. Review Metadata Section
Each review must include:

- **Builder**: @agent-name
- **Auditor**: @agent-name
- **Maturity**: skeleton/contracted/audited
- **Proof of Arrival**: Description of verification
- **Status**: Current state status

## MCP Instructions for Reviewers

1. **Always use tables** for component and AC verification
2. **Use checkboxes** for DoD items (not tables)
3. **Include review metadata** (builder, auditor, maturity)
4. **Use consistent status indicators** (✅/❌/⚠️)
5. **Add final summary** with formatted review
6. **Reference this document** in all state reviews

## Example Review Template

```
## STATE-XX Review Summary

### Implementation Verified ✅

**[State Title]** has been successfully implemented and verified.

### Components Verified

| Component | File | Status |
|-----------|------|--------|
| ComponentName | `path/to/file.tsx` | ✅ Complete |

### Acceptance Criteria Verification

| AC | Description | Status |
|----|-------------|--------|
| #1 | Description | ✅ |
| #2 | Description | ✅ |

### Definition of Reached Checklist

- [x] All acceptance criteria verified and checked
- [x] Components render without errors
- [x] Code passes TypeScript compilation and linting checks

### Review Metadata

- **Builder**: @agent-name
- **Auditor**: @agent-name
- **Maturity**: AUDITED
- **Proof of Arrival**: Description
- **Status**: Reached

All verification gates passed. State is complete.
```

## Enforcement

This format is enforced by:
1. Reference in all state reviews (add document reference to state)
2. Auditor verification during state progression
3. CI/CD checks for format compliance (future)

## Last Updated
2026-03-20
