import { ID_PREFIX, nextId } from './ids.js';
import { DEFAULT_BPMN_TYPE, type Branch, type FlowNode, type Process, type Scope, type SequenceFlow, type StructuredRegion } from './types.js';

export function getNode(p: Process, id: string): FlowNode {
  const node = p.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`unknown node: ${id}`);
  return node;
}

export function getFlow(p: Process, id: string): SequenceFlow {
  const flow = p.flows.find((f) => f.id === id);
  if (!flow) throw new Error(`unknown flow: ${id}`);
  return flow;
}

export function rootScope(p: Process): Scope {
  const scope = p.scopes.find((s) => s.id === p.rootScopeId);
  if (!scope) throw new Error('missing root scope');
  return scope;
}

export function scopeOf(p: Process, nodeId: string): Scope {
  const scope = p.scopes.find((s) => s.nodeIds.includes(nodeId));
  if (!scope) throw new Error(`no scope for ${nodeId}`);
  return scope;
}

export function innerScope(p: Process, ownerId: string): Scope | undefined {
  return p.scopes.find((s) => s.ownerId === ownerId);
}

export function outgoingFlows(p: Process, nodeId: string): SequenceFlow[] {
  return p.flows.filter((f) => f.source === nodeId);
}

export function incomingFlows(p: Process, nodeId: string): SequenceFlow[] {
  return p.flows.filter((f) => f.target === nodeId);
}

export function successors(p: Process, nodeId: string): string[] {
  return outgoingFlows(p, nodeId).map((f) => f.target);
}

export function predecessors(p: Process, nodeId: string): string[] {
  return incomingFlows(p, nodeId).map((f) => f.source);
}

export function uniqueOutgoing(p: Process, nodeId: string): SequenceFlow {
  const outs = outgoingFlows(p, nodeId);
  if (outs.length !== 1) throw new Error(`expected 1 outgoing from ${nodeId}, got ${outs.length}`);
  return outs[0];
}

export function allRegions(p: Process): StructuredRegion[] {
  const out: StructuredRegion[] = [];
  const walk = (regions: StructuredRegion[]) => {
    for (const r of regions) {
      out.push(r);
      walk(r.nested);
    }
  };
  walk(p.regions);
  return out;
}

export function findBranch(p: Process, branchId: string): { region: StructuredRegion; branch: Branch } {
  for (const region of allRegions(p)) {
    const branch = region.branches.find((b) => b.id === branchId);
    if (branch) return { region, branch };
  }
  throw new Error(`unknown branch: ${branchId}`);
}

export function findRegion(p: Process, regionId: string): StructuredRegion {
  const region = allRegions(p).find((r) => r.id === regionId);
  if (!region) throw new Error(`unknown region: ${regionId}`);
  return region;
}

/** Node to insert after when the caller does not name a source (happy path, before End). */
export function defaultInsertAfter(p: Process): string {
  const path = happyPathIds(p);
  for (let i = path.length - 1; i >= 0; i--) {
    if (getNode(p, path[i]).type === 'end') {
      if (i === 0) throw new Error('cannot insert before the only end');
      return path[i - 1];
    }
  }
  return path[path.length - 1];
}

export function happyPathIds(p: Process, scopeId: string = p.rootScopeId): string[] {
  const scope = p.scopes.find((s) => s.id === scopeId) ?? rootScope(p);
  const starts = p.nodes.filter((n) => n.type === 'start' && scope.nodeIds.includes(n.id));
  const start = starts.find((n) => !n.eventDefinition) ?? starts[0];
  if (!start) throw new Error('process has no start');
  const path = [start.id];
  const seen = new Set(path);
  let cur = start.id;
  while (true) {
    const outs = outgoingFlows(p, cur).filter((f) => scope.nodeIds.includes(f.target));
    if (!outs.length) return path;
    const next = outs[0]!.target;
    if (seen.has(next)) return path;
    seen.add(next);
    path.push(next);
    cur = next;
  }
}

function dropFromLanes(p: Process, nodeId: string): void {
  for (const lane of p.lanes ?? []) {
    lane.nodeIds = lane.nodeIds.filter((id) => id !== nodeId);
  }
}

/** Keep `flowNodeRef` in sync: follow the source's lane, else the first band of this process. */
function adoptLane(p: Process, nodeId: string, sourceId: string): void {
  const lanes = p.lanes ?? [];
  if (!lanes.length || lanes.some((lane) => lane.nodeIds.includes(nodeId))) return;
  const fromSource = lanes.find((lane) => lane.nodeIds.includes(sourceId));
  const ofProcess = lanes.filter((lane) => lane.processId === p.id && !lane.parentLaneId);
  const fallback = ofProcess.find((lane) => lane.nodeIds.length) ?? ofProcess[0];
  const lane = fromSource ?? fallback;
  if (lane) lane.nodeIds.push(nodeId);
}

export function insertOnFlow(p: Process, flowId: string, node: FlowNode): SequenceFlow {
  const flow = getFlow(p, flowId);
  const oldTarget = flow.target;
  flow.target = node.id;
  p.nodes.push(node);
  const created: SequenceFlow = {
    id: nextId(p, 'SequenceFlow'),
    source: node.id,
    target: oldTarget,
  };
  p.flows.push(created);
  const scope = p.scopes.find((s) => s.nodeIds.includes(flow.source)) ?? rootScope(p);
  scope.nodeIds.push(node.id);
  scope.flowIds.push(created.id);
  adoptLane(p, node.id, flow.source);
  return created;
}

export function isActivity(node: FlowNode): boolean {
  return node.type === 'task' || (node.type === 'subProcess' && !node.triggeredByEvent);
}

export function isSubProcess(node: FlowNode): boolean {
  return node.type === 'subProcess';
}

export function isEventSubProcess(node: FlowNode): boolean {
  return node.type === 'subProcess' && node.triggeredByEvent === true;
}

export function makeNode(
  p: Process,
  type: FlowNode['type'],
  name: string,
  id?: string,
  bpmnType?: string,
  extra?: Pick<FlowNode, 'attachedTo' | 'eventDefinition' | 'cancelActivity' | 'triggeredByEvent' | 'calledElement'>,
): FlowNode {
  return {
    id: nextId(p, ID_PREFIX[type], id),
    type,
    name,
    bpmnType: bpmnType ?? DEFAULT_BPMN_TYPE[type],
    ...extra,
  };
}

export function detachLinear(p: Process, nodeId: string): FlowNode {
  const node = getNode(p, nodeId);
  if (node.type === 'start' || node.type === 'end') throw new Error(`cannot move ${node.type}`);
  const ins = incomingFlows(p, nodeId);
  const outs = outgoingFlows(p, nodeId);
  if (ins.length !== 1 || outs.length !== 1) throw new Error(`cannot detach ${nodeId}`);
  const keep = ins[0];
  const drop = outs[0];
  keep.target = drop.target;
  p.flows = p.flows.filter((f) => f.id !== drop.id);
  p.nodes = p.nodes.filter((n) => n.id !== nodeId);
  for (const s of p.scopes) {
    s.nodeIds = s.nodeIds.filter((id) => id !== nodeId);
    s.flowIds = s.flowIds.filter((id) => id !== drop.id);
  }
  dropFromLanes(p, nodeId);
  return node;
}

export function removeJoin(p: Process, nodeId: string): void {
  const ins = incomingFlows(p, nodeId);
  const outs = outgoingFlows(p, nodeId);
  if (ins.length < 2 || outs.length !== 1) throw new Error(`cannot remove ${nodeId}`);
  const dest = outs[0].target;
  for (const flow of ins) flow.target = dest;
  p.flows = p.flows.filter((f) => f.id !== outs[0].id);
  p.nodes = p.nodes.filter((n) => n.id !== nodeId);
  for (const s of p.scopes) {
    s.nodeIds = s.nodeIds.filter((id) => id !== nodeId);
    s.flowIds = s.flowIds.filter((id) => id !== outs[0].id);
  }
  dropFromLanes(p, nodeId);
}

export function flowAfter(p: Process, afterId: string, branchId?: string): SequenceFlow {
  if (branchId) {
    const { region, branch } = findBranch(p, branchId);
    if (afterId === region.split) return getFlow(p, branch.entryFlowId);
    if (afterId !== region.split && !branch.nodeIds.includes(afterId)) {
      throw new Error(`${afterId} is not on branch ${branchId}`);
    }
  }
  const outs = outgoingFlows(p, afterId);
  if (branchId) {
    const { branch } = findBranch(p, branchId);
    const hit = outs.find((f) => f.id === branch.entryFlowId);
    if (hit) return hit;
    if (outs.length === 1) return outs[0];
  }
  if (outs.length === 1) return outs[0];
  if (!outs.length) throw new Error(`no successor after ${afterId}`);
  throw new Error(`ambiguous after ${afterId}: pass branchId`);
}

export function flowBefore(p: Process, beforeId: string, branchId?: string): SequenceFlow {
  if (branchId) {
    const { region, branch } = findBranch(p, branchId);
    if (beforeId === region.join) {
      if (!branch.nodeIds.length) return getFlow(p, branch.entryFlowId);
      return uniqueOutgoing(p, branch.nodeIds[branch.nodeIds.length - 1]);
    }
  }
  const ins = incomingFlows(p, beforeId);
  if (ins.length === 1) return ins[0];
  if (!ins.length) throw new Error(`no predecessor before ${beforeId}`);
  throw new Error(`ambiguous before ${beforeId}: pass branchId`);
}

export function branchTailAfter(p: Process, branchId: string): { afterId: string; branchId: string } {
  const { region, branch } = findBranch(p, branchId);
  const afterId = branch.nodeIds.length ? branch.nodeIds[branch.nodeIds.length - 1] : region.split;
  return { afterId, branchId };
}
