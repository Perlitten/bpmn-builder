/** Task types whose top-left glyph would collide with a centered label. */
export const TYPED_TASK_TYPES = [
  'bpmn:UserTask',
  'bpmn:ServiceTask',
  'bpmn:ScriptTask',
  'bpmn:ManualTask',
  'bpmn:BusinessRuleTask',
  'bpmn:SendTask',
  'bpmn:ReceiveTask',
] as const;

export type TypedTaskType = (typeof TYPED_TASK_TYPES)[number];

/** bpmn-js embedded labels use padding 7; extra left inset clears the type glyph. */
export const TYPED_TASK_LABEL_PADDING = {
  top: 7,
  right: 7,
  bottom: 7,
  left: 22,
} as const;

export type TextPaintOptions = {
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
};

export function withTypedTaskLabelPadding<T extends TextPaintOptions>(options: T, active: boolean): T {
  if (!active) return options;
  return { ...options, padding: { ...TYPED_TASK_LABEL_PADDING } };
}

export function isTypedTaskType(type: string | undefined): type is TypedTaskType {
  return !!type && (TYPED_TASK_TYPES as readonly string[]).includes(type);
}

type Handler = (parentGfx: unknown, element: unknown, attrs?: unknown) => unknown;

type GfxNode = {
  tagName?: string;
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
};

/** Knock out opaque task-fill on type glyphs; keep stroke-colored head/envelope fills. */
export function clearMatchingTaskMarkerFills(parentGfx: { children?: ArrayLike<GfxNode> } | null | undefined): void {
  const kids = parentGfx?.children;
  if (!kids || kids.length < 2) return;
  const body = kids[0];
  if (!body?.getAttribute || body.tagName?.toLowerCase() !== 'path') return;
  const fill = body.getAttribute('fill');
  if (!fill) return;
  for (let i = 1; i < kids.length; i += 1) {
    const node = kids[i];
    const tag = node?.tagName?.toLowerCase();
    if (tag !== 'path' && tag !== 'circle') continue;
    if (node.getAttribute?.('data-marker')) continue;
    if (node.getAttribute?.('fill') !== fill) continue;
    node.setAttribute?.('fill', 'none');
  }
}

export function installTypedTaskLabelPad(
  bpmnRenderer: { handlers: Record<string, Handler> },
  textRenderer: { createText: (text: string, options?: TextPaintOptions) => unknown },
): void {
  const origCreate = textRenderer.createText.bind(textRenderer);
  let inset = false;
  textRenderer.createText = (text, options) => origCreate(text, withTypedTaskLabelPadding(options ?? {}, inset));

  for (const type of TYPED_TASK_TYPES) {
    const orig = bpmnRenderer.handlers[type];
    if (!orig) continue;
    bpmnRenderer.handlers[type] = function typedTaskLabel(parentGfx, element, attrs) {
      inset = true;
      try {
        const drawn = orig(parentGfx, element, attrs);
        clearMatchingTaskMarkerFills(parentGfx as { children?: ArrayLike<GfxNode> });
        return drawn;
      } finally {
        inset = false;
      }
    };
  }
}

function TypedTaskLabelPad(
  bpmnRenderer: { handlers: Record<string, Handler> },
  textRenderer: { createText: (text: string, options?: TextPaintOptions) => unknown },
) {
  installTypedTaskLabelPad(bpmnRenderer, textRenderer);
}

TypedTaskLabelPad.$inject = ['bpmnRenderer', 'textRenderer'];

export const typedTaskPaintModule = {
  __init__: ['typedTaskLabelPad'],
  typedTaskLabelPad: ['type', TypedTaskLabelPad],
};
