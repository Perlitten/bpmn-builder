import { simulationLock } from './simulate/simulationLock';

export type EditorTool = 'select' | 'pan';

type DiagramNode = {
  type?: string;
  parent?: unknown;
  waypoints?: unknown;
};

type MouseDownEvent = {
  element?: DiagramNode;
  originalEvent?: MouseEvent;
};

type LassoTool = {
  isActive: () => boolean;
  activateLasso: (event: MouseEvent, autoActivate?: boolean) => void;
};

type HandTool = {
  isActive: () => boolean;
  activateMove: (event: MouseEvent, autoActivate?: boolean) => void;
};

type EventBus = {
  on: (event: string, priority: number, cb: (event: MouseDownEvent) => unknown) => void;
};

/** Canvas root only. Pools and lanes must stay clickable so Select can hit the header band. */
export function isMarqueeSurface(element: DiagramNode | null | undefined): boolean {
  if (!element || element.waypoints || element.type === 'label') return false;
  if (!element.parent) return true;
  return element.type === 'bpmn:Process' || element.type === 'bpmn:Collaboration';
}

export function onSelectMarqueeDown(
  event: MouseDownEvent,
  getTool: () => EditorTool,
  lassoTool: LassoTool,
  handTool: HandTool,
): true | undefined {
  const original = event.originalEvent;
  if (!original || original.button !== 0) return;
  if (handTool.isActive()) return;
  if (getTool() === 'pan') {
    handTool.activateMove(original, true);
    return true;
  }
  if (lassoTool.isActive() || !isMarqueeSurface(event.element)) return;
  lassoTool.activateLasso(original, true);
  return true;
}

function SelectMarquee(
  eventBus: EventBus,
  lassoTool: LassoTool,
  handTool: HandTool,
  getTool: () => EditorTool,
) {
  eventBus.on('element.mousedown', 1400, (event) => {
    if (simulationLock.on) return;
    return onSelectMarqueeDown(event, getTool, lassoTool, handTool);
  });
}

SelectMarquee.$inject = ['eventBus', 'lassoTool', 'handTool', 'selectMarqueeTool'];

export function createSelectMarqueeModule(getTool: () => EditorTool) {
  return {
    __init__: ['selectMarquee'],
    selectMarqueeTool: ['value', getTool],
    selectMarquee: ['type', SelectMarquee],
  };
}
