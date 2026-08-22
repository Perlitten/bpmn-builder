import {
  findBranch,
  findRegion,
  getNode,
  happyPathIds,
  type SemanticProcess,
  type StructuredRegion,
} from '../../semantic-core/src/index.js';
import type { BranchView, FlowView, NodeView, ProcessView, RegionView } from './types.js';

function nodeView(process: SemanticProcess, id: string): NodeView {
  const node = getNode(process, id);
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    ...(node.bpmnType ? { bpmnType: node.bpmnType } : {}),
    ...(node.attachedTo ? { attachedTo: node.attachedTo } : {}),
    ...(node.eventDefinition ? { eventDefinition: node.eventDefinition } : {}),
    ...(node.calledElement ? { calledElement: node.calledElement } : {}),
  };
}

function flowView(flow: SemanticProcess['flows'][number]): FlowView {
  return {
    id: flow.id,
    source: flow.source,
    target: flow.target,
    ...(flow.name ? { name: flow.name } : {}),
    ...(flow.condition ? { condition: flow.condition } : {}),
    ...(flow.isDefault ? { isDefault: true } : {}),
  };
}

function branchView(branch: StructuredRegion['branches'][number]): BranchView {
  return {
    id: branch.id,
    name: branch.name,
    entryFlowId: branch.entryFlowId,
    nodeIds: [...branch.nodeIds],
    ...(branch.locked ? { locked: true } : {}),
  };
}

function regionView(region: StructuredRegion): RegionView {
  return {
    id: region.id,
    type: region.type,
    split: region.split,
    join: region.join,
    branches: region.branches.map(branchView),
    nested: region.nested.map(regionView),
  };
}

export function processView(process: SemanticProcess): ProcessView {
  let happyPath: string[] = [];
  try {
    happyPath = happyPathIds(process);
  } catch {
    happyPath = [];
  }
  return {
    id: process.id,
    name: process.name,
    nodes: process.nodes.map((n) => nodeView(process, n.id)),
    flows: process.flows.map(flowView),
    regions: process.regions.map(regionView),
    unstructured: [...process.unstructured],
    feedback: [...(process.feedback ?? [])],
    exceptionBranches: [...(process.exceptionBranches ?? [])],
    happyPath,
    participants: (process.participants ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.processId ? { processId: p.processId } : {}),
    })),
    lanes: (process.lanes ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      ...(l.participantId ? { participantId: l.participantId } : {}),
      nodeIds: [...l.nodeIds],
    })),
    messageFlows: (process.messageFlows ?? []).map((m) => ({
      id: m.id,
      source: m.source,
      target: m.target,
      ...(m.name ? { name: m.name } : {}),
    })),
    artifacts: (process.artifacts ?? []).flatMap((item) => {
      if (typeof item.id !== 'string') return [];
      const type = String(item.$type ?? 'unknown');
      const name = typeof item.name === 'string' ? item.name : typeof item.text === 'string' ? item.text : undefined;
      return [{ id: item.id, type, ...(name ? { name } : {}) }];
    }),
  };
}

export function inspectRegionView(process: SemanticProcess, regionId: string): RegionView {
  return regionView(findRegion(process, regionId));
}

export function inspectBranchView(process: SemanticProcess, branchId: string) {
  const { region, branch } = findBranch(process, branchId);
  return {
    regionId: region.id,
    regionType: region.type,
    split: region.split,
    join: region.join,
    branch: branchView(branch),
    nodes: branch.nodeIds.map((id) => nodeView(process, id)),
  };
}

export function isSemanticProcess(value: unknown): value is SemanticProcess {
  if (value === null || typeof value !== 'object') return false;
  const p = value as SemanticProcess;
  return typeof p.id === 'string' && Array.isArray(p.nodes) && Array.isArray(p.flows);
}
