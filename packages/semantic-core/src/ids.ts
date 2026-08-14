import type { FlowNodeType, Process } from './types.js';

export const ID_PREFIX: Record<FlowNodeType, string> = {
  start: 'StartEvent',
  end: 'EndEvent',
  task: 'Task',
  subProcess: 'SubProcess',
  exclusiveGateway: 'ExclusiveGateway',
  parallelGateway: 'ParallelGateway',
  inclusiveGateway: 'InclusiveGateway',
  eventBasedGateway: 'EventBasedGateway',
  complexGateway: 'ComplexGateway',
  intermediateCatch: 'IntermediateCatchEvent',
  boundaryEvent: 'BoundaryEvent',
};

export function alloc(idSeq: Record<string, number>, prefix: string): string {
  const n = (idSeq[prefix] ?? 0) + 1;
  idSeq[prefix] = n;
  return `${prefix}_${n}`;
}

export function allIds(p: Process): Set<string> {
  const ids = new Set<string>([p.id]);
  if (p.collaborationId) ids.add(p.collaborationId);
  for (const n of p.nodes) ids.add(n.id);
  for (const f of p.flows) ids.add(f.id);
  for (const s of p.scopes) ids.add(s.id);
  for (const f of p.feedback ?? []) ids.add(f.id);
  for (const e of p.exceptionBranches ?? []) ids.add(e.id);
  for (const part of p.participants ?? []) ids.add(part.id);
  for (const lane of p.lanes ?? []) ids.add(lane.id);
  for (const message of p.messageFlows ?? []) ids.add(message.id);
  const walk = (regions: Process['regions']) => {
    for (const r of regions) {
      ids.add(r.id);
      for (const b of r.branches) ids.add(b.id);
      walk(r.nested);
    }
  };
  walk(p.regions);
  for (const extra of [...(p.artifacts ?? []), ...(p.rootElements ?? []), ...(p.collaborationArtifacts ?? [])]) {
    if (typeof extra.id === 'string') ids.add(extra.id);
  }
  for (const peer of p.processes ?? []) {
    ids.add(peer.id);
    for (const n of peer.nodes) ids.add(n.id);
    for (const f of peer.flows) ids.add(f.id);
    for (const s of peer.scopes) ids.add(s.id);
    for (const f of peer.feedback ?? []) ids.add(f.id);
    for (const e of peer.exceptionBranches ?? []) ids.add(e.id);
    walk(peer.regions);
    for (const extra of peer.artifacts ?? []) {
      if (typeof extra.id === 'string') ids.add(extra.id);
    }
  }
  return ids;
}

export function nextId(p: Process, prefix: string, explicit?: string): string {
  const id = explicit ?? alloc(p.idSeq, prefix);
  if (allIds(p).has(id)) throw new Error(`duplicate id: ${id}`);
  return id;
}
