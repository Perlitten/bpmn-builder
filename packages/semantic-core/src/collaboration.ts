import { rebuildStructure } from './detect.js';
import { getNode } from './graph.js';
import { nextId } from './ids.js';
import type { Applied, Lane, Participant, Process } from './types.js';

function apply(prev: Process, fn: (draft: Process) => string): Applied {
  const draft = structuredClone(prev);
  draft.participants ??= [];
  draft.lanes ??= [];
  draft.messageFlows ??= [];
  draft.processes ??= [];
  const id = fn(draft);
  rebuildStructure(draft);
  return { process: draft, inverse: () => structuredClone(prev), id };
}

function ensureHostPool(draft: Process): Participant {
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

function nodeIdsForProcess(draft: Process, processId: string): string[] {
  const nodes =
    processId === draft.id ? draft.nodes : (draft.processes.find((g) => g.id === processId)?.nodes ?? []);
  return nodes.filter((n) => n.type !== 'boundaryEvent').map((n) => n.id);
}

function participantIdOf(draft: Process, id: string): string | undefined {
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
export function addPool(process: Process, spec: { name?: string; id?: string } = {}): Applied {
  return apply(process, (draft) => {
    ensureHostPool(draft);
    const id = nextId(draft, 'Participant', spec.id);
    draft.participants.push({ id, name: spec.name ?? 'Pool' });
    return id;
  });
}

export function addLane(
  process: Process,
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

export function assignLane(process: Process, nodeId: string, laneId: string): Applied {
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
  process: Process,
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
