import { layoutProcess, type LayoutResult } from '../../layout-engine/src/index.js';
import {
  detectStructure,
  getNode,
  happyPathIds,
  type BpmnPreserve,
  type DefinitionsMeta,
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
  appendExtras,
  applyPreserve,
  applyXmlns,
  createModdle,
  fromPlain,
  idOf,
  isType,
  many,
  readMany,
  refId,
  parseDefinitions,
  registerEl,
  registerTree,
  resolveOf,
  restoreExtensions,
  serializeDefinitions,
  snapshotExtensions,
  snapshotPreserve,
  toPlain,
  xmlnsAttrs,
  type Moddle,
  type ModdleEl,
  type ResolveRef,
} from './moddle.js';

const NODE_SKIP = new Set([
  'id',
  'name',
  'incoming',
  'outgoing',
  'attachedToRef',
  'cancelActivity',
  'triggeredByEvent',
  'extensionElements',
  'default',
  'flowElements',
  'laneSets',
  'lanes',
  'artifacts',
  'childLaneSet',
  'calledElement',
]);
const PROCESS_SKIP = new Set([
  'id',
  'name',
  'flowElements',
  'laneSets',
  'lanes',
  'artifacts',
  'extensionElements',
  'isExecutable',
]);
const FLOW_SKIP = new Set(['id', 'name', 'sourceRef', 'targetRef', 'conditionExpression', 'extensionElements']);

function withPreserve<T extends object>(obj: T, preserve?: BpmnPreserve): T {
  return preserve ? { ...obj, bpmnPreserve: preserve } : obj;
}

const DEFAULT_BPMN: Record<FlowNodeType, string> = {
  start: 'bpmn:StartEvent',
  end: 'bpmn:EndEvent',
  task: 'bpmn:Task',
  subProcess: 'bpmn:SubProcess',
  exclusiveGateway: 'bpmn:ExclusiveGateway',
  parallelGateway: 'bpmn:ParallelGateway',
  inclusiveGateway: 'bpmn:InclusiveGateway',
  eventBasedGateway: 'bpmn:EventBasedGateway',
  complexGateway: 'bpmn:ComplexGateway',
  intermediateCatch: 'bpmn:IntermediateCatchEvent',
  boundaryEvent: 'bpmn:BoundaryEvent',
};

export function idSeqFrom(ids: string[]): Record<string, number> {
  const seq = new Map<string, number>();
  for (const id of ids) {
    const match = id.match(/^(.*)_(\d+)$/);
    if (!match) continue;
    const prefix = match[1]!;
    seq.set(prefix, Math.max(seq.get(prefix) ?? 0, Number(match[2])));
  }
  return Object.fromEntries(seq);
}

function withExt<T extends object>(obj: T, ext?: ExtensionValue[]): T {
  return ext?.length ? { ...obj, extensionElements: ext } : obj;
}

function eventDefinitionName(el: ModdleEl): string | undefined {
  const defs = el.get('eventDefinitions');
  const def = Array.isArray(defs) ? (defs[0] as ModdleEl | undefined) : undefined;
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
  else if (isType(el, 'bpmn:ComplexGateway')) node = { ...base, type: 'complexGateway' };
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
  const called = el.get('calledElement');
  if (typeof called === 'string' && called.trim()) node = { ...node, calledElement: called.trim() };
  return withExt(withPreserve(node, snapshotPreserve(el, NODE_SKIP)), ext);
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
    withPreserve(
      {
        id,
        source,
        target,
        ...(name ? { name } : {}),
        ...(condition ? { condition } : {}),
        ...(defaults.get(source) === id ? { isDefault: true } : {}),
      },
      snapshotPreserve(el, FLOW_SKIP),
    ),
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
    const listed = readMany(laneSet, 'lanes');
    const lanes = listed.length
      ? listed
      : (laneSet.$children ?? []).filter((child) => isType(child, 'bpmn:Lane'));
    for (const lane of lanes) {
      const id = idOf(lane);
      if (!id) continue;
      const name = typeof lane.get('name') === 'string' ? (lane.get('name') as string) : '';
      const nodeIds = readMany(lane, 'flowNodeRef').map(refId).filter(Boolean);
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
      const child = (lane.get('childLaneSet') as ModdleEl | undefined) ?? readMany(lane, 'childLaneSet')[0];
      if (child) walk(child, id);
    }
  };
  for (const set of readMany(processEl, 'laneSets')) walk(set);
  return out;
}

function collectFlowExtras(containerEl: ModdleEl): ExtensionValue[] {
  const extras: ExtensionValue[] = [];
  const flowEls = containerEl.get('flowElements');
  if (Array.isArray(flowEls)) {
    for (const child of flowEls as ModdleEl[]) {
      if (isType(child, 'bpmn:SequenceFlow') || isType(child, 'bpmn:FlowNode')) continue;
      extras.push(toPlain(child));
    }
  }
  const arts = containerEl.get('artifacts');
  if (Array.isArray(arts)) {
    for (const art of arts as ModdleEl[]) extras.push(toPlain(art));
  }
  return extras;
}

function attachExtras(owner: FlowNode | undefined, extras: ExtensionValue[]): void {
  if (!owner || !extras.length) return;
  owner.bpmnPreserve = {
    ...owner.bpmnPreserve,
    props: { ...owner.bpmnPreserve?.props, flowExtras: extras },
  };
}

function extraIds(value: unknown, into: string[] = []): string[] {
  if (!value || typeof value !== 'object') return into;
  if (Array.isArray(value)) {
    for (const item of value) extraIds(item, into);
    return into;
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec.id === 'string') into.push(rec.id);
  if (typeof rec.$ref === 'string') into.push(rec.$ref);
  for (const nested of Object.values(rec)) extraIds(nested, into);
  return into;
}

function mapContainer(
  containerEl: ModdleEl,
  scopeId: string,
  parentScopeId: string | null,
  ownerId: string | null,
  acc: { nodes: FlowNode[]; flows: SequenceFlow[]; scopes: Scope[]; seq: number; artifacts: ExtensionValue[] },
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
  const extras = collectFlowExtras(containerEl);
  if (ownerId) attachExtras(acc.nodes.find((n) => n.id === ownerId), extras);
  else acc.artifacts.push(...extras);
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
  isExecutable?: boolean;
  artifacts?: ExtensionValue[];
  bpmnPreserve?: BpmnPreserve;
  extensionElements?: ExtensionValue[];
} {
  const id = idOf(processEl) || 'Process_1';
  const name = typeof processEl.get('name') === 'string' ? (processEl.get('name') as string) : 'Process';
  const acc = {
    nodes: [] as FlowNode[],
    flows: [] as SequenceFlow[],
    scopes: [] as Scope[],
    seq: 1,
    artifacts: [] as ExtensionValue[],
  };
  mapContainer(processEl, 'Scope_1', null, null, acc);
  acc.flows.sort((a, b) => a.id.localeCompare(b.id));
  const exec = processEl.get('isExecutable');
  return withExt(
    withPreserve(
      {
        id,
        name,
        nodes: acc.nodes,
        flows: acc.flows,
        lanes: mapLanes(processEl, id),
        scopes: acc.scopes,
        ...(typeof exec === 'boolean' ? { isExecutable: exec } : {}),
        ...(acc.artifacts.length ? { artifacts: acc.artifacts } : {}),
      },
      snapshotPreserve(processEl, PROCESS_SKIP),
    ),
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
    definitions?: DefinitionsMeta;
    rootElements?: ExtensionValue[];
    collaborationArtifacts?: ExtensionValue[];
  },
): Process {
  const scopes = mapped.scopes?.length
    ? mapped.scopes
    : [{ id: 'Scope_1', parentId: null, ownerId: null, nodeIds: mapped.nodes.map((n) => n.id), flowIds: mapped.flows.map((f) => f.id) }];
  return detectStructure(
    withExt(
      withPreserve(
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
          ...(typeof mapped.isExecutable === 'boolean' ? { isExecutable: mapped.isExecutable } : {}),
          ...(mapped.artifacts?.length ? { artifacts: mapped.artifacts } : {}),
          ...(extra.definitions ? { definitions: extra.definitions } : {}),
          ...(extra.rootElements?.length ? { rootElements: extra.rootElements } : {}),
          ...(extra.collaborationId ? { collaborationId: extra.collaborationId } : {}),
          ...(extra.collaborationArtifacts?.length ? { collaborationArtifacts: extra.collaborationArtifacts } : {}),
          participants: extra.participants,
          lanes: extra.lanes,
          messageFlows: extra.messageFlows,
          processes: extra.processes,
        },
        mapped.bpmnPreserve,
      ),
      mapped.extensionElements,
    ),
  );
}

function asGraph(p: Process): ProcessGraph {
  return withExt(
    withPreserve(
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
        ...(typeof p.isExecutable === 'boolean' ? { isExecutable: p.isExecutable } : {}),
        ...(p.artifacts?.length ? { artifacts: p.artifacts } : {}),
      },
      p.bpmnPreserve,
    ),
    p.extensionElements,
  );
}

function snapshotDefinitions(definitions: ModdleEl): DefinitionsMeta | undefined {
  const str = (name: string) => {
    const value = definitions.get(name);
    return typeof value === 'string' && value ? value : undefined;
  };
  const meta: DefinitionsMeta = {
    ...(idOf(definitions) ? { id: idOf(definitions) } : {}),
    ...(str('targetNamespace') ? { targetNamespace: str('targetNamespace') } : {}),
    ...(str('exporter') ? { exporter: str('exporter') } : {}),
    ...(str('exporterVersion') ? { exporterVersion: str('exporterVersion') } : {}),
    ...(str('expressionLanguage') ? { expressionLanguage: str('expressionLanguage') } : {}),
    ...(str('typeLanguage') ? { typeLanguage: str('typeLanguage') } : {}),
    ...(xmlnsAttrs(definitions) ? { attrs: xmlnsAttrs(definitions) } : {}),
  };
  return Object.keys(meta).length ? meta : undefined;
}

/** BPMN XML → semantic graph. Ignores DI; coordinates are layout output. */
export async function xmlToProcess(bpmnXml: string): Promise<Process> {
  if (!bpmnXml.trim()) return emptyProcess('Process_1');
  const definitions = await parseDefinitions(bpmnXml);
  const roots = many(definitions, 'rootElements');
  const processEls = roots.filter((el) => isType(el, 'bpmn:Process'));
  const collab = roots.find((el) => isType(el, 'bpmn:Collaboration'));
  const rootElements = roots.filter((el) => !isType(el, 'bpmn:Process') && !isType(el, 'bpmn:Collaboration')).map(toPlain);
  const definitionsMeta = snapshotDefinitions(definitions);

  const participants: Participant[] = [];
  const messageFlows: MessageFlow[] = [];
  let collaborationId: string | undefined;
  let collaborationArtifacts: ExtensionValue[] | undefined;
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
    const collabArts = (collab.get('artifacts') as ModdleEl[] | undefined) ?? [];
    const collabPlain = collabArts.map(toPlain);
    if (collabPlain.length) collaborationArtifacts = collabPlain;
  }

  const extra = {
    definitions: definitionsMeta,
    rootElements,
    collaborationArtifacts,
  };

  if (!processEls.length) {
    if (!participants.length) return emptyProcess('Process_1');
    const ids = [
      collaborationId,
      ...participants.map((p) => p.id),
      ...messageFlows.map((m) => m.id),
      ...extraIds(rootElements),
      ...extraIds(collaborationArtifacts),
    ].filter(Boolean) as string[];
    return detectGraph(
      { id: 'Process_1', name: 'Process', nodes: [], flows: [], lanes: [], scopes: [] },
      {
        idSeq: { ...idSeqFrom(ids), Process: 1, Scope: 1 },
        collaborationId,
        participants,
        lanes: [],
        messageFlows,
        processes: [],
        ...extra,
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
    ...extraIds(rootElements),
    ...extraIds(collaborationArtifacts),
    ...extraIds(rootMapped.artifacts),
    ...extraIds(peersMapped.flatMap((g) => g.artifacts ?? [])),
    ...extraIds(rootMapped.nodes.map((n) => n.bpmnPreserve)),
    ...extraIds(peersMapped.flatMap((g) => g.nodes.map((n) => n.bpmnPreserve))),
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
    ...extra,
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

function createNodeEl(moddle: Moddle, node: FlowNode, resolve: ResolveRef, registry: Map<string, ModdleEl>): ModdleEl {
  const bpmnType = node.bpmnType ?? DEFAULT_BPMN[node.type];
  const attrs: Record<string, unknown> = { id: node.id };
  const name =
    node.type === 'start' || node.type === 'end' ? visibleNodeName(node.type, node.name) : node.name;
  if (name) attrs.name = name;
  if (node.calledElement) attrs.calledElement = node.calledElement;
  if (node.type === 'boundaryEvent' && node.cancelActivity === false) attrs.cancelActivity = false;
  if (node.type === 'subProcess' && node.triggeredByEvent) attrs.triggeredByEvent = true;
  const el = moddle.create(bpmnType, attrs);
  registerEl(registry, el);
  applyPreserve(moddle, el, node.bpmnPreserve, resolve);
  const defs = el.get('eventDefinitions');
  if (!(Array.isArray(defs) && defs.length) && node.eventDefinition) {
    const created = many(el, 'eventDefinitions');
    created.push(moddle.create(`bpmn:${node.eventDefinition}`));
    el.set('eventDefinitions', created);
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
  const ids = new Set(ofProcess.map((l) => l.id));
  const roots = ofProcess.filter((l) => !l.parentLaneId || !ids.has(l.parentLaneId));
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
    isExecutable?: boolean;
    artifacts?: ExtensionValue[];
    extensionElements?: ExtensionValue[];
    bpmnPreserve?: BpmnPreserve;
  },
  lanes: Lane[],
  nodes: FlowNode[],
  laneEls: Map<string, ModdleEl>,
  resolve: ResolveRef,
  registry: Map<string, ModdleEl>,
): { processEl: ModdleEl; nodeEls: Map<string, ModdleEl>; flowEls: Map<string, ModdleEl>; flows: SequenceFlow[] } {
  const processEl = moddle.create('bpmn:Process', {
    id: graph.id,
    name: graph.name,
    isExecutable: graph.isExecutable ?? false,
  });
  registerEl(registry, processEl);
  applyPreserve(moddle, processEl, graph.bpmnPreserve, resolve);
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
      const el = createNodeEl(moddle, node, resolve, registry);
      nodeEls.set(node.id, el);
      flowElements.push(el);
      if (node.type === 'subProcess') {
        const inner = scopes.find((s) => s.ownerId === node.id);
        if (inner) writeScope(el, inner);
        const extras = node.bpmnPreserve?.props?.flowExtras;
        if (Array.isArray(extras)) appendExtras(moddle, el, extras as ExtensionValue[], resolve, registry);
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
      registerEl(registry, flowEl);
      if (flow.condition) {
        flowEl.set('conditionExpression', moddle.create('bpmn:FormalExpression', { body: flow.condition }));
      }
      applyPreserve(moddle, flowEl, flow.bpmnPreserve, resolve);
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
  appendExtras(moddle, processEl, graph.artifacts, resolve, registry);
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
  const registry = new Map<string, ModdleEl>();
  const resolve = resolveOf(registry);
  const definitions = moddle.create('bpmn:Definitions', {
    id: process.definitions?.id ?? `Definitions_${process.id}`,
    targetNamespace: process.definitions?.targetNamespace ?? 'http://bpmn.io/schema/bpmn',
    ...(process.definitions?.exporter ? { exporter: process.definitions.exporter } : {}),
    ...(process.definitions?.exporterVersion ? { exporterVersion: process.definitions.exporterVersion } : {}),
    ...(process.definitions?.expressionLanguage ? { expressionLanguage: process.definitions.expressionLanguage } : {}),
    ...(process.definitions?.typeLanguage ? { typeLanguage: process.definitions.typeLanguage } : {}),
  });
  applyXmlns(definitions, process.definitions?.attrs);
  registerEl(registry, definitions);
  const participants = process.participants ?? [];
  const lanes = process.lanes ?? [];
  const messageFlows = process.messageFlows ?? [];
  const peers = process.processes ?? [];
  const hasCollab = participants.length > 0;

  for (const item of process.rootElements ?? []) {
    const el = fromPlain(moddle, item, resolve);
    registerTree(registry, el);
    many(definitions, 'rootElements').push(el);
  }

  const collabEl = hasCollab
    ? moddle.create('bpmn:Collaboration', { id: process.collaborationId ?? `Collaboration_${process.id}` })
    : undefined;
  if (collabEl) {
    registerEl(registry, collabEl);
    many(definitions, 'rootElements').push(collabEl);
  }

  const laneEls = new Map<string, ModdleEl>();
  const rootNodes = orderedNodes(process);
  const root = writeGraph(moddle, process, lanes, rootNodes, laneEls, resolve, registry);
  many(definitions, 'rootElements').push(root.processEl);
  const nodeEls = new Map(root.nodeEls);
  const flowEls = new Map(root.flowEls);
  const allNodes = [...rootNodes];
  const allFlows = [...root.flows];
  const processEls = new Map<string, ModdleEl>([[process.id, root.processEl]]);

  for (const peer of peers) {
    const peerNodes = [...peer.nodes].sort((a, b) => a.id.localeCompare(b.id));
    const written = writeGraph(moddle, peer, lanes, peerNodes, laneEls, resolve, registry);
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
      registerEl(registry, el);
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
      registerEl(registry, el);
      applyExt(moddle, el, mf.extensionElements);
      many(collabEl, 'messageFlows').push(el);
      flowEls.set(mf.id, el);
    }
    appendExtras(moddle, collabEl, process.collaborationArtifacts, resolve, registry);
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

  const extraEls = [
    ...(process.artifacts ?? []),
    ...(process.collaborationArtifacts ?? []),
    ...peers.flatMap((g) => g.artifacts ?? []),
  ];
  for (const item of extraEls) {
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) continue;
    const el = registry.get(id);
    if (!el) continue;
    const type = String(item.$type ?? '');
    if (type.endsWith(':Association')) pushEdge(moddle, planeElement, di, id, el);
    else pushShape(moddle, planeElement, di, id, el);
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
  const shapes = new Map<string, LayoutResult['shapes'][string]>();
  const edges = new Map<string, LayoutResult['edges'][string]>();
  const labels = new Map<string, LayoutResult['labels'][string]>();
  for (const el of plane ? many(plane, 'planeElement') : []) {
    const bpmnId = idOf(el.get('bpmnElement'));
    if (!bpmnId) continue;
    if (isType(el, 'bpmndi:BPMNShape')) {
      const box = el.get('bounds') as ModdleEl | undefined;
      if (!box) continue;
      shapes.set(bpmnId, {
        x: Number(box.get('x')),
        y: Number(box.get('y')),
        width: Number(box.get('width')),
        height: Number(box.get('height')),
      });
    } else if (isType(el, 'bpmndi:BPMNEdge')) {
      edges.set(bpmnId, many(el, 'waypoint').map((p) => ({ x: Number(p.get('x')), y: Number(p.get('y')) })));
    }
    const labelBox = (el.get('label') as ModdleEl | undefined)?.get('bounds') as ModdleEl | undefined;
    if (labelBox) {
      labels.set(bpmnId, {
        x: Number(labelBox.get('x')),
        y: Number(labelBox.get('y')),
        width: Number(labelBox.get('width')),
        height: Number(labelBox.get('height')),
      });
    }
  }
  const sort = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  return { shapes: sort(Object.fromEntries(shapes)), edges: sort(Object.fromEntries(edges)), labels: sort(Object.fromEntries(labels)) };
}
