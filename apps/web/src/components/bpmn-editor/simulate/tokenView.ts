import { incomingFlows, outgoingFlows, type Process } from '@bpmn/semantic-core';
import type { SimSnapshot } from '@bpmn/simulate';

const OVERLAY = 'token-sim';
const CHOICE = 'sim-choice';

type Overlays = {
  add: (id: string, type: string, spec: { position: { top?: number; right?: number }; html: string }) => unknown;
  remove: (filter: { type: string }) => void;
};

type Canvas = {
  addMarker: (id: string, marker: string) => void;
  removeMarker: (id: string, marker: string) => void;
};

type Modeler = { get: (name: string) => unknown };

export function createTokenView(modeler: Modeler) {
  let marked: string[] = [];

  function overlays(): Overlays {
    return modeler.get('overlays') as Overlays;
  }

  function canvas(): Canvas {
    return modeler.get('canvas') as Canvas;
  }

  function clear(): void {
    try {
      overlays().remove({ type: OVERLAY });
    } catch {
      /* modeler tearing down */
    }
    const c = canvas();
    for (const id of marked) {
      try {
        c.removeMarker(id, CHOICE);
      } catch {
        /* element gone */
      }
    }
    marked = [];
  }

  function addBadge(id: string, text: string): void {
    try {
      overlays().add(id, OVERLAY, {
        position: { top: -8, right: -8 },
        html: `<div class="token-badge">${text}</div>`,
      });
    } catch {
      /* not on diagram */
    }
  }

  return {
    clear,
    sync(process: Process, snap: SimSnapshot) {
      clear();
      for (const [id, count] of Object.entries(snap.tokens)) addBadge(id, String(count));
      for (const [joinId, buf] of Object.entries(snap.joinWait)) {
        const ins = incomingFlows(process, joinId);
        const got = ins.filter((flow) => (buf[flow.id] ?? 0) > 0).length;
        if (got) addBadge(joinId, `${got}/${ins.length}`);
      }
      for (const [id, count] of Object.entries(snap.completed)) {
        if (count) addBadge(id, String(count));
      }
      const c = canvas();
      for (const node of process.nodes) {
        if ((snap.tokens[node.id] ?? 0) < 1) continue;
        if (
          node.type !== 'exclusiveGateway' &&
          node.type !== 'inclusiveGateway' &&
          node.type !== 'eventBasedGateway'
        ) {
          continue;
        }
        const outs = outgoingFlows(process, node.id);
        if (outs.length < 2) continue;
        for (const flow of outs) {
          try {
            c.addMarker(flow.id, CHOICE);
            marked.push(flow.id);
          } catch {
            /* not on diagram */
          }
        }
      }
    },
  };
}

export type TokenView = ReturnType<typeof createTokenView>;
