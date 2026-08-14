type MoveShape = { type?: string };
type EventBus = {
  on: (
    event: string | string[],
    priority: number,
    cb: (payload: { action?: string; context?: { shape?: MoveShape; shapes?: MoveShape[] } }) => unknown,
  ) => void;
};

/** Free-form geometry is not source of truth. Task move is allowed so drag can mean semantic reorder. */
const BLOCKED_COMMANDS = [
  'shape.resize',
  'connection.create',
  'connection.updateWaypoints',
  'connection.reconnect',
  'shape.rotate',
];

/** bpmn-js leftover tools: Space (S), Lasso-as-tool (L), Global Connect (C), DI copy/paste. */
export const BLOCKED_EDITOR_ACTIONS = new Set([
  'spaceTool',
  'lassoTool',
  'globalConnectTool',
  'copy',
  'paste',
  'cut',
  'duplicate',
]);

function geometryOnly(type: string | undefined): boolean {
  if (!type || type === 'label') return true;
  if (type === 'bpmn:StartEvent' || type === 'bpmn:EndEvent' || type === 'bpmn:SequenceFlow') return true;
  return type.includes('Gateway');
}

function SemanticGeometryRules(eventBus: EventBus) {
  for (const command of BLOCKED_COMMANDS) {
    eventBus.on(`commandStack.${command}.canExecute`, 5000, () => false);
  }
  eventBus.on('commandStack.shape.move.canExecute', 5000, (event) => {
    if (geometryOnly(event.context?.shape?.type)) return false;
  });
  eventBus.on('commandStack.elements.move.canExecute', 5000, (event) => {
    if ((event.context?.shapes ?? []).some((shape) => geometryOnly(shape.type))) return false;
  });
  eventBus.on('editorActions.allowed', 5000, (event) => {
    if (event.action && BLOCKED_EDITOR_ACTIONS.has(event.action)) return false;
  });
}

SemanticGeometryRules.$inject = ['eventBus'];

export type LabelBox = { x: number; y: number; width: number; height: number };

/** bpmn-js TextRenderer shrinks labels to glyph bounds; keep exported DI as the minimum. */
export function keepDiLabelBounds(di: LabelBox, fitted: LabelBox): LabelBox {
  return {
    x: di.x,
    y: di.y,
    width: Math.max(di.width, fitted.width),
    height: Math.max(di.height, fitted.height),
  };
}

function KeepDiLabelSize(textRenderer: {
  getExternalLabelBounds: (bounds: LabelBox, text: string) => LabelBox;
}) {
  const orig = textRenderer.getExternalLabelBounds.bind(textRenderer);
  textRenderer.getExternalLabelBounds = (bounds, text) => keepDiLabelBounds(bounds, orig(bounds, text));
}

KeepDiLabelSize.$inject = ['textRenderer'];

export const semanticGeometryModule = {
  __init__: ['semanticGeometryRules', 'keepDiLabelSize'],
  semanticGeometryRules: ['type', SemanticGeometryRules],
  keepDiLabelSize: ['type', KeepDiLabelSize],
};
