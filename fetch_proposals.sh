#!/bin/bash

# Create a Python script to fetch all proposals and analyze
cat > analyze_proposals.py << 'PYEOF'
import json
import sys

# Sample data from batch 1 (we have this)
batch1_json = '''{"total":422,"returned":50,"truncated":true,"limit":50,"filter":{"includeTerminal":false},"items":[{"id":"820","display_id":"P820","title":"Clean-sheet hiveCentral vNext control-plane data model","status":"DRAFT","type":"component","maturity":"new"},{"id":"817","display_id":"P817","title":"P224 Locked Queue Test","status":"REVIEW","type":"feature","maturity":"new"},{"id":"810","display_id":"P810","title":"P224 Locked Queue Test","status":"REVIEW","type":"feature","maturity":"new"},{"id":"807","display_id":"P807","title":"p437-itest itest_p437_1777679285490_bxb7rf","status":"DEVELOP","type":"feature","maturity":"mature"},{"id":"802","display_id":"P802","title":"Dashboard-web portal gap report: wiring defects across non-board/proposal pages","status":"DEVELOP","type":"feature","maturity":"new"},{"id":"801","display_id":"P801","title":"Fix: last-activity row not visible in proposal modal sidebar","status":"DEVELOP","type":"issue","maturity":"mature"},{"id":"798","display_id":"P798","title":"Multi-platform subscription model architecture — split concerns","status":"DEVELOP","type":"architecture","maturity":"new"},{"id":"797","display_id":"P797","title":"Model list registry — fix multi-platform filtering","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"796","display_id":"P796","title":"Provider health tracking — async query endpoint","status":"MERGE","type":"feature","maturity":"new"},{"id":"792","display_id":"P792","title":"P224 Locked Queue Test","status":"DEVELOP","type":"feature","maturity":"new"},{"id":"789","display_id":"P789","title":"Gap: test runner and migration-number hygiene regressed after recent main changes","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"788","display_id":"P788","title":"Gap: hive-cli operator domains still return stubs for model, budget, route, provider, knowledge, and scan","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"787","display_id":"P787","title":"Gap: Runtime endpoint resolution is still env-only after P449/P431 realignment","status":"DEVELOP","type":"issue","maturity":"obsolete"},{"id":"786","display_id":"P786","title":"Gap: TypeScript hot-path debt blocks CI and obscures Claude change regressions","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"781","display_id":"P781","title":"P706-C0: shrink hot-path proposal functions to wake-up notifications and invariant maintenance","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"780","display_id":"P780","title":"P706-C7: Documentation — CONVENTIONS.md §2 + agentGuide.md updates for unified vocabulary","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"779","display_id":"P779","title":"P706-C6: Scanner rule + CI guard — flag legacy state literals as migration artifacts","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"778","display_id":"P778","title":"P706-C5: Gate-evaluator closure verdicts → maturity=obsolete + obsoleted_reason (no terminal status flip)","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"777","display_id":"P777","title":"P706-C4: TUI Board — force Workflow filter + dynamic columns + filter row redesign matching web","status":"REVIEW","type":"issue","maturity":"new"},{"id":"776","display_id":"P776","title":"P706-C3: Web Board — force Workflow filter + dynamic columns from workflow_stages","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"775","display_id":"P775","title":"P706-C2: Workflow-stages registry loader + drop hardcoded state constants from src/core + src/shared","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"774","display_id":"P774","title":"P706-C1: Migration — workflow vocab unification (Hotfix→3-stage, drop Quick Fix, add obsoleted_reason, rewrite triggers)","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"773","display_id":"P773","title":"D7: fallback chain when chosen route throttled (next eligible by priority)","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"772","display_id":"P772","title":"D6: route_decision_log audit table + write hook in resolveModelRoute","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"771","display_id":"P771","title":"D5: extend resolveModelRoute() with the 4 new filter layers (project + agency + role + budget)","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"770","display_id":"P770","title":"D4: per-(project, route) hourly token-budget table + window resetter","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"769","display_id":"P769","title":"D3: queue-role route constraints on agent_role_profile","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"768","display_id":"P768","title":"D2: agency_route_policy schema + seed (per-agency route restrictions)","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"767","display_id":"P767","title":"D1: project_route_policy schema + seed (per-project route allowlist + token-budget caps)","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"766","display_id":"P766","title":"C6: operator action surface for liaison pause/resume/retire","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"765","display_id":"P765","title":"C5: auto-recovery and scope-aware alerting from liaison/scanner liveness","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"764","display_id":"P764","title":"C4: tenant-aware agency in-flight capacity for resolve_agency","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"763","display_id":"P763","title":"C3: spawn-failure counter feeding TypeScript agency resolver","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"762","display_id":"P762","title":"C2 DROPPED: separate heartbeat cron absorbed by liaison wake-ups and scanQueues()","status":"DRAFT","type":"issue","maturity":"obsolete"},{"id":"761","display_id":"P761","title":"C1: agency liveness state consumed by resolve_agency, implemented in TypeScript","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"760","display_id":"P760","title":"B6: project_capacity_config schema + seed (per-project dispatch + token budget)","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"759","display_id":"P759","title":"B5: code rewire — every getPool() caller routes to hiveCentral or tenant pool","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"758","display_id":"P758","title":"B4: tenant-DB provisioning + project registry (hiveCentral.project)","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"757","display_id":"P757","title":"B3: migrate control-plane tables out of agenthive into hiveCentral","status":"DEVELOP","type":"issue","maturity":"obsolete"},{"id":"756","display_id":"P756","title":"B2: hiveCentral DB bootstrap (provisioning script + role grants + credentials)","status":"DEVELOP","type":"issue","maturity":"obsolete"},{"id":"755","display_id":"P755","title":"B1: control-plane boundary classification + database/control-plane-tables.md register","status":"DEVELOP","type":"issue","maturity":"obsolete"},{"id":"754","display_id":"P754","title":"A7: decommission agenthive-gate-pipeline.service + delete pipeline-cron.ts + start-gate-pipeline.ts + CONVENTIONS §6.0b","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"753","display_id":"P753","title":"A6: retire transition_queue (audit + drop migration + rollback)","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"752","display_id":"P752","title":"A5: orchestrator maintenance wake-ups and offer reaper after queue unification","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"751","display_id":"P751","title":"A4: readiness scoring and role selection inside the unified queue scanner","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"750","display_id":"P750","title":"A3: lease-based single-flight and expired-work requeue recovery","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"749","display_id":"P749","title":"A2: queue context resolver for scanQueues()","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"748","display_id":"P748","title":"A1: queue-role profile schema keyed by workflow stage and maturity","status":"DEVELOP","type":"issue","maturity":"new"},{"id":"747","display_id":"P747","title":"Umbrella D — Model Routing Restriction (multi-dimensional route eligibility + token budget + fallback)","status":"DRAFT","type":"architecture","maturity":"new"},{"id":"746","display_id":"P746","title":"Umbrella C — Agency Offline Detection + Auto-Recovery","status":"DEVELOP","type":"architecture","maturity":"new"}]}'''

data = json.loads(batch1_json)

# Analyze
status_count = {}
maturity_count = {}
type_count = {}
architecture_props = []
obsolete_props = []
umbrellas = []

for item in data['items']:
    status = item.get('status')
    maturity = item.get('maturity')
    ptype = item.get('type')
    title = item.get('title')
    pid = item.get('display_id')
    
    status_count[status] = status_count.get(status, 0) + 1
    maturity_count[maturity] = maturity_count.get(maturity, 0) + 1
    type_count[ptype] = type_count.get(ptype, 0) + 1
    
    if ptype == 'architecture':
        architecture_props.append((pid, title, status, maturity))
    if maturity == 'obsolete':
        obsolete_props.append((pid, title, status))
    if 'Umbrella' in title or 'P74' in pid and 'Model Routing' in title or 'Agency Offline' in title:
        umbrellas.append((pid, title, status))

print("=== PROPOSAL PIPELINE ANALYSIS (First 50 of 422 total) ===\n")
print(f"Total proposals in system: 422")
print(f"Returned in first batch: {data['returned']}")
print(f"Truncated: {data['truncated']}\n")

print("=== STATUS DISTRIBUTION ===")
for s, c in sorted(status_count.items(), key=lambda x: -x[1]):
    print(f"  {s:15} {c:3} proposals")

print("\n=== MATURITY DISTRIBUTION ===")
for m, c in sorted(maturity_count.items(), key=lambda x: -x[1]):
    print(f"  {m:15} {c:3} proposals")

print("\n=== TYPE DISTRIBUTION ===")
for t, c in sorted(type_count.items(), key=lambda x: -x[1]):
    print(f"  {t:15} {c:3} proposals")

print(f"\n=== ARCHITECTURE PROPOSALS (Foundation Layer) ===")
for pid, title, status, maturity in architecture_props:
    print(f"  {pid} [{status}/{maturity}] {title}")

print(f"\n=== UMBRELLA ORCHESTRATION PROPOSALS ===")
for pid, title, status in umbrellas:
    print(f"  {pid} [{status}] {title[:80]}")

print(f"\n=== OBSOLETE PROPOSALS ===")
print(f"Count: {len(obsolete_props)}")
for pid, title, status in obsolete_props[:5]:
    print(f"  {pid} [{status}] {title[:80]}")

PYEOF

python3 analyze_proposals.py
