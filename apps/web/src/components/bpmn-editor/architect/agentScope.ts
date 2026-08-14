import type { AgentScope, AgentScopeKind } from '@bpmn/agent-tools';
import { allRegions, type Process } from '@bpmn/semantic-core';

export const AGENT_SCOPE_OPTIONS: Array<{ kind: AgentScopeKind; label: string }> = [
  { kind: 'process', label: 'Whole process' },
  { kind: 'region', label: 'Current region' },
  { kind: 'branch', label: 'Current branch' },
  { kind: 'selection', label: 'Selection' },
];

export type AgentContext = {
  regionId?: string;
  branchId?: string;
  branchLocked: boolean;
  selectionIds: string[];
};

function locate(process: Process, id: string): { regionId?: string; branchId?: string } {
  for (const region of allRegions(process)) {
    if (region.id === id || region.split === id || region.join === id) return { regionId: region.id };
    for (const branch of region.branches) {
      if (branch.id === id || branch.entryFlowId === id || branch.nodeIds.includes(id)) {
        return { regionId: region.id, branchId: branch.id };
      }
    }
  }
  const flow = process.flows.find((item) => item.id === id);
  if (flow) {
    const fromSource = locate(process, flow.source);
    if (fromSource.branchId) return fromSource;
    return locate(process, flow.target);
  }
  return {};
}

export function resolveAgentContext(process: Process, selectedIds: string[]): AgentContext {
  const selectionIds = selectedIds.filter(Boolean);
  const regions = new Set<string>();
  const branches = new Set<string>();
  for (const id of selectionIds) {
    const hit = locate(process, id);
    if (hit.regionId) regions.add(hit.regionId);
    if (hit.branchId) branches.add(hit.branchId);
  }
  const regionId = regions.size === 1 ? [...regions][0] : undefined;
  const branchId = branches.size === 1 ? [...branches][0] : undefined;
  const branch = branchId
    ? allRegions(process)
        .flatMap((region) => region.branches)
        .find((item) => item.id === branchId)
    : undefined;
  return {
    regionId,
    branchId,
    branchLocked: Boolean(branch?.locked),
    selectionIds,
  };
}

export function buildAssistantScope(kind: AgentScopeKind, ctx: AgentContext): AgentScope {
  if (kind === 'region' && ctx.regionId) return { kind: 'region', id: ctx.regionId };
  if (kind === 'branch' && ctx.branchId) return { kind: 'branch', id: ctx.branchId };
  if (kind === 'selection' && ctx.selectionIds.length) return { kind: 'selection', ids: ctx.selectionIds };
  return { kind: 'process' };
}

export function scopeOptionEnabled(kind: AgentScopeKind, ctx: AgentContext): boolean {
  if (kind === 'process') return true;
  if (kind === 'region') return Boolean(ctx.regionId);
  if (kind === 'branch') return Boolean(ctx.branchId);
  return ctx.selectionIds.length > 0;
}
