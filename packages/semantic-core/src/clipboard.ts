import { rebuildStructure } from './detect.js';
import { defaultInsertAfter, flowAfter, scopeOf } from './graph.js';
import { ID_PREFIX, nextId } from './ids.js';
import type { Applied, FlowNode, Process, SequenceFlow } from './types.js';

export type SemanticClip = {
  nodes: FlowNode[];
  flows: SequenceFlow[];
};

export type PasteApplied = Applied & { pastedIds: string[] };

const SIDE = new Set(['boundaryEvent', 'end']);

/** Selected flow nodes + connecting flows. Start / subprocess / happy-path ends are not copied. */
export function extractSubgraph(process: Process, ids: string[]): SemanticClip | null {
  const requested = new Set(ids.filter((id) => process.nodes.some((node) => node.id === id)));
  for (const node of process.nodes) {
    if (node.type === 'boundaryEvent' && node.attachedTo && requested.has(node.attachedTo)) {
      requested.add(node.id);
    }
  }
  for (const flow of process.flows) {
    if (!requested.has(flow.source)) continue;
    const source = process.nodes.find((node) => node.id === flow.source);
    const target = process.nodes.find((node) => node.id === flow.target);
    if (source?.type === 'boundaryEvent' && target?.type === 'end') requested.add(target.id);
  }

  const nodes = process.nodes.filter((node) => {
    if (!requested.has(node.id) || node.type === 'start' || node.type === 'subProcess') return false;
    if (node.type !== 'end') return true;
    return process.flows.some((flow) => {
      if (flow.target !== node.id || !requested.has(flow.source)) return false;
      return process.nodes.find((source) => source.id === flow.source)?.type === 'boundaryEvent';
    });
  });
  if (!nodes.length) return null;
  const keep = new Set(nodes.map((node) => node.id));
  const flows = process.flows.filter((flow) => keep.has(flow.source) && keep.has(flow.target)).map((flow) => structuredClone(flow));
  return { nodes: nodes.map((node) => structuredClone(node)), flows };
}

function tryAfter(draft: Process, afterId?: string): string {
  if (afterId && draft.nodes.some((node) => node.id === afterId)) {
    try {
      flowAfter(draft, afterId);
      return afterId;
    } catch {
      /* gateway / end: fall through */
    }
  }
  return defaultInsertAfter(draft);
}

function components(ids: string[], flows: SequenceFlow[]): string[][] {
  const allowed = new Set(ids);
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id];
    const group: string[] = [];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const flow of flows) {
        const other = flow.source === cur ? flow.target : flow.target === cur ? flow.source : null;
        if (!other || !allowed.has(other) || seen.has(other)) continue;
        seen.add(other);
        stack.push(other);
      }
    }
    group.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    groups.push(group);
  }
  return groups;
}

function endpoints(group: string[], flows: SequenceFlow[]): { entry: string; exit: string } {
  const inGroup = new Set(group);
  const internal = flows.filter((flow) => inGroup.has(flow.source) && inGroup.has(flow.target));
  const entries = group.filter((id) => !internal.some((flow) => flow.target === id));
  const exits = group.filter((id) => !internal.some((flow) => flow.source === id));
  return { entry: entries[0] ?? group[0]!, exit: exits.at(-1) ?? group.at(-1)! };
}

/** Insert the clip on the sequence after `afterId` (or the happy-path tail). Layout is the caller's job. */
export function pasteSubgraph(process: Process, clip: SemanticClip, afterId?: string): PasteApplied {
  const draft = structuredClone(process);
  const pastedIds = spliceClip(draft, clip, afterId);
  if (!pastedIds.length) {
    return { process, inverse: () => process, id: process.id, pastedIds };
  }
  rebuildStructure(draft);
  return { process: draft, inverse: () => structuredClone(process), id: pastedIds[0]!, pastedIds };
}

function spliceClip(draft: Process, clip: SemanticClip, afterId?: string): string[] {
  const nodes = clip.nodes.filter((node) => node.type !== 'start' && node.type !== 'subProcess');
  if (!nodes.length) return [];
  const idMap = new Map<string, string>();
  for (const node of nodes) {
    idMap.set(node.id, nextId(draft, ID_PREFIX[node.type]));
  }
  const pasted = nodes.map((node) => ({
    ...structuredClone(node),
    id: idMap.get(node.id)!,
    attachedTo: node.attachedTo ? idMap.get(node.attachedTo) : node.attachedTo,
  }));
  const pastedFlows = clip.flows
    .filter((flow) => idMap.has(flow.source) && idMap.has(flow.target))
    .map((flow) => ({
      ...structuredClone(flow),
      id: nextId(draft, 'SequenceFlow'),
      source: idMap.get(flow.source)!,
      target: idMap.get(flow.target)!,
    }));

  const sequenceIds = pasted.filter((node) => !SIDE.has(node.type)).map((node) => node.id);
  if (!sequenceIds.length) return [];

  const after = tryAfter(draft, afterId);
  const dest = flowAfter(draft, after);
  const oldTarget = dest.target;
  const scope = scopeOf(draft, dest.source);
  const lane = (draft.lanes ?? []).find((item) => item.nodeIds.includes(dest.source));

  draft.nodes.push(...pasted);
  scope.nodeIds.push(...pasted.map((node) => node.id));
  if (lane) {
    lane.nodeIds.push(...pasted.filter((node) => node.type !== 'boundaryEvent').map((node) => node.id));
  }

  const chain = components(sequenceIds, pastedFlows).map((group) => endpoints(group, pastedFlows));
  dest.target = chain[0]!.entry;
  const extra: SequenceFlow[] = [];
  for (let i = 1; i < chain.length; i++) {
    extra.push({
      id: nextId(draft, 'SequenceFlow'),
      source: chain[i - 1]!.exit,
      target: chain[i]!.entry,
    });
  }
  extra.push({
    id: nextId(draft, 'SequenceFlow'),
    source: chain.at(-1)!.exit,
    target: oldTarget,
  });

  draft.flows.push(...pastedFlows, ...extra);
  scope.flowIds.push(...pastedFlows.map((flow) => flow.id), ...extra.map((flow) => flow.id));
  return pasted.map((node) => node.id);
}
