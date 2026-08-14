import { alloc } from './ids.js';
import { allRegions, getNode, outgoingFlows, predecessors, successors } from './graph.js';
import type { ExceptionBranch, FeedbackEdge, GatewayKind, Process, RegionKind, Scope, StructuredRegion, UnstructuredMark } from './types.js';
import { FEEDBACK, UNSTRUCTURED } from './types.js';

type Memo = Map<string, string | null>;

const KIND: Record<string, GatewayKind> = {
  exclusiveGateway: 'exclusive',
  parallelGateway: 'parallel',
  inclusiveGateway: 'inclusive',
  eventBasedGateway: 'eventBased',
  complexGateway: 'complex',
};

function isSplitType(type: string): type is keyof typeof KIND {
  return type in KIND;
}

function compatibleJoin(splitType: string, joinType: string): boolean {
  if (splitType === joinType) return true;
  return splitType === 'eventBasedGateway' && joinType === 'exclusiveGateway';
}

type Walk = { join: string; nodeIds: string[] };

function sameScope(p: Process, a: string, b: string): boolean {
  const sa = p.scopes.find((s) => s.nodeIds.includes(a));
  const sb = p.scopes.find((s) => s.nodeIds.includes(b));
  return !!sa && sa.id === sb?.id;
}

function walkBranch(p: Process, from: string, splitId: string, memo: Memo): Walk | null {
  const nodeIds: string[] = [];
  let cur = from;
  const seen = new Set([splitId]);
  while (true) {
    const node = getNode(p, cur);
    const preds = predecessors(p, cur).filter((id) => sameScope(p, splitId, id));
    const succs = successors(p, cur).filter((id) => sameScope(p, splitId, id));
    if (isSplitType(node.type) && preds.length >= 2) return { join: cur, nodeIds };
    if (seen.has(cur)) return null;
    seen.add(cur);
    if (succs.length >= 2 && isSplitType(node.type)) {
      const nestedJoin = findJoin(p, cur, memo);
      if (!nestedJoin) return null;
      const after = successors(p, nestedJoin).filter((id) => sameScope(p, splitId, id));
      if (after.length !== 1) return null;
      nodeIds.push(cur, nestedJoin);
      cur = after[0]!;
      continue;
    }
    if (succs.length !== 1 || (preds.length !== 1 && cur !== from)) return null;
    nodeIds.push(cur);
    cur = succs[0]!;
  }
}

function findJoin(p: Process, splitId: string, memo: Memo): string | null {
  if (memo.has(splitId)) return memo.get(splitId) ?? null;
  const outs = outgoingFlows(p, splitId);
  const split = getNode(p, splitId);
  if (outs.length < 2 || !isSplitType(split.type)) {
    memo.set(splitId, null);
    return null;
  }
  memo.set(splitId, null);
  const walks: Walk[] = [];
  for (const flow of outs) {
    const walk = walkBranch(p, flow.target, splitId, memo);
    if (!walk) return null;
    walks.push(walk);
  }
  const join = walks[0]?.join;
  if (!join || walks.some((w) => w.join !== join)) return null;
  if (!compatibleJoin(split.type, getNode(p, join).type)) return null;
  if (predecessors(p, join).length !== outs.length) return null;
  memo.set(splitId, join);
  return join;
}

function canReach(p: Process, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...successors(p, id));
  }
  return false;
}

function walkException(p: Process, from: string, hostId: string): string[] {
  const nodeIds: string[] = [];
  let cur = from;
  const seen = new Set<string>([hostId]);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = getNode(p, cur);
    const preds = predecessors(p, cur);
    if (preds.length >= 2 && node.type !== 'end') break;
    nodeIds.push(cur);
    const succs = successors(p, cur);
    if (succs.length !== 1) break;
    cur = succs[0];
  }
  return nodeIds;
}

function rebuildFeedback(p: Process): void {
  const prevFb = new Map((p.feedback ?? []).map((f) => [f.flowId, f]));
  const prevEx = new Map((p.exceptionBranches ?? []).map((e) => [e.boundaryId, e]));
  const feedback: FeedbackEdge[] = [];
  const exceptionBranches: ExceptionBranch[] = [];

  for (const node of p.nodes) {
    if (node.type !== 'boundaryEvent' || !node.attachedTo) continue;
    for (const flow of outgoingFlows(p, node.id)) {
      flow.exception = true;
      const loop = flow.target === node.attachedTo || canReach(p, flow.target, node.attachedTo);
      const prev = prevFb.get(flow.id);
      feedback.push({
        kind: FEEDBACK,
        id: prev?.id ?? alloc(p.idSeq, 'Feedback'),
        flowId: flow.id,
        source: flow.source,
        target: flow.target,
        reason: loop ? 'loop' : 'exception',
        attachedTo: node.attachedTo,
        exceptionBranch: true,
      });
      const old = prevEx.get(node.id);
      exceptionBranches.push({
        id: old?.id ?? alloc(p.idSeq, 'Exception'),
        hostId: node.attachedTo,
        boundaryId: node.id,
        entryFlowId: flow.id,
        nodeIds: walkException(p, flow.target, node.attachedTo),
      });
    }
  }

  p.feedback = feedback;
  p.exceptionBranches = exceptionBranches;
}

function scopeHappyPath(p: Process, scope: Scope): string[] {
  const starts = p.nodes.filter((n) => n.type === 'start' && scope.nodeIds.includes(n.id));
  const start = starts.find((n) => !n.eventDefinition) ?? starts[0];
  if (!start) return [];
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

function isContainerKind(type: RegionKind): boolean {
  return type === 'subprocess' || type === 'eventSubprocess';
}

function containsSplit(region: StructuredRegion, splitId: string, p: Process): boolean {
  if (region.split === splitId) return false;
  if (isContainerKind(region.type)) {
    const scope = p.scopes.find((s) => s.ownerId === region.split);
    return !!scope?.nodeIds.includes(splitId);
  }
  return region.branches.some((b) => b.nodeIds.includes(splitId));
}

function rebuild(p: Process): void {
  const previous = allRegions(p);
  const prevBySplit = new Map(previous.map((r) => [r.split, r]));
  const memo: Memo = new Map();
  const built: StructuredRegion[] = [];
  const unstructured: UnstructuredMark[] = [];

  for (const node of p.nodes) {
    if (!isSplitType(node.type) || outgoingFlows(p, node.id).length < 2) continue;
    const join = findJoin(p, node.id, memo);
    if (!join) {
      unstructured.push({ kind: UNSTRUCTURED, gatewayId: node.id, reason: 'no matching join' });
      continue;
    }
    const prev = prevBySplit.get(node.id);
    const outs = outgoingFlows(p, node.id);
    built.push({
      id: prev?.id ?? alloc(p.idSeq, 'Region'),
      type: KIND[node.type],
      split: node.id,
      join,
      nested: [],
      branches: outs.map((flow, i) => {
        const old = prev?.branches.find((b) => b.entryFlowId === flow.id);
        const walk = walkBranch(p, flow.target, node.id, memo);
        return {
          id: old?.id ?? alloc(p.idSeq, 'Branch'),
          name: old?.name ?? flow.name ?? `Branch ${i + 1}`,
          entryFlowId: flow.id,
          nodeIds: walk?.nodeIds ?? [],
          ...(old?.locked ? { locked: true as const } : {}),
        };
      }),
    });
  }

  for (const node of p.nodes) {
    if (node.type !== 'subProcess') continue;
    const scope = p.scopes.find((s) => s.ownerId === node.id);
    if (!scope) continue;
    const prev = prevBySplit.get(node.id);
    const path = scopeHappyPath(p, scope);
    const entry =
      path.length >= 2
        ? outgoingFlows(p, path[0]!).find((f) => f.target === path[1])
        : outgoingFlows(p, path[0] ?? '')[0];
    const kind: RegionKind = node.triggeredByEvent ? 'eventSubprocess' : 'subprocess';
    built.push({
      id: prev?.id ?? alloc(p.idSeq, 'Region'),
      type: kind,
      split: node.id,
      join: node.id,
      nested: [],
      branches: [
        {
          id: prev?.branches[0]?.id ?? alloc(p.idSeq, 'Branch'),
          name: prev?.branches[0]?.name ?? '',
          entryFlowId: entry?.id ?? '',
          nodeIds: path,
          ...(prev?.branches[0]?.locked ? { locked: true as const } : {}),
        },
      ],
    });
  }

  for (const region of built) {
    region.nested = built.filter((s) => s.id !== region.id && containsSplit(region, s.split, p));
  }
  p.regions = built.filter((r) => !built.some((o) => o.id !== r.id && containsSplit(o, r.split, p)));
  p.unstructured = unstructured;
  rebuildFeedback(p);
}

export function detectStructure(process: Process): Process {
  const next = structuredClone(process);
  rebuild(next);
  return next;
}

export function rebuildStructure(process: Process): Process {
  rebuild(process);
  return process;
}
