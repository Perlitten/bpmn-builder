import { rebuildStructure } from './detect.js';
import { allRegions, getNode, incomingFlows, innerScope, insertionFlow, insertOnFlow, makeNode, outgoingFlows, rootScope, scopeOf } from './graph.js';
import { nextId } from './ids.js';
import type { Applied, PlaceSpec, Process, StructuredRegion } from './types.js';

function apply(prev: Process, fn: (draft: Process) => string): Applied {
  const draft = structuredClone(prev);
  const id = fn(draft);
  rebuildStructure(draft);
  return { process: draft, inverse: () => structuredClone(prev), id };
}

function collectRegion(region: StructuredRegion, into: Set<string>): void {
  into.add(region.split);
  into.add(region.join);
  for (const branch of region.branches) {
    for (const id of branch.nodeIds) into.add(id);
  }
  for (const nested of region.nested) collectRegion(nested, into);
}

function expandFragment(p: Process, nodeIds: string[]): Set<string> {
  const set = new Set(nodeIds);
  for (const id of nodeIds) getNode(p, id);
  for (const region of allRegions(p)) {
    if (set.has(region.split) || set.has(region.join)) collectRegion(region, set);
  }
  for (const node of p.nodes) {
    if (node.type !== 'boundaryEvent' || !node.attachedTo || !set.has(node.attachedTo)) continue;
    set.add(node.id);
  }
  for (const ex of p.exceptionBranches ?? []) {
    if (!set.has(ex.boundaryId) && !set.has(ex.hostId)) continue;
    set.add(ex.boundaryId);
    for (const id of ex.nodeIds) set.add(id);
  }
  return set;
}

function seedInnerProcess(draft: Process, subId: string, event: boolean): void {
  const parent = scopeOf(draft, subId);
  const start = makeNode(draft, 'start', event ? 'Message' : 'Start', undefined, 'bpmn:StartEvent', {
    ...(event ? { eventDefinition: 'MessageEventDefinition' } : {}),
  });
  const end = makeNode(draft, 'end', 'End');
  const flow = { id: nextId(draft, 'SequenceFlow'), source: start.id, target: end.id };
  draft.nodes.push(start, end);
  draft.flows.push(flow);
  draft.scopes.push({
    id: nextId(draft, 'Scope'),
    parentId: parent.id,
    ownerId: subId,
    nodeIds: [start.id, end.id],
    flowIds: [flow.id],
  });
}

function resolveParentScope(draft: Process, parent?: string) {
  if (!parent || parent === draft.id || parent === draft.rootScopeId) return rootScope(draft);
  const scope = draft.scopes.find((s) => s.id === parent);
  if (scope) return scope;
  const node = draft.nodes.find((n) => n.id === parent);
  if (node?.type === 'subProcess') {
    const inner = innerScope(draft, node.id);
    if (!inner) throw new Error(`subprocess ${parent} has no inner scope`);
    return inner;
  }
  throw new Error(`event subprocess parent must be a process or subprocess: ${parent}`);
}

/** Insert an expanded embedded subprocess on a sequence (inner start → end). */
export function addSubProcess(process: Process, spec: PlaceSpec = {}): Applied {
  return apply(process, (draft) => {
    const node = makeNode(draft, 'subProcess', spec.name ?? 'Subprocess', spec.id, spec.bpmnType ?? 'bpmn:SubProcess');
    insertOnFlow(draft, insertionFlow(draft, spec).id, node);
    seedInnerProcess(draft, node.id, false);
    return node.id;
  });
}

/** Event subprocess of `parent` (process or subprocess). Not on sequence flow. */
export function createEventSubprocess(
  process: Process,
  spec: { parent?: string; name?: string; id?: string } = {},
): Applied {
  return apply(process, (draft) => {
    const parentScope = resolveParentScope(draft, spec.parent);
    const node = makeNode(draft, 'subProcess', spec.name ?? 'Event Subprocess', spec.id, 'bpmn:SubProcess', {
      triggeredByEvent: true,
    });
    draft.nodes.push(node);
    parentScope.nodeIds.push(node.id);
    seedInnerProcess(draft, node.id, true);
    return node.id;
  });
}

/** Wrap a single-entry single-exit fragment in an embedded subprocess. */
export function wrapInSubprocess(process: Process, nodeIds: string[], spec: { name?: string } = {}): Applied {
  if (!nodeIds.length) throw new Error('wrapInSubprocess needs node ids');
  return apply(process, (draft) => {
    const fragment = expandFragment(draft, nodeIds);
    const parentScope = scopeOf(draft, nodeIds[0]!);
    for (const id of fragment) {
      if (scopeOf(draft, id).id !== parentScope.id) throw new Error('cannot wrap nodes from different scopes');
    }
    for (const id of fragment) {
      const node = getNode(draft, id);
      if (node.type === 'start' && incomingFlows(draft, id).length === 0) {
        throw new Error('cannot wrap the scope start');
      }
      if (node.type === 'end' && outgoingFlows(draft, id).length === 0) {
        throw new Error('cannot wrap the scope end');
      }
    }
    const ins = draft.flows.filter((f) => fragment.has(f.target) && !fragment.has(f.source));
    const outs = draft.flows.filter((f) => fragment.has(f.source) && !fragment.has(f.target));
    if (ins.length !== 1 || outs.length !== 1) {
      throw new Error('wrapInSubprocess needs a single-entry single-exit fragment');
    }
    const inFlow = ins[0]!;
    const outFlow = outs[0]!;
    const entry = inFlow.target;
    const exit = outFlow.source;

    const sub = makeNode(draft, 'subProcess', spec.name ?? 'Subprocess', undefined, 'bpmn:SubProcess');
    draft.nodes.push(sub);
    parentScope.nodeIds.push(sub.id);
    parentScope.nodeIds = parentScope.nodeIds.filter((id) => id === sub.id || !fragment.has(id));
    inFlow.target = sub.id;
    outFlow.source = sub.id;

    const innerStart = makeNode(draft, 'start', 'Start');
    const innerEnd = makeNode(draft, 'end', 'End');
    const startFlow = { id: nextId(draft, 'SequenceFlow'), source: innerStart.id, target: entry };
    const endFlow = { id: nextId(draft, 'SequenceFlow'), source: exit, target: innerEnd.id };
    draft.nodes.push(innerStart, innerEnd);
    draft.flows.push(startFlow, endFlow);

    const innerFlowIds = [
      ...draft.flows.filter((f) => fragment.has(f.source) && fragment.has(f.target)).map((f) => f.id),
      startFlow.id,
      endFlow.id,
    ];
    parentScope.flowIds = parentScope.flowIds.filter((id) => !innerFlowIds.includes(id));
    draft.scopes.push({
      id: nextId(draft, 'Scope'),
      parentId: parentScope.id,
      ownerId: sub.id,
      nodeIds: [innerStart.id, ...fragment, innerEnd.id],
      flowIds: innerFlowIds,
    });

    for (const lane of draft.lanes ?? []) {
      const had = [...fragment].some((id) => lane.nodeIds.includes(id));
      lane.nodeIds = lane.nodeIds.filter((id) => !fragment.has(id));
      if (had && !lane.nodeIds.includes(sub.id)) lane.nodeIds.push(sub.id);
    }
    return sub.id;
  });
}
