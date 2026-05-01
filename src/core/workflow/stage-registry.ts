import { query } from '../../infra/postgres/pool.js';

export interface WorkflowStageDefinition {
  stageName: string;
  displayLabel: string;
  displayOrder: number;
  hexColor: string | null;
  allowedNext: string[];
  gateId: string | null;
  isTerminal: boolean;
  isActive: boolean;
}

let stageCache: Map<string, WorkflowStageDefinition> | null = null;

// Invalidate cache on pg_notify 'workflow_stage_changed' (wired by callers via listenForStageChanges)
export function invalidateStageCache(): void {
  stageCache = null;
}

export async function loadStageRegistry(): Promise<Map<string, WorkflowStageDefinition>> {
  if (stageCache !== null) return stageCache;

  const result = await query<{
    stage_name: string;
    display_label: string;
    display_order: number;
    hex_color: string | null;
    allowed_next: string[];
    gate_id: string | null;
    is_terminal: boolean;
    is_active: boolean;
  }>(
    `SELECT stage_name, display_label, display_order, hex_color,
            allowed_next, gate_id, is_terminal, is_active
     FROM roadmap.workflow_stage_definition
     WHERE is_active = true
     ORDER BY display_order`,
  );

  const map = new Map<string, WorkflowStageDefinition>();
  for (const row of result.rows) {
    map.set(row.stage_name, {
      stageName:    row.stage_name,
      displayLabel: row.display_label,
      displayOrder: row.display_order,
      hexColor:     row.hex_color,
      allowedNext:  row.allowed_next,
      gateId:       row.gate_id,
      isTerminal:   row.is_terminal,
      isActive:     row.is_active,
    });
  }
  stageCache = map;
  return map;
}

export async function getStageDefinition(
  stageName: string,
): Promise<WorkflowStageDefinition | undefined> {
  const registry = await loadStageRegistry();
  return registry.get(stageName);
}

export async function getOrderedStages(): Promise<WorkflowStageDefinition[]> {
  const registry = await loadStageRegistry();
  return Array.from(registry.values()).sort((a, b) => a.displayOrder - b.displayOrder);
}
