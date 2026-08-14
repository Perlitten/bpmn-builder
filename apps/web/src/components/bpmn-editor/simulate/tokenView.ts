import { incomingFlows, type Process } from '@bpmn/semantic-core';
import { simulationMarks, type SimSnapshot } from '@bpmn/simulate';

const OVERLAY = 'token-sim';
const CHOICE = 'sim-choice';
const CLICK = 'sim-click';

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
  let marked: Array<{ id: string; marker: string }> = [];

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
    for (const { id, marker } of marked) {
      try {
        c.removeMarker(id, marker);
      } catch {
        /* element gone */
      }
    }
    marked = [];
  }

  function mark(id: string, marker: string): void {
    try {
      canvas().addMarker(id, marker);
      marked.push({ id, marker });
    } catch {
      /* not on diagram */
    }
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
      const marks = simulationMarks(process, snap);
      for (const id of marks.click) mark(id, CLICK);
      for (const id of marks.choice) mark(id, CHOICE);
    },
  };
}

export type TokenView = ReturnType<typeof createTokenView>;
