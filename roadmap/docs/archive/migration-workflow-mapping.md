# Workflow Migration: Claiming, Transitions, Merge Process
**STATE-095 AC#6** | Created: 2026-03-25 15:15 UTC | Author: Carter

## Workflows Mapped

| Workflow | Current (File) | Target (Postgres) |
|----------|----------------|---------------------|
| Agent Claiming | Lock files + heartbeat | `claims` table with TTL |
| State Transitions | Frontmatter edit + git | workflow actions with validation |
| Merge Process | Git merge + conflict resolution | Postgres merge + conflict table |
| Activity Logging | Git log | `activity_log` table |
| Readiness Check | File scan | Subscription query |

---

## 1. Agent Claiming → `claims` Table

### Current: File-Based Locking

```
roadmap/worktree-locks/
  ├── STATE-095.json   {"agentId":"carter","claimedAt":"...","heartbeat":"..."}
  └── STATE-084.json   {"agentId":"dev-stdb-1","claimedAt":"...","heartbeat":"..."}
```

**Problems:** Stale locks, no real-time visibility, requires file polling.

### Target: Postgres `claims` Table

```sql
CREATE TABLE claims (
  state_id    TEXT PRIMARY KEY,  -- FK → states.id
  agent_id    TEXT NOT NULL,
  claimed_at  BIGINT NOT NULL,   -- epoch ms
  heartbeat   BIGINT NOT NULL,   -- last heartbeat timestamp
  expires_at  BIGINT NOT NULL    -- claimed_at + lease_duration
);
```

### workflow actions

```typescript
// claim_state workflow action
claimState(stateId: string, agentId: string): Claim {
  // 1. Check state exists
  const state = states.get(stateId);
  if (!state) throw new Error(`State '${stateId}' not found`);
  
  // 2. Check existing claim
  const existing = claims.get(stateId);
  if (existing && existing.expiresAt > Date.now()) {
    if (existing.agentId !== agentId) {
      throw new Error(`State '${stateId}' claimed by '${existing.agentId}'`);
    }
    // Renew own claim
    return this.renewClaim(stateId, agentId);
  }
  
  // 3. Create claim
  const claim = {
    stateId,
    agentId,
    claimedAt: Date.now(),
    heartbeat: Date.now(),
    expiresAt: Date.now() + LEASE_DURATION_MS, // 48h default
  };
  
  claims.insert(claim);
  activityLog.insert({ stateId, action: 'claim', agentId, timestamp: Date.now() });
  notifySubscribers('claim', claim);
  
  return claim;
}

// heartbeat workflow action (called periodically)
heartbeat(stateId: string, agentId: string): void {
  const claim = claims.get(stateId);
  if (!claim) throw new Error(`No claim for '${stateId}'`);
  if (claim.agentId !== agentId) throw new Error(`Not claimed by '${agentId}'`);
  
  claim.heartbeat = Date.now();
  claim.expiresAt = Date.now() + LEASE_DURATION_MS; // Extend lease
  claims.update(claim);
}

// release_state workflow action
releaseState(stateId: string, agentId: string): void {
  const claim = claims.get(stateId);
  if (!claim) throw new Error(`No claim for '${stateId}'`);
  if (claim.agentId !== agentId) throw new Error(`Not claimed by '${agentId}'`);
  
  claims.delete(stateId);
  activityLog.insert({ stateId, action: 'release', agentId, timestamp: Date.now() });
  notifySubscribers('release', { stateId, agentId });
}

// cleanup_expired_claims workflow action (called by scheduler)
cleanupExpiredClaims(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const claim of claims.getAll()) {
    if (claim.expiresAt < now) {
      claims.delete(claim.stateId);
      activityLog.insert({
        stateId: claim.stateId,
        action: 'claim_expired',
        agentId: claim.agentId,
        timestamp: now,
        details: `Lease expired after ${now - claim.claimedAt}ms`
      });
      notifySubscribers('claim_expired', claim);
      cleaned++;
    }
  }
  
  return cleaned;
}
```

### Migration Mapping

| File Operation | Postgres Operation |
|---------------|---------------|
| `writeFileSync(lockPath, JSON.stringify(claim))` | `claims.insert(claim)` |
| `readFileSync(lockPath)` | `claims.get(stateId)` |
| `unlinkSync(lockPath)` | `claims.delete(stateId)` |
| Heartbeat file update | `claims.update(claim)` |
| Stale lock detection (cron) | `cleanupExpiredClaims()` workflow action |

---

## 2. State Transitions → workflow actions with Validation

### Current: Frontmatter Edit

```
1. Agent edits state-095.md frontmatter: status: active → complete
2. Git commit
3. Next loadStates() picks up change
```

**Problems:** No validation, no history, conflicts on concurrent edits.

### Target: Transition workflow actions

```typescript
// transition_state workflow action
transitionState(
  stateId: string,
  targetStatus: DatabaseStateStatus,
  agentId: string,
  justification?: string
): RoadmapStateRow {
  // 1. Get current state
  const state = states.get(stateId);
  if (!state) throw new Error(`State '${stateId}' not found`);
  
  // 2. Validate transition (from state-types.ts)
  validateStateTransition(state.status, targetStatus);
  
  // 3. Check claim (if required for this transition)
  if (REQUIRES_CLAIM.has(targetStatus)) {
    const claim = claims.get(stateId);
    if (!claim || claim.agentId !== agentId) {
      throw new Error(`Must claim '${stateId}' before transitioning to '${targetStatus}'`);
    }
  }
  
  // 4. Record transition
  const transition = {
    stateId,
    fromStatus: state.status,
    toStatus: targetStatus,
    agentId,
    timestamp: Date.now(),
    justification: justification ?? null,
  };
  
  stateTransitions.insert(transition);
  
  // 5. Update state
  state.status = targetStatus;
  state.updatedDate = Date.now();
  states.update(state);
  
  // 6. Log activity
  activityLog.insert({
    stateId,
    action: `transition:${state.status}→${targetStatus}`,
    agentId,
    timestamp: Date.now(),
    details: justification,
  });
  
  // 7. Notify subscribers
  notifySubscribers('transition', { state, transition });
  
  return state;
}

// Valid transitions matrix
const VALID_TRANSITIONS: Record<DatabaseStateStatus, DatabaseStateStatus[]> = {
  'potential':     ['contracted', 'abandoned'],
  'contracted':    ['active', 'abandoned'],
  'active':        ['complete', 'abandoned'],
  'complete':      [],  // Terminal
  'abandoned':     ['potential'],  // Can be revived
};
```

### Migration Mapping

| File Operation | Postgres Operation |
|---------------|---------------|
| Edit frontmatter `status:` | `transitionState(stateId, newStatus, agentId)` |
| Git log for history | `stateTransitions.query({ stateId })` |
| validateStateTransition() | Built into workflow action |

---

## 3. Merge Process → Postgres Merge workflow actions

### Current: Git Merge + Conflict Resolution

```
1. git merge pool/openclaw
2. If conflicts: manual resolution
3. resolveStateConflict(existing, incoming, strategy)
4. Commit merge result
```

**Problems:** Merge conflicts are opaque, no structured conflict tracking.

### Target: Postgres Merge Process

```typescript
// merge_states workflow action
mergeStates(
  sourceAgentId: string,
  incomingStates: RoadmapStateRow[],
  resolutionStrategy: 'most_recent' | 'most_progressed' | 'manual'
): MergeResult {
  const conflicts: StateConflict[] = [];
  const merged: string[] = [];
  
  for (const incoming of incomingStates) {
    const existing = states.get(incoming.id);
    
    if (!existing) {
      // No conflict - new state
      states.insert(incoming);
      merged.push(incoming.id);
      continue;
    }
    
    // Check for conflict
    if (isConflict(existing, incoming)) {
      const conflict: StateConflict = {
        stateId: incoming.id,
        existingVersion: existing,
        incomingVersion: incoming,
        conflictType: classifyConflict(existing, incoming),
        detectedAt: Date.now(),
      };
      
      // Auto-resolve if strategy allows
      if (resolutionStrategy !== 'manual' && canAutoResolve(conflict)) {
        const resolved = autoResolve(conflict, resolutionStrategy);
        states.update(resolved);
        merged.push(incoming.id);
        
        conflictLog.insert({
          ...conflict,
          resolved: true,
          resolution: resolutionStrategy,
          resolvedAt: Date.now(),
        });
      } else {
        // Flag for manual resolution
        conflictLog.insert(conflict);
        conflicts.push(conflict);
      }
    } else {
      // Same content - skip
      merged.push(incoming.id);
    }
  }
  
  return { merged, conflicts, total: incomingStates.length };
}

// resolve_conflict workflow action (manual resolution)
resolveConflict(
  stateId: string,
  chosenVersion: 'existing' | 'incoming' | 'merged',
  mergedContent?: string,
  agentId?: string
): RoadmapStateRow {
  const conflict = conflictLog.getLatest(stateId);
  if (!conflict || conflict.resolved) {
    throw new Error(`No active conflict for '${stateId}'`);
  }
  
  let resolved: RoadmapStateRow;
  if (chosenVersion === 'existing') {
    resolved = conflict.existingVersion;
  } else if (chosenVersion === 'incoming') {
    resolved = conflict.incomingVersion;
  } else {
    // Custom merge
    resolved = mergeContent(conflict.existingVersion, conflict.incomingVersion, mergedContent);
  }
  
  states.update(resolved);
  conflictLog.update({ ...conflict, resolved: true, resolution: chosenVersion, resolvedBy: agentId });
  
  activityLog.insert({
    stateId,
    action: 'conflict_resolved',
    agentId: agentId ?? 'system',
    timestamp: Date.now(),
    details: `Chose: ${chosenVersion}`,
  });
  
  return resolved;
}
```

### Conflict Types

| Type | Detection | Auto-Resolve |
|------|-----------|--------------|
| `status_divergence` | Same state, different status | most_progressed |
| `content_edit` | Both sides edited content | manual |
| `assignee_change` | Different assignees | most_recent |
| `dependency_mismatch` | Dependencies conflict | manual |
| `title_change` | Title differs | most_recent |

---

## 4. Activity Logging → `activity_log` Table

### Current: Git Commits

```bash
$ git log --oneline -- roadmap/states/state-095*
abc1234 feat: complete STATE-095
def5678 update status to active
```

### Target: Structured Activity Log

```sql
CREATE TABLE activity_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  state_id    TEXT NOT NULL,        -- FK → states.id
  timestamp   BIGINT NOT NULL,      -- epoch ms
  action      TEXT NOT NULL,        -- 'claim', 'transition', 'edit', 'merge'
  agent_id    TEXT NOT NULL,
  details     TEXT                  -- JSON metadata
);
```

### Activity Types

| Action | Trigger | Details |
|--------|---------|---------|
| `claim` | claimState() | agentId |
| `release` | releaseState() | agentId |
| `claim_expired` | cleanupExpiredClaims() | expired duration |
| `transition:X→Y` | transitionState() | from/to status |
| `edit` | updateState() | changed fields |
| `merge` | mergeStates() | source agent, conflicts |
| `conflict_resolved` | resolveConflict() | resolution strategy |
| `complete` | completeState() | proof items |

---

## 5. Readiness Check → Subscription Query

### Current: File Scan

```typescript
// Scan all states, check readiness criteria
for (const state of states) {
  if (state.status === 'contracted' && allDepsComplete(state)) {
    readyStates.push(state);
  }
}
```

### Target: Live Subscription

```typescript
// Subscribe to ready states
const readySub = postgres.subscribe({
  table: 'states',
  filter: {
    status: 'contracted',
    // Server-side join: all dependencies in 'complete' status
  },
  onInsert: (state) => {
    // New ready state appeared
    ui.addReadyState(state);
  },
  onUpdate: (state, old) => {
    if (old.status !== 'contracted' && state.status === 'contracted') {
      // State just became ready
      ui.addReadyState(state);
    }
  },
  onDelete: (state) => {
    // State removed from ready pool
    ui.removeReadyState(state.id);
  }
});
```

---

## Migration Sequencing

| Step | Action | Downtime |
|------|--------|----------|
| 1 | Deploy `claims` table + workflow actions | None |
| 2 | Dual-write claims (file + Postgres) | None |
| 3 | Switch claim reads to Postgres | None |
| 4 | Deploy transition workflow actions | None |
| 5 | Dual-write transitions | None |
| 6 | Deploy merge workflow actions | None |
| 7 | Disable file-based workflows | None |
| 8 | Remove file-based claim locks | None |

---

## Verification Tests

| Test | Assertion |
|------|-----------|
| Claim + heartbeat | State claim persists, heartbeat extends lease |
| Concurrent claim | Second agent rejected while claimed |
| Expired claim cleanup | Claims >48h old auto-released |
| Valid transition | Potential → Active succeeds |
| Invalid transition | Active → Potential rejected |
| Claim-gated transition | Complete requires active claim |
| Merge: no conflict | New states inserted directly |
| Merge: auto-resolve | Status divergence auto-resolved |
| Merge: manual conflict | Content edit flagged for review |
| Activity log query | All actions recorded with timestamps |

---

## Next Steps

- [ ] AC#7: Phased rollout plan with success metrics
- [ ] Implement merge workflow actions in state-storage.ts
- [ ] Add conflict detection logic
