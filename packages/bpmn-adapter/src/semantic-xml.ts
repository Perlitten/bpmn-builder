import { layoutProcess, type LayoutResult } from '../../layout-engine/src/index.js';
import {
  detectStructure,
  getNode,
  happyPathIds,
  type ExtensionValue,
  type FlowNode,
  type FlowNodeType,
  type Lane,
  type MessageFlow,
  type Participant,
  type Process,
  type ProcessGraph,
  type Scope,
  type SequenceFlow,
  visibleNodeName,
} from '../../semantic-core/src/index.js';
import {
  createModdle,
  idOf,
  isType,
  many,
  parseDefinitions,
  restoreExtensions,
  serializeDefinitions,
  snapshotExtensions,
  type Moddle,
  type ModdleEl,
} from './moddle.js';

const DEFAULT_BPMN: Record<FlowNodeType, string> = {
  start: 'bpmn:StartEvent',
  end: 'bpmn:EndEvent',
  task: 'bpmn:Task',
  subProcess: 'bpmn:SubProcess',
  exclusiveGateway: 'bpmn:ExclusiveGateway',
  parallelGateway: 'bpmn:ParallelGateway',
  inclusiveGateway: 'bpmn:InclusiveGateway',
  eventBasedGateway: 'bpmn:EventBasedGateway',
  intermediateCatch: 'bpmn:IntermediateCatchEvent',
  boundaryEvent: 'bpmn:BoundaryEvent',
};

export function idSeqFrom(ids: string[]): Record<string, number> {
  const seq: Record<string, number> = {};
  for (const id of ids) {
    const match = id.match(/^(.*)_(\d+)$/);
    if (!match) continue;
    const prefix = match[1]!;
    seq[prefix] = Math.max(seq[prefix] ?? 0, Number(match[2]));
  }
  return seq;
}

function withExt<T extends object>(obj: T, ext?: ExtensionValue[]): T {
  return ext?.length ? { ...obj, extensionElements: ext } : obj;
}

function eventDefinitionName(el: ModdleEl): string | undefined {
  const def = many(el, 'eventDefinitions')[0];
  if (!def?.$type) return undefined;
  return def.$type.replace(/^bpmn:/, '');
}

function mapNode(el: ModdleEl): FlowNode | null {
  const id = idOf(el);
  if (!id || !isType(el, 'bpmn:FlowNode')) return null;
  const name = typeof el.get('name') === 'string' ? (el.get('name') as string) : (el.name ?? '');
  const ext = snapshotExtensions(el);
  const bpmnType = el.$type;
  const eventDefinition = eventDefinitionName(el);

  const base = { id, name, bpmnType, ...(eventDefinition ? { eventDefinition } : {}) };

  let node: FlowNode;
  if (isType(el, 'bpmn:StartEvent')) node = { ...base, type: 'start' };
  else if (isType(el, 'bpmn:EndEvent')) node = { ...base, type: 'end' };
  else if (isType(el, 'bpmn:ExclusiveGateway')) node = { ...base, type: 'exclusiveGateway' };
  else if (isType(el, 'bpmn:ParallelGateway')) node = { ...base, type: 'parallelGateway' };
  else if (isType(el, 'bpmn:InclusiveGateway')) node = { ...base, type: 'inclusiveGateway' };
  else if (isType(el, 'bpmn:EventBasedGateway')) node = { ...base, type: 'eventBasedGateway' };
  else if (isType(el, 'bpmn:IntermediateCatchEvent')) node = { ...base, type: 'intermediateCatch' };
  else if (isType(el, 'bpmn:BoundaryEvent')) {
    const attachedTo = idOf(el.get('attachedToRef'));
    const cancelActivity = el.get('cancelActivity');
    node = {
      ...base,
      type: 'boundaryEvent',
      ...(attachedTo ? { attachedTo } : {}),
      ...(cancelActivity === false ? { cancelActivity: false } : {}),
    };
  } else if (isType(el, 'bpmn:SubProcess')) {
    node = {
      ...base,
      type: 'subProcess',
      ...(el.get('triggeredByEvent') === true ? { triggeredByEvent: true } : {}),
    };
  } else node = { ...base, type: 'task' };

  if (node.type === 'start' || node.type === 'end') {
    node = { ...node, name: visibleNodeName(node.type, node.name) };
  }
  return withExt(node, ext);
}

function mapFlow(el: ModdleEl, defaults: Map<string, string>): SequenceFlow | null {
  const id = idOf(el);
  const source = idOf(el.get('sourceRef'));
  const target = idOf(el.get('targetRef'));
  if (!id || !source || !target) return null;
  const name = typeof el.get('name') === 'string' ? (el.get('name') as string) : undefined;
  const expr = el.get('conditionExpression') as ModdleEl | undefined;
  const condition = expr ? String(expr.get('body') ?? expr.$body ?? '') : '';
  return withExt(
    {
      id,
      source,
      target,
      ...(name ? { name } : {}),
      ...(condition ? { condition } : {}),
      ...(defaults.get(source) === id ? { isDefault: true } : {}),
    },
    snapshotExtensions(el),
  );
}

function emptyProcess(id: string): Process {
  return detectStructure({
    id,
    name: 'Process',
    rootScopeId: 'Scope_1',
    idSeq: { Process: 1, Scope: 1 },
    scopes: [{ id: 'Scope_1', parentId: null, ownerId: null, nodeIds: [], flowIds: [] }],
    nodes: [],
    flows: [],
    regions: [],
    unstructured: [],
    feedback: [],
    exceptionBranches: [],
    participants: [],
    lanes: [],
    messageFlows: [],
    processes: [],
  });
}

function mapLanes(processEl: ModdleEl, processId: string, participantId?: string): Lane[] {
  const out: Lane[] = [];
  const walk = (laneSet: ModdleEl, parentLaneId?: string) => {
    for (const lane of many(laneSet, 'lanes')) {
      const id = idOf(lane);
      if (!id) continue;
      const name = typeof lane.get('name') === 'string' ? (lane.get('name') as string) : '';
      const nodeIds = many(lane, 'flowNodeRef').map(idOf).filter(Boolean);
      out.push(
        withExt(
          {
            id,
            name,
            processId,
            nodeIds,
            ...(participantId ? { participantId } : {}),
            ...(parentLaneId ? { parentLaneId } : {}),
          },
          snapshotExtensions(lane),
        ),
      );
      const child = lane.get('childLaneSet') as ModdleEl | undefined;
      if (child) walk(child, id);
    }
  };
  for (const set of many(processEl, 'laneSets')) walk(set);
  return out;
}

function mapContainer(
  containerEl: ModdleEl,
  scopeId: string,
  parentScopeId: string | null,
  ownerId: string | null,
  acc: { nodes: FlowNode[]; flows: SequenceFlow[]; scopes: Scope[]; seq: number },
): void {
  const nodeIds: string[] = [];
  const flowIds: string[] = [];
  const defaults = new Map<string, string>();
  const nested: ModdleEl[] = [];
  for (const child of many(containerEl, 'flowElements')) {
    if (isType(child, 'bpmn:SequenceFlow')) continue;
    const node = mapNode(child);
    if (!node) continue;
    acc.nodes.push(node);
    nodeIds.push(node.id);
    const def = idOf(child.get('default'));
    if (def) defaults.set(node.id, def);
    if (isType(child, 'bpmn:SubProcess')) nested.push(child);
  }
  for (const child of many(containerEl, 'flowElements')) {
    if (!isType(child, 'bpmn:SequenceFlow')) continue;
    const flow = mapFlow(child, defaults);
    if (flow) {
      acc.flows.push(flow);
      flowIds.push(flow.id);
    }
  }
  acc.scopes.push({ id: scopeId, parentId: parentScopeId, ownerId, nodeIds, flowIds });
  for (const sub of nested) {
    acc.seq += 1;
    mapContainer(sub, `Scope_${acc.seq}`, scopeId, idOf(sub), acc);
  }
}

function mapProcessEl(processEl: ModdleEl): {
  id: string;
  name: string;
  nodes: FlowNode[];
  flows: SequenceFlow[];
  lanes: Lane[];
  scopes: Scope[];
  extensionElements?: ExtensionValue[];
} {
  const id = idOf(processEl) || 'Process_1';
  const name = typeof processEl.get('name') === 'string' ? (processEl.get('name') as string) : 'Process';
  const acc = { nodes: [] as FlowNode[], flows: [] as SequenceFlow[], scopes: [] as Scope[], seq: 1 };
  mapContainer(processEl, 'Scope_1', null, null, acc);
  acc.flows.sort((a, b) => a.id.localeCompare(b.id));
  return withExt(
    { id, name, nodes: acc.nodes, flows: acc.flows, lanes: mapLanes(processEl, id), scopes: acc.scopes },
    snapshotExtensions(processEl),
  );
}

function detectGraph(
  mapped: ReturnType<typeof mapProcessEl>,
  extra: {
    idSeq: Record<string, number>;
    collaborationId?: string;
    participants: Participant[];
    lanes: Lane[];
    messageFlows: MessageFlow[];
    processes: ProcessGraph[];
  },
): Process {
  const scopes = mapped.scopes?.length
    ? mapped.scopes
    : [{ id: 'Scope_1', parentId: null, ownerId: null, nodeIds: mapped.nodes.map((n) => n.id), flowIds: mapped.flows.map((f) => f.id) }];
  return detectStructure(
    withExt(
      {
        id: mapped.id,
        name: mapped.name,
        rootScopeId: scopes[0]?.id ?? 'Scope_1',
        idSeq: extra.idSeq,
        scopes,
        nodes: mapped.nodes,
        flows: mapped.flows,
        regions: [],
        unstructured: [],
        feedback: [],
        exceptionBranches: [],
        ...(extra.collaborationId ? { collaborationId: extra.collaborationId } : {}),
        participants: extra.participants,
        lanes: extra.lanes,
        messageFlows: extra.messageFlows,
        processes: extra.processes,
      },
      mapped.extensionElements,
    ),
  );
}

function asGraph(p: Process): ProcessGraph {
  return withExt(
    {
      id: p.id,
      name: p.name,
      rootScopeId: p.rootScopeId,
      scopes: p.scopes,
      nodes: p.nodes,
      flows: p.flows,
      regions: p.regions,
      unstructured: p.unstructured,
      feedback: p.feedback,
      exceptionBranches: p.exceptionBranches,
    },
    p.extensionElements,
  );
}

/** BPMN XML → semantic graph. Ignores DI; coordinates are layout output. */
export async function xmlToProcess(bpmnXml: string): Promise<Process> {
  if (!bpmnXml.trim()) return emptyProcess('Process_1');
  const definitions = await parseDefinitions(bpmnXml);
  const roots = many(definitions, 'rootElements');
  const processEls = roots.filter((el) => isType(el, 'bpmn:Process'));
  const collab = roots.find((el) => isType(el, 'bpmn:Collaboration'));

  const participants: Participant[] = [];
  const messageFlows: MessageFlow[] = [];
  let collaborationId: string | undefined;
  if (collab) {
    collaborationId = idOf(collab) || undefined;
    for (const part of many(collab, 'participants')) {
      const id = idOf(part);
      if (!id) continue;
      const name = typeof part.get('name') === 'string' ? (part.get('name') as string) : '';
      const processId = idOf(part.get('processRef')) || undefined;
      participants.push(
        withExt({ id, name, ...(processId ? { processId } : {}) }, snapshotExtensions(part)),
      );
    }
    for (const mf of many(collab, 'messageFlows')) {
      const id = idOf(mf);
      const source = idOf(mf.get('sourceRef'));
      const target = idOf(mf.get('targetRef'));
      if (!id || !source || !target) continue;
      const name = typeof mf.get('name') === 'string' ? (mf.get('name') as string) : undefined;
      messageFlows.push(withExt({ id, source, target, ...(name ? { name } : {}) }, snapshotExtensions(mf)));
    }
  }

  if (!processEls.length) {
    if (!participants.length) return emptyProcess('Process_1');
    const ids = [collaborationId, ...participants.map((p) => p.id), ...messageFlows.map((m) => m.id)].filter(
      Boolean,
    ) as string[];
    return detectGraph(
      { id: 'Process_1', name: 'Process', nodes: [], flows: [], lanes: [], scopes: [] },
      {
        idSeq: { ...idSeqFrom(ids), Process: 1, Scope: 1 },
        collaborationId,
        participants,
        lanes: [],
        messageFlows,
        processes: [],
      },
    );
  }

  const preferredId = participants.find((p) => p.processId)?.processId;
  const rootEl =
    (preferredId ? processEls.find((el) => idOf(el) === preferredId) : undefined) ?? processEls[0]!;
  const mapped = processEls.map(mapProcessEl);
  const rootMapped = mapped.find((g) => g.id === idOf(rootEl)) ?? mapped[0]!;
  const peersMapped = mapped.filter((g) => g.id !== rootMapped.id);

  for (const lane of [...rootMapped.lanes, ...peersMapped.flatMap((g) => g.lanes)]) {
    const owner = participants.find((p) => p.processId === lane.processId);
    if (owner && !lane.participantId) lane.participantId = owner.id;
  }

  const ids = [
    rootMapped.id,
    collaborationId,
    ...rootMapped.nodes.map((n) => n.id),
    ...rootMapped.flows.map((f) => f.id),
    ...peersMapped.flatMap((g) => [g.id, ...g.nodes.map((n) => n.id), ...g.flows.map((f) => f.id)]),
    ...participants.map((p) => p.id),
    ...rootMapped.lanes.map((l) => l.id),
    ...peersMapped.flatMap((g) => g.lanes.map((l) => l.id)),
    ...messageFlows.map((m) => m.id),
    ...rootMapped.scopes.map((s) => s.id),
    ...peersMapped.flatMap((g) => g.scopes.map((s) => s.id)),
    'Scope_1',
  ].filter((id): id is string => !!id);

  const processes: ProcessGraph[] = peersMapped.map((peer) =>
    asGraph(
      detectGraph(peer, {
        idSeq: idSeqFrom(ids),
        participants: [],
        lanes: [],
        messageFlows: [],
        processes: [],
      }),
    ),
  );

  return detectGraph(rootMapped, {
    idSeq: idSeqFrom(ids),
    collaborationId,
    participants,
    lanes: [...rootMapped.lanes, ...peersMapped.flatMap((g) => g.lanes)],
    messageFlows,
    processes,
  });
}

function orderedNodes(process: Process): FlowNode[] {
  try {
    const path = happyPathIds(process);
    const seen = new Set(path);
    return [
      ...path.map((id) => getNode(process, id)),
      ...process.nodes.filter((node) => !seen.has(node.id)).sort((a, b) => a.id.localeCompare(b.id)),
    ];
  } catch {
    return [...process.nodes].sort((a, b) => a.id.localeCompare(b.id));
  }
}

function applyExt(moddle: Moddle, el: ModdleEl, values?: ExtensionValue[]): void {
  if (values?.length) el.set('extensionElements', restoreExtensions(moddle, values));
}

function createNodeEl(moddle: Moddle, node: FlowNode): ModdleEl {
  const bpmnType = node.bpmnType ?? DEFAULT_BPMN[node.type];
  const attrs: Record<string, unknown> = { id: node.id };
  const name =
    node.type === 'start' || node.type === 'end' ? visibleNodeName(node.type, node.name) : node.name;
  if (name) attrs.name = name;
  if (node.type === 'boundaryEvent' && node.cancelActivity === false) attrs.cancelActivity = false;
  if (node.type === 'subProcess' && node.triggeredByEvent) attrs.triggeredByEvent = true;
  const el = moddle.create(bpmnType, attrs);
  if (node.eventDefinition) {
    const defs = many(el, 'eventDefinitions');
    defs.push(moddle.create(`bpmn:${node.eventDefinition}`));
    el.set('eventDefinitions', defs);
  }
  applyExt(moddle, el, node.extensionElements);
  return el;
}

function writeLaneSets(
  moddle: Moddle,
  processEl: ModdleEl,
  lanes: Lane[],
  processId: string,
  nodeEls: Map<string, ModdleEl>,
  laneEls: Map<string, ModdleEl>,
): void {
  const ofProcess = lanes.filter((l) => l.processId === processId);
  const roots = ofProcess.filter((l) => !l.parentLaneId);
  if (!roots.length) return;
  const writeLane = (lane: Lane): ModdleEl => {
    const el = moddle.create('bpmn:Lane', { id: lane.id, ...(lane.name ? { name: lane.name } : {}) });
    const refs = lane.nodeIds.map((id) => nodeEls.get(id)).filter((n): n is ModdleEl => !!n);
    if (refs.length) el.set('flowNodeRef', refs);
    applyExt(moddle, el, lane.extensionElements);
    const children = ofProcess.filter((l) => l.parentLaneId === lane.id);
    if (children.length) {
      const childSet = moddle.create('bpmn:LaneSet', { id: `LaneSet_${lane.id}` });
      childSet.set('lanes', children.map(writeLane));
      el.set('childLaneSet', childSet);
    }
    laneEls.set(lane.id, el);
    return el;
  };
  const laneSet = moddle.create('bpmn:LaneSet', { id: `LaneSet_${processId}` });
  laneSet.set('lanes', roots.map(writeLane));
  processEl.set('laneSets', [laneSet]);
}

function writeGraph(
  moddle: Moddle,
  graph: {
    id: string;
    name: string;
    nodes: FlowNode[];
    flows: SequenceFlow[];
    scopes?: Scope[];
    extensionElements?: ExtensionValue[];
  },
  lanes: Lane[],
  nodes: FlowNode[],
  laneEls: Map<string, ModdleEl>,
): { processEl: ModdleEl; nodeEls: Map<string, ModdleEl>; flowEls: Map<string, ModdleEl>; flows: SequenceFlow[] } {
  const processEl = moddle.create('bpmn:Process', {
    id: graph.id,
    name: graph.name,
    isExecutable: false,
  });
  applyExt(moddle, processEl, graph.extensionElements);
  const nodeEls = new Map<string, ModdleEl>();
  const flowEls = new Map<string, ModdleEl>();
  const flows = [...graph.flows].sort((a, b) => a.id.localeCompare(b.id));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const scopes = graph.scopes?.length
    ? graph.scopes
    : [{ id: 'Scope_1', parentId: null, ownerId: null, nodeIds: nodes.map((n) => n.id), flowIds: flows.map((f) => f.id) }];
  const root = scopes.find((s) => s.ownerId == null && s.parentId == null) ?? scopes[0]!;

  const writeScope = (containerEl: ModdleEl, scope: Scope): void => {
    const flowElements = many(containerEl, 'flowElements');
    const local = scope.nodeIds.map((id) => nodeById.get(id)).filter((n): n is FlowNode => !!n);
    for (const node of local) {
      const el = createNodeEl(moddle, node);
      nodeEls.set(node.id, el);
      flowElements.push(el);
      if (node.type === 'subProcess') {
        const inner = scopes.find((s) => s.ownerId === node.id);
        if (inner) writeScope(el, inner);
      }
    }
    for (const node of local) {
      if (node.type !== 'boundaryEvent' || !node.attachedTo) continue;
      const el = nodeEls.get(node.id);
      const host = nodeEls.get(node.attachedTo);
      if (el && host) el.set('attachedToRef', host);
    }
    const localFlows = flows.filter((f) => scope.flowIds.includes(f.id));
    for (const flow of localFlows) {
      const source = nodeEls.get(flow.source);
      const target = nodeEls.get(flow.target);
      if (!source || !target) continue;
      const attrs: Record<string, unknown> = { id: flow.id, sourceRef: source, targetRef: target };
      if (flow.name) attrs.name = flow.name;
      const flowEl = moddle.create('bpmn:SequenceFlow', attrs);
      if (flow.condition) {
        flowEl.set('conditionExpression', moddle.create('bpmn:FormalExpression', { body: flow.condition }));
      }
      applyExt(moddle, flowEl, flow.extensionElements);
      many(source, 'outgoing').push(flowEl);
      many(target, 'incoming').push(flowEl);
      flowElements.push(flowEl);
      flowEls.set(flow.id, flowEl);
    }
    for (const node of local) {
      const def = graph.flows.find((f) => f.source === node.id && f.isDefault);
      const el = nodeEls.get(node.id);
      const flowEl = def ? flowEls.get(def.id) : undefined;
      if (el && flowEl) el.set('default', flowEl);
    }
  };

  writeScope(processEl, root);
  writeLaneSets(moddle, processEl, lanes, graph.id, nodeEls, laneEls);
  return { processEl, nodeEls, flowEls, flows };
}

function pushShape(
  moddle: Moddle,
  planeElement: ModdleEl[],
  di: LayoutResult,
  id: string,
  bpmnEl: ModdleEl,
  extra: Record<string, unknown> = {},
): void {
  const box = di.shapes[id];
  if (!box) return;
  const label = diLabel(moddle, di.labels[id]);
  planeElement.push(
    moddle.create('bpmndi:BPMNShape', {
      id: `${id}_di`,
      bpmnElement: bpmnEl,
      bounds: moddle.create('dc:Bounds', { x: box.x, y: box.y, width: box.width, height: box.height }),
      ...(label ? { label } : {}),
      ...extra,
    }),
  );
}

function pushEdge(moddle: Moddle, planeElement: ModdleEl[], di: LayoutResult, id: string, bpmnEl: ModdleEl): void {
  const points = di.edges[id];
  if (!points?.length) return;
  const label = diLabel(moddle, di.labels[id]);
  planeElement.push(
    moddle.create('bpmndi:BPMNEdge', {
      id: `${id}_di`,
      bpmnElement: bpmnEl,
      waypoint: points.map((p) => moddle.create('dc:Point', { x: p.x, y: p.y })),
      ...(label ? { label } : {}),
    }),
  );
}

function diLabel(moddle: Moddle, box: LayoutResult['labels'][string] | undefined): ModdleEl | undefined {
  if (!box) return undefined;
  return moddle.create('bpmndi:BPMNLabel', {
    bounds: moddle.create('dc:Bounds', { x: box.x, y: box.y, width: box.width, height: box.height }),
  });
}

/** Semantic graph + layout DI → BPMN 2.0 XML via bpmn-moddle. */
export function processToXml(process: Process, di: LayoutResult): string {
  const moddle = createModdle();
  const definitions = moddle.create('bpmn:Definitions', {
    id: `Definitions_${process.id}`,
    targetNamespace: 'http://bpmn.io/schema/bpmn',
  });
  const participants = process.participants ?? [];
  const lanes = process.lanes ?? [];
  const messageFlows = process.messageFlows ?? [];
  const peers = process.processes ?? [];
  const hasCollab = participants.length > 0;

  const collabEl = hasCollab
    ? moddle.create('bpmn:Collaboration', { id: process.collaborationId ?? `Collaboration_${process.id}` })
    : undefined;
  if (collabEl) many(definitions, 'rootElements').push(collabEl);

  const laneEls = new Map<string, ModdleEl>();
  const rootNodes = orderedNodes(process);
  const root = writeGraph(moddle, process, lanes, rootNodes, laneEls);
  many(definitions, 'rootElements').push(root.processEl);
  const nodeEls = new Map(root.nodeEls);
  const flowEls = new Map(root.flowEls);
  const allNodes = [...rootNodes];
  const allFlows = [...root.flows];
  const processEls = new Map<string, ModdleEl>([[process.id, root.processEl]]);

  for (const peer of peers) {
    const peerNodes = [...peer.nodes].sort((a, b) => a.id.localeCompare(b.id));
    const written = writeGraph(moddle, peer, lanes, peerNodes, laneEls);
    many(definitions, 'rootElements').push(written.processEl);
    processEls.set(peer.id, written.processEl);
    for (const [id, el] of written.nodeEls) nodeEls.set(id, el);
    for (const [id, el] of written.flowEls) flowEls.set(id, el);
    allNodes.push(...peerNodes);
    allFlows.push(...written.flows);
  }

  const partEls = new Map<string, ModdleEl>();
  if (collabEl) {
    for (const part of participants) {
      const attrs: Record<string, unknown> = { id: part.id };
      if (part.name) attrs.name = part.name;
      const el = moddle.create('bpmn:Participant', attrs);
      applyExt(moddle, el, part.extensionElements);
      const proc = part.processId ? processEls.get(part.processId) : undefined;
      if (proc) el.set('processRef', proc);
      partEls.set(part.id, el);
      many(collabEl, 'participants').push(el);
    }
    for (const mf of messageFlows) {
      const source = partEls.get(mf.source) ?? nodeEls.get(mf.source);
      const target = partEls.get(mf.target) ?? nodeEls.get(mf.target);
      if (!source || !target) continue;
      const attrs: Record<string, unknown> = { id: mf.id, sourceRef: source, targetRef: target };
      if (mf.name) attrs.name = mf.name;
      const el = moddle.create('bpmn:MessageFlow', attrs);
      applyExt(moddle, el, mf.extensionElements);
      many(collabEl, 'messageFlows').push(el);
      flowEls.set(mf.id, el);
    }
  }

  const diagram = moddle.create('bpmndi:BPMNDiagram', { id: 'BPMNDiagram_1' });
  const plane = moddle.create('bpmndi:BPMNPlane', {
    id: 'BPMNPlane_1',
    bpmnElement: collabEl ?? root.processEl,
  });
  diagram.set('plane', plane);
  many(definitions, 'diagrams').push(diagram);
  const planeElement = many(plane, 'planeElement');

  for (const part of participants) {
    const el = partEls.get(part.id);
    if (el) pushShape(moddle, planeElement, di, part.id, el, { isHorizontal: true });
  }
  for (const lane of lanes) {
    const el = laneEls.get(lane.id);
    if (el) pushShape(moddle, planeElement, di, lane.id, el, { isHorizontal: true });
  }
  for (const node of allNodes) {
    const bpmnEl = nodeEls.get(node.id);
    if (!bpmnEl) continue;
    const extra = {
      ...((node.bpmnType ?? DEFAULT_BPMN[node.type]) === 'bpmn:ExclusiveGateway' ? { isMarkerVisible: true } : {}),
      ...(node.type === 'subProcess' ? { isExpanded: true } : {}),
    };
    pushShape(moddle, planeElement, di, node.id, bpmnEl, extra);
  }
  for (const flow of allFlows) {
    const flowEl = flowEls.get(flow.id);
    if (flowEl) pushEdge(moddle, planeElement, di, flow.id, flowEl);
  }
  for (const mf of messageFlows) {
    const el = flowEls.get(mf.id);
    if (el) pushEdge(moddle, planeElement, di, mf.id, el);
  }

  return serializeDefinitions(definitions);
}

/** Layout then serialize. Same graph ⇒ byte-identical XML. */
export function exportProcessXml(process: Process): string {
  return processToXml(process, layoutProcess(process));
}

export async function readDiFromXml(xml: string): Promise<LayoutResult> {
  const definitions = await parseDefinitions(xml);
  const plane = many(definitions, 'diagrams')[0]?.get('plane') as ModdleEl | undefined;
  const shapes: LayoutResult['shapes'] = {};
  const edges: LayoutResult['edges'] = {};
  const labels: LayoutResult['labels'] = {};
  for (const el of plane ? many(plane, 'planeElement') : []) {
    const bpmnId = idOf(el.get('bpmnElement'));
    if (!bpmnId) continue;
    if (isType(el, 'bpmndi:BPMNShape')) {
      const box = el.get('bounds') as ModdleEl | undefined;
      if (!box) continue;
      shapes[bpmnId] = {
        x: Number(box.get('x')),
        y: Number(box.get('y')),
        width: Number(box.get('width')),
        height: Number(box.get('height')),
      };
    } else if (isType(el, 'bpmndi:BPMNEdge')) {
      edges[bpmnId] = many(el, 'waypoint').map((p) => ({ x: Number(p.get('x')), y: Number(p.get('y')) }));
    }
    const labelBox = (el.get('label') as ModdleEl | undefined)?.get('bounds') as ModdleEl | undefined;
    if (labelBox) {
      labels[bpmnId] = {
        x: Number(labelBox.get('x')),
        y: Number(labelBox.get('y')),
        width: Number(labelBox.get('width')),
        height: Number(labelBox.get('height')),
      };
    }
  }
  const sort = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  return { shapes: sort(shapes), edges: sort(edges), labels: sort(labels) };
}
