import { bpmnComponentRegistry } from './components/index.js';
import { rebuildStructure } from './detect.js';
import {
  allRegions,
  branchTailAfter,
  defaultInsertAfter,
  detachLinear,
  findBranch,
  findRegion,
  flowAfter,
  flowBefore,
  getNode,
  incomingFlows,
  insertOnFlow,
  isActivity,
  makeNode,
  outgoingFlows,
  removeJoin,
  scopeOf,
} from './graph.js';
import { nextId } from './ids.js';
import type { Applied, FlowNode, FlowNodeType, GatewayKind, PlaceSpec, Process } from './types.js';

function apply(prev: Process, fn: (draft: Process) => string): Applied {
  const draft = structuredClone(prev);
  const id = fn(draft);
  rebuildStructure(draft);
  return { process: draft, inverse: () => structuredClone(prev), id };
}

export function createProcess(input: { id?: string; name?: string } = {}): Process {
  const idSeq: Record<string, number> = {};
  const id = input.id ?? 'Process_1';
  idSeq.Process = 1;
  const draft: Process = {
    id,
    name: input.name ?? 'Process',
    rootScopeId: 'Scope_1',
    idSeq: { ...idSeq, Scope: 1, StartEvent: 1, EndEvent: 1, SequenceFlow: 1 },
    scopes: [{ id: 'Scope_1', parentId: null, ownerId: null, nodeIds: ['StartEvent_1', 'EndEvent_1'], flowIds: ['SequenceFlow_1'] }],
    nodes: [
      { id: 'StartEvent_1', type: 'start', name: 'Start', bpmnType: 'bpmn:StartEvent' },
      { id: 'EndEvent_1', type: 'end', name: 'End', bpmnType: 'bpmn:EndEvent' },
    ],
    flows: [{ id: 'SequenceFlow_1', source: 'StartEvent_1', target: 'EndEvent_1' }],
    regions: [],
    unstructured: [],
    feedback: [],
    exceptionBranches: [],
    participants: [],
    lanes: [],
    messageFlows: [],
    processes: [],
  };
  return rebuildStructure(draft);
}

function placeType(spec: PlaceSpec): FlowNodeType {
  return spec.type ?? 'task';
}

/** Visible default when a start/end/task is created or imported without a name. */
export function defaultFlowNodeName(type: string): string {
  const t = type.replace(/^bpmn:/i, '').toLowerCase();
  if (t === 'start' || t === 'startevent') return 'Start';
  if (t === 'end' || t === 'endevent') return 'End';
  if (t === 'task') return 'Task';
  return '';
}

export function visibleNodeName(type: string, name?: string): string {
  const trimmed = name?.trim() ?? '';
  return trimmed || defaultFlowNodeName(type);
}

function placeName(spec: PlaceSpec): string {
  if (spec.name != null) return spec.name;
  return defaultFlowNodeName(placeType(spec));
}

function placeExtra(spec: PlaceSpec): Pick<FlowNode, 'eventDefinition' | 'cancelActivity' | 'calledElement'> | undefined {
  const extra: Pick<FlowNode, 'eventDefinition' | 'cancelActivity' | 'calledElement'> = {};
  if (spec.eventDefinition) extra.eventDefinition = spec.eventDefinition;
  if (spec.cancelActivity === false) extra.cancelActivity = false;
  if (spec.calledElement) extra.calledElement = spec.calledElement;
  return extra.eventDefinition || extra.cancelActivity === false || extra.calledElement ? extra : undefined;
}

export function addAfter(process: Process, afterId: string, spec: PlaceSpec = {}): Applied {
  return apply(process, (draft) => {
    const type = placeType(spec);
    if (type === 'start') throw new Error('cannot insert a start on a sequence flow');
    if (type === 'end') throw new Error('cannot insert an end with an outgoing flow');
    const node = makeNode(draft, type, placeName(spec), spec.id, spec.bpmnType, placeExtra(spec));
    insertOnFlow(draft, flowAfter(draft, afterId, spec.branchId).id, node);
    return node.id;
  });
}

export function addBefore(process: Process, beforeId: string, spec: PlaceSpec = {}): Applied {
  return apply(process, (draft) => {
    const type = placeType(spec);
    if (type === 'start') throw new Error('cannot insert a start on a sequence flow');
    if (type === 'end') throw new Error('cannot insert an end with an outgoing flow');
    const node = makeNode(draft, type, placeName(spec), spec.id, spec.bpmnType, placeExtra(spec));
    insertOnFlow(draft, flowBefore(draft, beforeId, spec.branchId).id, node);
    return node.id;
  });
}

export function addTask(process: Process, spec: PlaceSpec = {}): Applied {
  if (spec.before) return addBefore(process, spec.before, spec);
  if (spec.after) return addAfter(process, spec.after, spec);
  if (spec.branchId) {
    const { afterId, branchId } = branchTailAfter(process, spec.branchId);
    return addAfter(process, afterId, { ...spec, branchId });
  }
  return addAfter(process, defaultInsertAfter(process), spec);
}

export function removeElement(process: Process, id: string): Applied {
  return apply(process, (draft) => {
    const node = getNode(draft, id);
    if (node.type === 'start') throw new Error('cannot remove start');
    const ins = incomingFlows(draft, id);
    const outs = outgoingFlows(draft, id);
    if (ins.length === 1 && outs.length === 1) detachLinear(draft, id);
    else if (ins.length >= 2 && outs.length === 1) removeJoin(draft, id);
    else throw new Error(`cannot remove ${id}`);
    return id;
  });
}

export function renameElement(process: Process, id: string, name: string): Applied {
  return apply(process, (draft) => {
    const node = draft.nodes.find((n) => n.id === id);
    if (node) {
      node.name = name;
      return id;
    }
    const flow = draft.flows.find((f) => f.id === id);
    if (flow) {
      flow.name = name;
      for (const region of allRegions(draft)) {
        const branch = region.branches.find((b) => b.entryFlowId === id);
        if (branch) branch.name = name;
      }
      return id;
    }
    for (const region of allRegions(draft)) {
      const branch = region.branches.find((b) => b.id === id);
      if (!branch) continue;
      branch.name = name;
      const entry = draft.flows.find((f) => f.id === branch.entryFlowId);
      if (entry) entry.name = name;
      return id;
    }
    const participant = (draft.participants ?? []).find((p) => p.id === id);
    if (participant) {
      participant.name = name;
      return id;
    }
    const lane = (draft.lanes ?? []).find((l) => l.id === id);
    if (lane) {
      lane.name = name;
      return id;
    }
    const message = (draft.messageFlows ?? []).find((m) => m.id === id);
    if (message) {
      message.name = name;
      return id;
    }
    throw new Error(`unknown element: ${id}`);
  });
}

const GATEWAY_NODE: Record<GatewayKind, FlowNodeType> = {
  exclusive: 'exclusiveGateway',
  parallel: 'parallelGateway',
  inclusive: 'inclusiveGateway',
  eventBased: 'eventBasedGateway',
  complex: 'complexGateway',
};

const EVENT_CATCH_DEF = ['MessageEventDefinition', 'TimerEventDefinition'] as const;

function defaultSplitBranches(kind: GatewayKind): Array<{ name: string; id?: string }> {
  if (kind === 'eventBased') return [{ name: 'Message' }, { name: 'Timer' }];
  return [{ name: 'Yes' }, { name: 'No' }];
}

function catchEventDefinition(name: string, index: number): string {
  if (/timer/i.test(name)) return 'TimerEventDefinition';
  if (/message/i.test(name)) return 'MessageEventDefinition';
  return EVENT_CATCH_DEF[index] ?? 'MessageEventDefinition';
}

function splitGateway(
  process: Process,
  spec: {
    after: string;
    kind: GatewayKind;
    name?: string;
    branches?: Array<{ name: string; id?: string }>;
  },
): Applied {
  const branches = spec.branches ?? defaultSplitBranches(spec.kind);
  if (branches.length < 2) throw new Error(`split ${spec.kind} needs 2+ branches`);
  const splitType = GATEWAY_NODE[spec.kind];
  const joinType: FlowNodeType = spec.kind === 'eventBased' ? 'exclusiveGateway' : splitType;
  return apply(process, (draft) => {
    const split = makeNode(draft, splitType, spec.name ?? '');
    insertOnFlow(draft, flowAfter(draft, spec.after).id, split);
    const join = makeNode(draft, joinType, '');
    insertOnFlow(draft, outgoingFlows(draft, split.id)[0].id, join);
    const first = outgoingFlows(draft, split.id)[0];
    first.name = branches[0].name;
    const scope = scopeOf(draft, split.id);
    for (const branch of branches.slice(1)) {
      const flow = {
        id: nextId(draft, 'SequenceFlow'),
        source: split.id,
        target: join.id,
        name: branch.name,
      };
      draft.flows.push(flow);
      scope.flowIds.push(flow.id);
    }
    if (spec.kind === 'eventBased') {
      for (const [i, flow] of outgoingFlows(draft, split.id).entries()) {
        const name = branches[i]?.name ?? `Event ${i + 1}`;
        const catchNode = makeNode(draft, 'intermediateCatch', name, undefined, 'bpmn:IntermediateCatchEvent', {
          eventDefinition: catchEventDefinition(name, i),
        });
        insertOnFlow(draft, flow.id, catchNode);
      }
    }
    const entries = outgoingFlows(draft, split.id);
    const regionId = nextId(draft, 'Region');
    draft.regions.push({
      id: regionId,
      type: spec.kind,
      split: split.id,
      join: join.id,
      nested: [],
      branches: branches.map((branch, i) => ({
        id: nextId(draft, 'Branch', branch.id),
        name: branch.name,
        entryFlowId: entries[i].id,
        nodeIds: [],
      })),
    });
    return regionId;
  });
}

export function splitExclusive(
  process: Process,
  spec: { after: string; name?: string; branches?: Array<{ name: string; id?: string }> },
): Applied {
  return splitGateway(process, { ...spec, kind: 'exclusive' });
}

export function splitParallel(
  process: Process,
  spec: { after: string; name?: string; branches?: Array<{ name: string; id?: string }> },
): Applied {
  return splitGateway(process, { ...spec, kind: 'parallel' });
}

export function splitInclusive(
  process: Process,
  spec: { after: string; name?: string; branches?: Array<{ name: string; id?: string }> },
): Applied {
  return splitGateway(process, { ...spec, kind: 'inclusive' });
}

export function splitEventBased(
  process: Process,
  spec: { after: string; name?: string; branches?: Array<{ name: string; id?: string }> },
): Applied {
  return splitGateway(process, { ...spec, kind: 'eventBased' });
}

export function splitComplex(
  process: Process,
  spec: { after: string; name?: string; branches?: Array<{ name: string; id?: string }> },
): Applied {
  return splitGateway(process, { ...spec, kind: 'complex' });
}

export function attachBoundaryEvent(
  process: Process,
  spec: { on: string; name?: string; eventDefinition: string; interrupting?: boolean },
): Applied {
  return apply(process, (draft) => {
    const host = getNode(draft, spec.on);
    if (!isActivity(host)) throw new Error(`cannot attach a boundary event to ${host.type}`);
    const name = spec.name ?? (spec.eventDefinition === 'ErrorEventDefinition' ? 'Error' : 'Timeout');
    const interrupting = spec.eventDefinition === 'ErrorEventDefinition' ? true : spec.interrupting !== false;
    const boundary = makeNode(draft, 'boundaryEvent', name, undefined, 'bpmn:BoundaryEvent', {
      attachedTo: host.id,
      eventDefinition: spec.eventDefinition,
      cancelActivity: interrupting,
    });
    const end = makeNode(draft, 'end', name);
    const flow = {
      id: nextId(draft, 'SequenceFlow'),
      source: boundary.id,
      target: end.id,
      name,
      exception: true,
    };
    draft.nodes.push(boundary, end);
    draft.flows.push(flow);
    const scope = scopeOf(draft, host.id);
    scope.nodeIds.push(boundary.id, end.id);
    scope.flowIds.push(flow.id);
    return boundary.id;
  });
}

export function attachBoundaryTimer(
  process: Process,
  spec: { on: string; name?: string; interrupting?: boolean },
): Applied {
  return attachBoundaryEvent(process, { ...spec, eventDefinition: 'TimerEventDefinition' });
}

export function attachBoundaryError(process: Process, spec: { on: string; name?: string }): Applied {
  return attachBoundaryEvent(process, { ...spec, eventDefinition: 'ErrorEventDefinition', interrupting: true });
}

function stripEventDefinitions(node: FlowNode): void {
  const props = node.bpmnPreserve?.props;
  if (!props || !('eventDefinitions' in props)) return;
  const next = { ...props };
  delete next.eventDefinitions;
  const attrs = node.bpmnPreserve?.attrs;
  if (Object.keys(next).length) node.bpmnPreserve = { ...(attrs ? { attrs } : {}), props: next };
  else if (attrs && Object.keys(attrs).length) node.bpmnPreserve = { attrs };
  else delete node.bpmnPreserve;
}

export function setEventDefinition(process: Process, id: string, eventDefinition: string | undefined): Applied {
  return apply(process, (draft) => {
    const node = getNode(draft, id);
    if (node.type !== 'start' && node.type !== 'end' && node.type !== 'intermediateCatch' && node.type !== 'boundaryEvent') {
      throw new Error(`cannot set event definition on ${node.type}`);
    }
    if (eventDefinition) node.eventDefinition = eventDefinition;
    else delete node.eventDefinition;
    stripEventDefinitions(node);
    return id;
  });
}

export function setCalledElement(process: Process, id: string, calledElement: string): Applied {
  return apply(process, (draft) => {
    const node = getNode(draft, id);
    if (node.bpmnType !== 'bpmn:CallActivity' && node.type !== 'task') {
      throw new Error(`cannot set calledElement on ${node.type}`);
    }
    if (node.bpmnType && node.bpmnType !== 'bpmn:CallActivity') {
      throw new Error('calledElement is only valid on a call activity');
    }
    node.bpmnType = 'bpmn:CallActivity';
    const next = calledElement.trim();
    if (next) node.calledElement = next;
    else delete node.calledElement;
    if (node.bpmnPreserve?.attrs && 'calledElement' in node.bpmnPreserve.attrs) {
      const attrs = { ...node.bpmnPreserve.attrs };
      delete attrs.calledElement;
      node.bpmnPreserve = {
        ...(Object.keys(attrs).length ? { attrs } : {}),
        ...(node.bpmnPreserve.props ? { props: node.bpmnPreserve.props } : {}),
      };
      if (!node.bpmnPreserve.attrs && !node.bpmnPreserve.props) delete node.bpmnPreserve;
    }
    return id;
  });
}

const BPMN_TO_KIND: Record<string, FlowNodeType> = {
  'bpmn:StartEvent': 'start',
  'bpmn:EndEvent': 'end',
  'bpmn:Task': 'task',
  'bpmn:UserTask': 'task',
  'bpmn:ServiceTask': 'task',
  'bpmn:SendTask': 'task',
  'bpmn:ReceiveTask': 'task',
  'bpmn:ManualTask': 'task',
  'bpmn:BusinessRuleTask': 'task',
  'bpmn:ScriptTask': 'task',
  'bpmn:CallActivity': 'task',
  'bpmn:SubProcess': 'subProcess',
  'bpmn:ExclusiveGateway': 'exclusiveGateway',
  'bpmn:ParallelGateway': 'parallelGateway',
  'bpmn:InclusiveGateway': 'inclusiveGateway',
  'bpmn:EventBasedGateway': 'eventBasedGateway',
  'bpmn:ComplexGateway': 'complexGateway',
  'bpmn:IntermediateCatchEvent': 'intermediateCatch',
  'bpmn:BoundaryEvent': 'boundaryEvent',
  'bpmn:Transaction': 'subProcess',
  'bpmn:AdHocSubProcess': 'subProcess',
};

function family(type: FlowNodeType): 'event' | 'task' | 'gateway' | 'subprocess' {
  if (type === 'start' || type === 'end' || type === 'intermediateCatch' || type === 'boundaryEvent') return 'event';
  if (
    type === 'exclusiveGateway' ||
    type === 'parallelGateway' ||
    type === 'inclusiveGateway' ||
    type === 'eventBasedGateway' ||
    type === 'complexGateway'
  ) {
    return 'gateway';
  }
  if (type === 'subProcess') return 'subprocess';
  return 'task';
}

/** Same-family type change (Task → User Task, XOR → AND). Does not insert splits. */
export function replaceBpmnType(process: Process, id: string, bpmnType: string): Applied {
  const nextKind = BPMN_TO_KIND[bpmnType];
  if (!nextKind) throw new Error(`cannot replace with ${bpmnType}`);
  return apply(process, (draft) => {
    const node = getNode(draft, id);
    if (family(node.type) !== family(nextKind)) {
      throw new Error(`cannot replace ${node.type} with ${bpmnType}`);
    }
    node.type = nextKind;
    node.bpmnType = bpmnType;
    return id;
  });
}

/** Registry-aware replace: bpmnType + event definition + subprocess flags. */
export function replaceComponent(process: Process, id: string, componentId: string): Applied {
  const def = bpmnComponentRegistry.get(componentId);
  if (!def) throw new Error(`unknown component: ${componentId}`);
  if (def.bpmnType === 'bpmn:SequenceFlow') {
    return setFlowKind(process, id, componentId === 'flow.conditional' ? 'conditional' : componentId === 'flow.default' ? 'default' : 'sequence');
  }
  const nextKind = BPMN_TO_KIND[def.bpmnType];
  if (!nextKind) throw new Error(`cannot replace with ${def.bpmnType}`);
  return apply(process, (draft) => {
    const node = getNode(draft, id);
    if (family(node.type) !== family(nextKind)) {
      throw new Error(`cannot replace ${node.type} with ${def.bpmnType}`);
    }
    node.type = nextKind;
    node.bpmnType = def.bpmnType;
    if (def.eventDefinition) node.eventDefinition = def.eventDefinition;
    else if (family(nextKind) === 'event') delete node.eventDefinition;
    if (nextKind === 'boundaryEvent' || nextKind === 'start') {
      if (def.id.includes('nonInterrupting')) node.cancelActivity = false;
      else delete node.cancelActivity;
    }
    if (def.id === 'activity.eventSubProcess') node.triggeredByEvent = true;
    else if (def.id === 'activity.subProcess' || def.id === 'activity.transaction' || def.id === 'activity.adHocSubProcess') {
      delete node.triggeredByEvent;
    }
    if (def.bpmnType === 'bpmn:CallActivity' && !node.calledElement) {
      /* inspector / create arg sets calledElement */
    }
    if (def.bpmnType !== 'bpmn:CallActivity') delete node.calledElement;
    stripEventDefinitions(node);
    return id;
  });
}

export function setFlowKind(
  process: Process,
  flowId: string,
  kind: 'sequence' | 'conditional' | 'default',
  condition?: string,
): Applied {
  return apply(process, (draft) => {
    const flow = draft.flows.find((f) => f.id === flowId);
    if (!flow) throw new Error(`unknown flow: ${flowId}`);
    for (const other of draft.flows) {
      if (other.source === flow.source) other.isDefault = false;
    }
    if (kind === 'default') {
      flow.isDefault = true;
      flow.condition = undefined;
    } else if (kind === 'conditional') {
      flow.isDefault = false;
      flow.condition = condition ?? flow.condition ?? '';
    } else {
      flow.isDefault = false;
      flow.condition = undefined;
    }
    return flowId;
  });
}

export function setBranchLocked(process: Process, branchId: string, locked: boolean): Applied {
  return apply(process, (draft) => {
    const { branch } = findBranch(draft, branchId);
    if (locked) branch.locked = true;
    else delete branch.locked;
    return branch.id;
  });
}

export function addBranch(process: Process, regionId: string, spec: { name?: string; id?: string } = {}): Applied {
  return apply(process, (draft) => {
    const region = findRegion(draft, regionId);
    const name = spec.name ?? `Branch ${region.branches.length + 1}`;
    const flow = {
      id: nextId(draft, 'SequenceFlow'),
      source: region.split,
      target: region.join,
      name,
    };
    draft.flows.push(flow);
    scopeOf(draft, region.split).flowIds.push(flow.id);
    const branchId = nextId(draft, 'Branch', spec.id);
    region.branches.push({ id: branchId, name, entryFlowId: flow.id, nodeIds: [] });
    return branchId;
  });
}

export function moveAfter(process: Process, nodeId: string, afterId: string, branchId?: string): Applied {
  if (nodeId === afterId) throw new Error('cannot move a node after itself');
  return apply(process, (draft) => {
    const dest = flowAfter(draft, afterId, branchId);
    if (dest.target === nodeId) return nodeId;
    const node = detachLinear(draft, nodeId);
    insertOnFlow(draft, flowAfter(draft, afterId, branchId).id, node);
    return nodeId;
  });
}

export function moveToBranch(
  process: Process,
  nodeId: string,
  branchId: string,
  spec: { after?: string } = {},
): Applied {
  return apply(process, (draft) => {
    findBranch(draft, branchId);
    const afterId = spec.after ?? branchTailAfter(draft, branchId).afterId;
    const dest = flowAfter(draft, afterId, branchId);
    if (dest.target === nodeId) return nodeId;
    const node = detachLinear(draft, nodeId);
    insertOnFlow(draft, flowAfter(draft, afterId, branchId).id, node);
    return nodeId;
  });
}
