import {
  getNode,
  incomingFlows,
  outgoingFlows,
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
   */
  signal(nodeId: string, outgoingFlowId?: string): SimSnapshot;
};

export function completedCount(snap: SimSnapshot): number {
  return Object.values(snap.completed).reduce((sum, n) => sum + n, 0);
}

function isChoiceGateway(type: string): boolean {
  return type === 'exclusiveGateway' || type === 'inclusiveGateway' || type === 'eventBasedGateway';
}

export function createTokenSimulation(process: Process): TokenSimulation {
  let tokens: Record<string, number> = {};
  let joinWait: Record<string, Record<string, number>> = {};
  let completed: Record<string, number> = {};
  const queue: Array<{ nodeId: string; via: string }> = [];
  let draining = false;

  function snapshot(): SimSnapshot {
    const wait: Record<string, Record<string, number>> = {};
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
    while (queue.length) {
      const next = queue.shift();
      if (next) arrive(next.nodeId, next.via);
    }
    draining = false;
  }

  function arrive(nodeId: string, via: string): void {
    const node = getNode(process, nodeId);
    if (node.type === 'end') {
      bump(completed, nodeId);
      return;
    }
    if (node.type === 'parallelGateway') {
      const ins = incomingFlows(process, nodeId);
      const outs = outgoingFlows(process, nodeId);
      if (ins.length > 1) {
        const buf = (joinWait[nodeId] ??= {});
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

  return {
    snapshot,
    reset() {
      tokens = {};
      joinWait = {};
      completed = {};
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
  if ((snap.tokens[elementId] ?? 0) > 0) {
    const parked = getNode(process, elementId);
    const outs = outgoingFlows(process, elementId);
    if (isChoiceGateway(parked.type) && outs.length > 1) {
      return null;
    }
    return { nodeId: elementId };
  }
  const flow = process.flows.find((f) => f.id === elementId);
  if (!flow) return null;
  const source = getNode(process, flow.source);
  if (isChoiceGateway(source.type) && (snap.tokens[flow.source] ?? 0) > 0) {
    return { nodeId: flow.source, flowId: flow.id };
  }
  return null;
}

export function describeSimulation(process: Process, snap: SimSnapshot): string {
  const parked = Object.keys(snap.tokens);
  const needsChoice = parked.some((id) => {
    const node = process.nodes.find((n) => n.id === id);
    return node && isChoiceGateway(node.type) && outgoingFlows(process, id).length > 1;
  });
  if (needsChoice) return 'Choose one outgoing sequence flow';
  if (Object.keys(snap.joinWait).length) return 'Parallel join waiting for all incoming';
  if (parked.length) return 'Click an element with a token';
  const done = completedCount(snap);
  if (done) return `Completed · ${done} at end`;
  return 'Click a start event';
}
