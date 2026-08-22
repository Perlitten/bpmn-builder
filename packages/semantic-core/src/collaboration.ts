import { rebuildStructure } from './detect.js';
import { getNode } from './graph.js';
import { nextId } from './ids.js';
import { DEFAULT_BPMN_TYPE } from './types.js';
import type { Applied, FlowNode, Lane, Participant, SemanticProcess, ProcessGraph, SequenceFlow } from './types.js';

function apply(prev: SemanticProcess, fn: (draft: SemanticProcess) => string): Applied {
  const draft = structuredClone(prev);
  draft.participants ??= [];
  draft.lanes ??= [];
  draft.messageFlows ??= [];
  draft.processes ??= [];
  const id = fn(draft);
  rebuildStructure(draft);
  return { process: draft, inverse: () => structuredClone(prev), id };
}

function emptyPeerGraph(draft: SemanticProcess, name: string): ProcessGraph {
  const id = nextId(draft, 'Process');
  const scopeId = nextId(draft, 'Scope');
  return {
    id,
    name,
    rootScopeId: scopeId,
    scopes: [{ id: scopeId, parentId: null, ownerId: null, nodeIds: [], flowIds: [] }],
    nodes: [],
    flows: [],
    regions: [],
    unstructured: [],
    feedback: [],
    exceptionBranches: [],
  };
}

function ensureHostPool(draft: SemanticProcess): Participant {
  const existing = draft.participants.find((p) => p.processId === draft.id);
  if (existing) return existing;
  if (!draft.collaborationId) draft.collaborationId = nextId(draft, 'Collaboration');
  const host: Participant = {
    id: nextId(draft, 'Participant'),
    name: draft.name || 'Pool',
    processId: draft.id,
  };
  draft.participants.unshift(host);
  return host;
}

function asGraph(source: SemanticProcess | ProcessGraph): ProcessGraph {
  return {
    id: source.id,
    name: source.name,
    rootScopeId: source.rootScopeId,
    scopes: source.scopes,
    nodes: source.nodes,
    flows: source.flows,
    regions: source.regions,
    unstructured: source.unstructured,
    feedback: source.feedback,
    exceptionBranches: source.exceptionBranches,
    ...(source.extensionElements ? { extensionElements: source.extensionElements } : {}),
    ...(source.isExecutable != null ? { isExecutable: source.isExecutable } : {}),
    ...(source.artifacts ? { artifacts: source.artifacts } : {}),
    ...(source.bpmnPreserve ? { bpmnPreserve: source.bpmnPreserve } : {}),
  };
}

/** Peer graph seen as a semantic process so kernel ops run unchanged. Ids stay unique across the collaboration. */
function poolView(draft: SemanticProcess, peer: ProcessGraph): SemanticProcess {
  return {
    ...asGraph(peer),
    idSeq: draft.idSeq,
    ...(draft.collaborationId ? { collaborationId: draft.collaborationId } : {}),
    participants: draft.participants,
    lanes: draft.lanes.filter((lane) => lane.processId === peer.id),
    messageFlows: draft.messageFlows,
    processes: [asGraph(draft), ...draft.processes.filter((graph) => graph.id !== peer.id)],
  };
}

function mergePool(draft: SemanticProcess, peerId: string, result: SemanticProcess): void {
  const index = draft.processes.findIndex((graph) => graph.id === peerId);
  const graph = asGraph(result);
  if (index >= 0) draft.processes[index] = graph;
  else draft.processes.push(graph);
  draft.idSeq = result.idSeq;
  draft.participants = result.participants;
  draft.messageFlows = result.messageFlows;
  draft.lanes = [...draft.lanes.filter((lane) => lane.processId !== peerId), ...result.lanes];
}

/** A pool the user filled by hand is no longer a black box: give it Start → End to insert between. */
function seedPool(draft: SemanticProcess, peer: ProcessGraph): void {
  if (peer.nodes.length) return;
  if (!peer.scopes.length) {
    peer.rootScopeId = nextId(draft, 'Scope');
    peer.scopes.push({ id: peer.rootScopeId, parentId: null, ownerId: null, nodeIds: [], flowIds: [] });
  }
  const start: FlowNode = {
    id: nextId(draft, 'StartEvent'),
    type: 'start',
    name: 'Start',
    bpmnType: DEFAULT_BPMN_TYPE.start,
  };
  const end: FlowNode = {
    id: nextId(draft, 'EndEvent'),
    type: 'end',
    name: 'End',
    bpmnType: DEFAULT_BPMN_TYPE.end,
  };
  const flow: SequenceFlow = { id: nextId(draft, 'SequenceFlow'), source: start.id, target: end.id };
  peer.nodes.push(start, end);
  peer.flows.push(flow);
  const scope = peer.scopes.find((item) => item.id === peer.rootScopeId) ?? peer.scopes[0]!;
  scope.nodeIds.push(start.id, end.id);
  scope.flowIds.push(flow.id);
}

/** Pool a selection means for insertion: a participant, a lane, or nothing. */
export function poolTargetOf(process: SemanticProcess, id: string | undefined): string | undefined {
  if (!id) return undefined;
  const lane = (process.lanes ?? []).find((item) => item.id === id);
  const participantId = lane?.participantId ?? id;
  return (process.participants ?? []).some((part) => part.id === participantId) ? participantId : undefined;
}

/**
 * Runs a kernel op inside the process owned by `participantId` instead of the host process.
 * Materialises a process for a black-box pool and seeds Start → End for an empty one.
 */
export function applyInPool(
  process: SemanticProcess,
  participantId: string,
  run: (graph: SemanticProcess) => Applied,
): Applied {
  const participant = (process.participants ?? []).find((part) => part.id === participantId);
  if (!participant) throw new Error(`unknown participant: ${participantId}`);
  if (participant.processId === process.id) return run(process);
  return apply(process, (draft) => {
    const owner = draft.participants.find((part) => part.id === participantId)!;
    let peer = draft.processes.find((graph) => graph.id === owner.processId);
    if (!peer) {
      peer = emptyPeerGraph(draft, owner.name || 'Pool');
      draft.processes.push(peer);
      owner.processId = peer.id;
    }
    seedPool(draft, peer);
    const applied = run(poolView(draft, peer));
    mergePool(draft, peer.id, applied.process);
    return applied.id;
  });
}

/** Pool label is the source of truth: the process it references follows the participant name. */
export function syncProcessName(draft: SemanticProcess, participant: Participant, name: string): void {
  if (!participant.processId) return;
  if (participant.processId === draft.id) {
    draft.name = name;
    return;
  }
  const peer = (draft.processes ?? []).find((graph) => graph.id === participant.processId);
  if (peer) peer.name = name;
}

function nodeIdsForProcess(draft: SemanticProcess, processId: string): string[] {
  const graph = processId === draft.id ? draft : draft.processes.find((g) => g.id === processId);
  if (!graph) return [];
  const root =
    graph.scopes.find((s) => s.ownerId == null && s.parentId == null) ?? graph.scopes[0];
  const allowed = new Set(root?.nodeIds ?? graph.nodes.map((n) => n.id));
  return graph.nodes.filter((n) => n.type !== 'boundaryEvent' && allowed.has(n.id)).map((n) => n.id);
}

function participantIdOf(draft: SemanticProcess, id: string): string | undefined {
  if (draft.participants.some((p) => p.id === id)) return id;
  const lane = draft.lanes.find((l) => l.id === id);
  if (lane?.participantId) return lane.participantId;
  if (draft.nodes.some((n) => n.id === id)) {
    return draft.participants.find((p) => p.processId === draft.id)?.id;
  }
  for (const peer of draft.processes) {
    if (!peer.nodes.some((n) => n.id === id)) continue;
    return draft.participants.find((p) => p.processId === peer.id)?.id;
  }
  return undefined;
}

/** Adds a pool. First call wraps this process and adds a partner; later calls add another pool. */
export function addPool(process: SemanticProcess, spec: { name?: string; id?: string } = {}): Applied {
  return apply(process, (draft) => {
    ensureHostPool(draft);
    const id = nextId(draft, 'Participant', spec.id);
    const name = spec.name ?? 'Pool';
    const peer = emptyPeerGraph(draft, name);
    draft.processes.push(peer);
    draft.participants.push({ id, name, processId: peer.id });
    return id;
  });
}

export function addLane(
  process: SemanticProcess,
  spec: { participantId?: string; parentLaneId?: string; name?: string; id?: string } = {},
): Applied {
  return apply(process, (draft) => {
    let participantId = spec.participantId;
    const parentLaneId = spec.parentLaneId;
    if (parentLaneId) {
      const parent = draft.lanes.find((l) => l.id === parentLaneId);
      if (!parent) throw new Error(`unknown lane: ${parentLaneId}`);
      participantId = parent.participantId;
    }
    // Agent plans sometimes carry the previous lane as `participantId` when
    // adding sibling swimlanes. Treat that as the lane's owning participant;
    // nested lanes still require the explicit `parentLaneId` field.
    const participantLane = participantId
      ? draft.lanes.find((lane) => lane.id === participantId)
      : undefined;
    if (participantLane?.participantId) participantId = participantLane.participantId;
    if (!participantId) participantId = ensureHostPool(draft).id;
    const participant = draft.participants.find((p) => p.id === participantId);
    if (!participant) throw new Error(`unknown participant: ${participantId}`);
    const processId = participant.processId ?? draft.id;
    const siblings = draft.lanes.filter(
      (l) => l.participantId === participantId && (l.parentLaneId ?? '') === (parentLaneId ?? ''),
    );
    const lane: Lane = {
      id: nextId(draft, 'Lane', spec.id),
      name: spec.name ?? 'Lane',
      processId,
      participantId,
      nodeIds: siblings.length === 0 && !parentLaneId ? nodeIdsForProcess(draft, processId) : [],
      ...(parentLaneId ? { parentLaneId } : {}),
    };
    draft.lanes.push(lane);
    return lane.id;
  });
}

export function assignLane(process: SemanticProcess, nodeId: string, laneId: string): Applied {
  return apply(process, (draft) => {
    getNode(draft, nodeId);
    const lane = draft.lanes.find((l) => l.id === laneId);
    if (!lane) throw new Error(`unknown lane: ${laneId}`);
    for (const other of draft.lanes) {
      other.nodeIds = other.nodeIds.filter((id) => id !== nodeId);
    }
    lane.nodeIds.push(nodeId);
    return nodeId;
  });
}

/** Message flow between participants. Sequence flow stays intra-process. */
export function addMessageInteraction(
  process: SemanticProcess,
  spec: { from: string; to: string; name?: string; id?: string },
): Applied {
  return apply(process, (draft) => {
    if (draft.participants.length < 2) {
      throw new Error('message flow needs two participants');
    }
    const fromP = participantIdOf(draft, spec.from);
    const toP = participantIdOf(draft, spec.to);
    if (!fromP || !toP) throw new Error('message flow must connect participants');
    if (fromP === toP) throw new Error('message flow must cross participants');
    const id = nextId(draft, 'MessageFlow', spec.id);
    draft.messageFlows.push({
      id,
      source: spec.from,
      target: spec.to,
      ...(spec.name != null ? { name: spec.name } : {}),
    });
    return id;
  });
}
