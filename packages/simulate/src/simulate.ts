import {
  getNode,
  incomingFlows,
  innerScope,
  isEventSubProcess,
  outgoingFlows,
  scopeOf,
  type FlowNode,
  type Process,
  type SequenceFlow,
} from '../../semantic-core/src/index.js';

export type SimSnapshot = {
  /** Parked tokens waiting for a click (tasks, exclusive splits). */
  tokens: Record<string, number>;
  /** Parallel join: tokens arrived per incoming sequence flow. */
  joinWait: Record<string, Record<string, number>>;
  /** Tokens consumed by end events. */
  completed: Record<string, number>;
};

export type TokenSimulation = {
  snapshot(): SimSnapshot;
  reset(): SimSnapshot;
  /**
   * Start: always spawns a new token and emits outgoing.
   * Task / exclusive split: consumes one parked token.
   * Exclusive split with 2+ outgoing needs `outgoingFlowId` (or a default flow).
   * Boundary: fires from an active host — no incoming sequence flow required.
   * Event subprocess: starts a side token in its inner region.
   */
  signal(nodeId: string, outgoingFlowId?: string): SimSnapshot;
};

/** Diagram highlights for the token player. */
export type SimMarks = {
  click: string[];
  choice: string[];
  /** Host activities whose attached boundary is armed. */
  host: string[];
};

const DRAIN_LIMIT = 10_000;

export function completedCount(snap: SimSnapshot): number {
  return Object.values(snap.completed).reduce((sum, n) => sum + n, 0);
}

function isChoiceGateway(type: string): boolean {
  return type === 'exclusiveGateway' || type === 'inclusiveGateway' || type === 'eventBasedGateway';
}

function innerStart(process: Process, ownerId: string): FlowNode | undefined {
  const scope = innerScope(process, ownerId);
  if (!scope) return undefined;
  const starts = process.nodes.filter((n) => n.type === 'start' && scope.nodeIds.includes(n.id));
  return starts.find((n) => n.eventDefinition) ?? starts[0];
}

function hasExecutableInnerGraph(process: Process, ownerId: string): boolean {
  const scope = innerScope(process, ownerId);
  return Boolean(scope?.nodeIds.some((id) => {
    const node = process.nodes.find((item) => item.id === id);
    return node && node.type !== 'start' && node.type !== 'end';
  }));
}

function ownerSubtreeIds(process: Process, ownerId: string): string[] {
  const inner = innerScope(process, ownerId);
  if (!inner) return [];
  const out: string[] = [];
  const walk = (scopeId: string) => {
    const scope = process.scopes.find((s) => s.id === scopeId);
    if (!scope) return;
    out.push(...scope.nodeIds);
    for (const child of process.scopes) {
      if (child.parentId === scope.id) walk(child.id);
    }
  };
  walk(inner.id);
  return out;
}

function waitHasToken(buf: Record<string, number> | undefined): boolean {
  return !!buf && Object.values(buf).some((n) => n > 0);
}

function isHostActive(
  process: Process,
  tokens: Record<string, number>,
  joinWait: Record<string, Record<string, number>>,
  hostId: string,
): boolean {
  if ((tokens[hostId] ?? 0) > 0 || waitHasToken(joinWait[hostId])) return true;
  for (const id of ownerSubtreeIds(process, hostId)) {
    if ((tokens[id] ?? 0) > 0 || waitHasToken(joinWait[id])) return true;
  }
  return false;
}

export function simulationMarks(process: Process, snap: SimSnapshot): SimMarks {
  const click = new Set<string>();
  const choice = new Set<string>();
  const host = new Set<string>();
  const hasTokens = Object.keys(snap.tokens).length > 0;

  if (!hasTokens) {
    for (const node of process.nodes) {
      if (node.type === 'start') click.add(node.id);
    }
  }

  for (const node of process.nodes) {
    if ((snap.tokens[node.id] ?? 0) < 1) continue;
    const outs = outgoingFlows(process, node.id);
    if (isChoiceGateway(node.type) && outs.length > 1) {
      for (const flow of outs) choice.add(flow.id);
      continue;
    }
    click.add(node.id);
  }

  for (const node of process.nodes) {
    if (node.type !== 'boundaryEvent' || !node.attachedTo) continue;
    if (!isHostActive(process, snap.tokens, snap.joinWait, node.attachedTo)) continue;
    click.add(node.id);
    click.add(node.attachedTo);
    host.add(node.attachedTo);
  }

  for (const node of process.nodes) {
    if (!isEventSubProcess(node)) continue;
    click.add(node.id);
    const start = innerStart(process, node.id);
    if (start) click.add(start.id);
  }

  return { click: [...click], choice: [...choice], host: [...host] };
}

export function createTokenSimulation(process: Process): TokenSimulation {
  let tokens: Record<string, number> = Object.create(null);
  let joinWait: Record<string, Record<string, number>> = Object.create(null);
  let completed: Record<string, number> = Object.create(null);
  const queue: Array<{ nodeId: string; via: string }> = [];
  let draining = false;

  function snapshot(): SimSnapshot {
    const wait: Record<string, Record<string, number>> = Object.create(null);
    for (const [id, buf] of Object.entries(joinWait)) {
      const used = Object.fromEntries(Object.entries(buf).filter(([, n]) => n > 0));
      if (Object.keys(used).length) wait[id] = used;
    }
    return {
      tokens: Object.fromEntries(Object.entries(tokens).filter(([, n]) => n > 0)),
      joinWait: wait,
      completed: { ...completed },
    };
  }

  function bump(map: Record<string, number>, id: string, by = 1): void {
    const next = (map[id] ?? 0) + by;
    if (next <= 0) delete map[id];
    else map[id] = next;
  }

  function emitFlow(flow: SequenceFlow): void {
    queue.push({ nodeId: flow.target, via: flow.id });
    drain();
  }

  function emitAll(flows: SequenceFlow[]): void {
    for (const flow of flows) queue.push({ nodeId: flow.target, via: flow.id });
    drain();
  }

  function drain(): void {
    if (draining) return;
    draining = true;
    let steps = 0;
    while (queue.length) {
      if (++steps > DRAIN_LIMIT) {
        draining = false;
        queue.length = 0;
        throw new Error('simulation exceeded step limit');
      }
      const next = queue.shift();
      if (next) arrive(next.nodeId, next.via);
    }
    draining = false;
  }

  function arrive(nodeId: string, via: string): void {
    const node = getNode(process, nodeId);
    if (node.type === 'end') {
      const ownerId = scopeOf(process, nodeId).ownerId;
      const owner = ownerId ? process.nodes.find((item) => item.id === ownerId) : undefined;
      if (owner?.type === 'subProcess' && !owner.triggeredByEvent) {
        emitAll(outgoingFlows(process, owner.id));
        return;
      }
      bump(completed, nodeId);
      return;
    }
    if (node.type === 'subProcess' && !node.triggeredByEvent && hasExecutableInnerGraph(process, node.id)) {
      const start = innerStart(process, node.id);
      if (!start) throw new Error(`subprocess ${node.id} has no start event`);
      emitAll(outgoingFlows(process, start.id));
      return;
    }
    if (node.type === 'intermediateThrow') {
      emitAll(outgoingFlows(process, nodeId));
      return;
    }
    if (node.type === 'parallelGateway') {
      const ins = incomingFlows(process, nodeId);
      const outs = outgoingFlows(process, nodeId);
      if (ins.length > 1) {
        const buf = (joinWait[nodeId] ??= Object.create(null));
        bump(buf, via);
        if (ins.every((flow) => (buf[flow.id] ?? 0) > 0)) {
          for (const flow of ins) bump(buf, flow.id, -1);
          emitAll(outs);
        }
        return;
      }
      emitAll(outs);
      return;
    }
    if (isChoiceGateway(node.type)) {
      const outs = outgoingFlows(process, nodeId);
      if (outs.length > 1) {
        bump(tokens, nodeId);
        return;
      }
      emitAll(outs);
      return;
    }
    bump(tokens, nodeId);
  }

  function pickOutgoing(nodeId: string, outs: SequenceFlow[], outgoingFlowId?: string): SequenceFlow {
    if (outgoingFlowId) {
      const hit = outs.find((flow) => flow.id === outgoingFlowId);
      if (!hit) throw new Error(`${outgoingFlowId} is not outgoing from ${nodeId}`);
      return hit;
    }
    const fallback = outs.find((flow) => flow.isDefault) ?? (outs.length === 1 ? outs[0] : undefined);
    if (!fallback) throw new Error(`exclusive split ${nodeId} needs an outgoing sequence flow`);
    return fallback;
  }

  function consumeHostInstance(hostId: string): void {
    if ((tokens[hostId] ?? 0) > 0) {
      bump(tokens, hostId, -1);
      return;
    }
    for (const id of ownerSubtreeIds(process, hostId)) {
      delete tokens[id];
      delete joinWait[id];
    }
  }

  function fireBoundary(node: FlowNode, outgoingFlowId?: string): void {
    const nodeId = node.id;
    const outs = outgoingFlows(process, nodeId);
    const onBoundary = (tokens[nodeId] ?? 0) > 0;
    const hostId = node.attachedTo;
    const armed = !!hostId && isHostActive(process, tokens, joinWait, hostId);
    if (!onBoundary && !armed) throw new Error(`no token at ${nodeId}`);
    const chosen = pickOutgoing(nodeId, outs, outgoingFlowId);
    if (onBoundary) bump(tokens, nodeId, -1);
    else if (node.cancelActivity !== false && hostId) consumeHostInstance(hostId);
    emitFlow(chosen);
  }

  function fireEventSubprocess(nodeId: string): void {
    const start = innerStart(process, nodeId);
    if (!start) throw new Error(`no token at ${nodeId}`);
    emitAll(outgoingFlows(process, start.id));
  }

  return {
    snapshot,
    reset() {
      tokens = Object.create(null);
      joinWait = Object.create(null);
      completed = Object.create(null);
      queue.length = 0;
      draining = false;
      return snapshot();
    },
    signal(nodeId, outgoingFlowId) {
      const node = getNode(process, nodeId);
      const outs = outgoingFlows(process, nodeId);
      if (node.type === 'start') {
        emitAll(outs);
        return snapshot();
      }
      if (node.type === 'boundaryEvent') {
        fireBoundary(node, outgoingFlowId);
        return snapshot();
      }
      if (isEventSubProcess(node)) {
        fireEventSubprocess(nodeId);
        return snapshot();
      }
      if ((tokens[nodeId] ?? 0) < 1) throw new Error(`no token at ${nodeId}`);
      if (isChoiceGateway(node.type) && outs.length > 1) {
        const chosen = pickOutgoing(nodeId, outs, outgoingFlowId);
        bump(tokens, nodeId, -1);
        emitFlow(chosen);
        return snapshot();
      }
      if (node.type === 'parallelGateway' && outs.length > 1) {
        bump(tokens, nodeId, -1);
        emitAll(outs);
        return snapshot();
      }
      if (outs.length !== 1) throw new Error(`ambiguous outgoing from ${nodeId}`);
      bump(tokens, nodeId, -1);
      emitFlow(outs[0]);
      return snapshot();
    },
  };
}

export function resolveClick(
  process: Process,
  snap: SimSnapshot,
  elementId: string,
): { nodeId: string; flowId?: string } | null {
  const node = process.nodes.find((n) => n.id === elementId);
  if (node?.type === 'start') return { nodeId: elementId };
  if (node && isEventSubProcess(node)) {
    const start = innerStart(process, node.id);
    return start ? { nodeId: start.id } : { nodeId: node.id };
  }
  if ((snap.tokens[elementId] ?? 0) > 0) {
    const parked = getNode(process, elementId);
    const outs = outgoingFlows(process, elementId);
    if (isChoiceGateway(parked.type) && outs.length > 1) {
      return null;
    }
    return { nodeId: elementId };
  }
  if (node?.type === 'boundaryEvent' && node.attachedTo) {
    if (isHostActive(process, snap.tokens, snap.joinWait, node.attachedTo)) {
      return { nodeId: elementId };
    }
  }
  const flow = process.flows.find((f) => f.id === elementId);
  if (!flow) return null;
  const source = getNode(process, flow.source);
  if (isChoiceGateway(source.type) && (snap.tokens[flow.source] ?? 0) > 0) {
    return { nodeId: flow.source, flowId: flow.id };
  }
  if (
    source.type === 'boundaryEvent' &&
    source.attachedTo &&
    isHostActive(process, snap.tokens, snap.joinWait, source.attachedTo)
  ) {
    return { nodeId: source.id, flowId: flow.id };
  }
  return null;
}

function simNodeLabel(process: Process, id: string): string {
  const node = process.nodes.find((n) => n.id === id);
  if (!node) return 'element';
  const name = node.name.trim();
  if (name) return name;
  if (node.type === 'exclusiveGateway') return 'XOR';
  if (node.type === 'parallelGateway') return 'AND';
  if (node.type === 'inclusiveGateway') return 'OR';
  if (node.type === 'eventBasedGateway') return 'event-based gateway';
  if (node.type === 'start') return 'Start';
  if (node.type === 'end') return 'End';
  if (node.type === 'task') return 'Task';
  if (node.type === 'boundaryEvent') return 'boundary event';
  if (node.type === 'subProcess') return node.triggeredByEvent ? 'event subprocess' : 'Subprocess';
  return 'element';
}

function choiceKind(type: string): string {
  if (type === 'inclusiveGateway') return 'OR';
  if (type === 'eventBasedGateway') return 'event-based';
  return 'XOR';
}

function exceptionHint(process: Process, hostId: string): string {
  const bounds = process.nodes.filter((n) => n.type === 'boundaryEvent' && n.attachedTo === hostId);
  if (!bounds.length) return '';
  return `, or ${simNodeLabel(process, bounds[0]!.id)} for the exception path`;
}

function sideEventHint(process: Process): string {
  const ev = process.nodes.find((n) => isEventSubProcess(n));
  if (!ev) return '';
  return `, or ${simNodeLabel(process, ev.id)} as a side event`;
}

export function describeSimulation(process: Process, snap: SimSnapshot): string {
  const parked = Object.keys(snap.tokens);
  const choiceId = parked.find((id) => {
    const node = process.nodes.find((n) => n.id === id);
    return node && isChoiceGateway(node.type) && outgoingFlows(process, id).length > 1;
  });
  if (choiceId) {
    const node = process.nodes.find((n) => n.id === choiceId);
    const kind = choiceKind(node?.type ?? 'exclusiveGateway');
    return `Token on ${simNodeLabel(process, choiceId)} — click a sequence flow to choose ${kind} branch`;
  }
  const joinIds = Object.keys(snap.joinWait);
  if (joinIds.length) {
    const id = joinIds[0]!;
    const buf = snap.joinWait[id] ?? {};
    const ins = incomingFlows(process, id);
    const got = ins.filter((flow) => (buf[flow.id] ?? 0) > 0).length;
    const name = simNodeLabel(process, id);
    const where = name === 'AND' ? 'AND join' : `AND join · ${name}`;
    return `Waiting at ${where} (${got}/${ins.length} incoming)`;
  }
  if (parked.length === 1) {
    const id = parked[0]!;
    return `Token on ${simNodeLabel(process, id)} — click the element to advance${exceptionHint(process, id)}${sideEventHint(process)}`;
  }
  if (parked.length > 1) {
    const names = parked.slice(0, 3).map((id) => simNodeLabel(process, id)).join(', ');
    return `Tokens on ${names} — click an element with a token`;
  }
  const done = completedCount(snap);
  if (done) return `Token reached end · ${done} completed — click a start event for another`;
  return 'Click a start event to place a token';
}

export function describeSimulationError(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  if (/step limit/.test(raw)) return 'Stopped: process looped past the step limit — Reset tokens';
  if (/no token at/.test(raw)) return 'No token on that element — click a start event or a node with a token';
  if (/outgoing sequence flow/.test(raw)) return 'Click a sequence flow to choose the XOR branch';
  return raw || 'Simulation could not advance';
}
