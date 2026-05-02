#!/usr/bin/env python3

import json
import re
from collections import defaultdict
from pathlib import Path

# Read all batch files
batches = []
temp_files = [
    '/tmp/1777707939663-copilot-tool-output-r9n43t.txt',
    '/tmp/1777707939671-copilot-tool-output-i669c8.txt', 
    '/tmp/1777707939662-copilot-tool-output-6i296u.txt',
    '/tmp/1777707939670-copilot-tool-output-tsq4a3.txt'
]

all_proposals = []
for fpath in temp_files:
    try:
        with open(fpath) as f:
            data = json.load(f)
            all_proposals.extend(data.get('items', []))
    except:
        pass

print(f"Loaded {len(all_proposals)} proposals")

# Deduplicate by ID
seen = set()
unique_proposals = []
for p in all_proposals:
    if p['id'] not in seen:
        seen.add(p['id'])
        unique_proposals.append(p)

all_proposals = sorted(unique_proposals, key=lambda x: int(x['id']), reverse=True)
print(f"Unique proposals: {len(all_proposals)}\n")

# Categories
foundation_arch = []
control_plane = []
tenant_db = []
dispatch_routing = []
feature_layer = []
obsolete = []
other = []

# Classification logic
for prop in all_proposals:
    title = prop.get('title', '').lower()
    pid = prop['display_id']
    ptype = prop.get('type', '')
    maturity = prop.get('maturity', '')
    status = prop.get('status', '')
    
    # Foundation layer
    if ptype == 'architecture' or int(pid[1:]) in [744, 745, 746, 747, 688, 706, 798]:
        foundation_arch.append(prop)
    # Obsolete
    elif maturity == 'obsolete':
        obsolete.append(prop)
    # Control-plane
    elif any(kw in title for kw in ['control-plane', 'hiveCentral', 'operator', 'governance']):
        if any(kw in title for kw in ['tenant', 'project']):
            tenant_db.append(prop)
        else:
            control_plane.append(prop)
    # Tenant-DB
    elif any(kw in title for kw in ['tenant', 'project_', 'project-', 'project registry', 'project_capacity']):
        tenant_db.append(prop)
    # Dispatch/Routing
    elif any(kw in title for kw in ['queue', 'dispatch', 'route', 'orchestrat', 'liaison', 'agency', 'scanner']):
        dispatch_routing.append(prop)
    # Feature layer
    elif ptype == 'feature' or 'gap:' in title:
        feature_layer.append(prop)
    else:
        other.append(prop)

print(f"=== STRATEGIC ASSESSMENT: 251-Proposal Pipeline Audit ===\n")
print(f"FOUNDATION LAYER (Architecture): {len(foundation_arch)} proposals")
print(f"CONTROL-PLANE: {len(control_plane)} proposals")
print(f"TENANT-DB: {len(tenant_db)} proposals")
print(f"DISPATCH/ROUTING: {len(dispatch_routing)} proposals")
print(f"FEATURE LAYER: {len(feature_layer)} proposals")
print(f"OBSOLETE: {len(obsolete)} proposals")
print(f"OTHER/UNCATEGORIZED: {len(other)} proposals")
print(f"TOTAL: {len(all_proposals)} proposals\n")

print("=== FOUNDATION LAYER (7 Architecture Proposals) ===")
for prop in sorted(foundation_arch, key=lambda x: int(x['id']), reverse=True):
    print(f"{prop['display_id']:5} [{prop['status']:10} / {prop['maturity']:8}] {prop['title'][:80]}")

print("\n=== CONTROL-PLANE PROPOSALS (Sample) ===")
for prop in sorted(control_plane, key=lambda x: int(x['id']), reverse=True)[:10]:
    print(f"{prop['display_id']:5} [{prop['status']:10} / {prop['maturity']:8}] {prop['title'][:80]}")
print(f"... ({len(control_plane)} total)")

print("\n=== TENANT-DB PROPOSALS (Sample) ===")
for prop in sorted(tenant_db, key=lambda x: int(x['id']), reverse=True)[:10]:
    print(f"{prop['display_id']:5} [{prop['status']:10} / {prop['maturity']:8}] {prop['title'][:80]}")
print(f"... ({len(tenant_db)} total)")

print("\n=== DISPATCH/ROUTING PROPOSALS (A-D Work Streams) ===")
dispatch_by_letter = defaultdict(list)
for prop in sorted(dispatch_routing, key=lambda x: int(x['id']), reverse=True):
    title = prop['title']
    if ' A' in title[:20]:
        dispatch_by_letter['A'].append(prop)
    elif ' B' in title[:20]:
        dispatch_by_letter['B'].append(prop)
    elif ' C' in title[:20]:
        dispatch_by_letter['C'].append(prop)
    elif ' D' in title[:20]:
        dispatch_by_letter['D'].append(prop)
    else:
        dispatch_by_letter['OTHER'].append(prop)

for letter in ['A', 'B', 'C', 'D', 'OTHER']:
    props = dispatch_by_letter[letter]
    print(f"  {letter}: {len(props)} proposals")
    for prop in props[:3]:
        print(f"    {prop['display_id']} {prop['title'][:70]}")

print("\n=== OBSOLETE PROPOSALS (Cleanup Opportunity) ===")
print(f"Total obsolete: {len(obsolete)}")
obsolete_by_status = defaultdict(list)
for prop in obsolete:
    obsolete_by_status[prop['status']].append(prop)
for status in ['DEVELOP', 'DRAFT', 'REVIEW']:
    if status in obsolete_by_status:
        count = len(obsolete_by_status[status])
        print(f"  {status}: {count} proposals")

print("\n=== STRATEGIC INSIGHTS ===")
print(f"1. FOUNDATION LOCKED: {len([p for p in foundation_arch if p['status'] != 'MERGE'])} of {len(foundation_arch)} architecture proposals not yet merged")
print(f"2. ACTIVE PIPELINE: {len([p for p in all_proposals if p['maturity'] == 'new' and p['status'] == 'DEVELOP'])} DEVELOP/new proposals waiting for adaptation")
print(f"3. OBSOLETE RISK: {len(obsolete)} marked obsolete — recommend batch review for safety")
print(f"4. UMBRELLA ALIGNMENT: {len([p for p in all_proposals if 'Umbrella' in p['title']])} umbrella proposals visible")

