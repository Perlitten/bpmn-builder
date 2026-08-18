import { describe, expect, it, vi } from 'vitest';
import {
  clearMatchingTaskMarkerFills,
  installTypedTaskLabelPad,
  isTypedTaskType,
  TYPED_TASK_LABEL_PADDING,
  TYPED_TASK_TYPES,
  typedTaskPaintModule,
  withTypedTaskLabelPadding,
} from './typedTaskPaint';

describe('typed task paint', () => {
  it('insets the wrap box to the right of the type glyph', () => {
    expect(TYPED_TASK_LABEL_PADDING.left).toBeGreaterThan(TYPED_TASK_LABEL_PADDING.right);
    expect(TYPED_TASK_LABEL_PADDING.top).toBe(TYPED_TASK_LABEL_PADDING.bottom);
    expect(withTypedTaskLabelPadding({ padding: 7 }, false)).toEqual({ padding: 7 });
    expect(withTypedTaskLabelPadding({ padding: 7, align: 'center-middle' }, true)).toEqual({
      padding: { ...TYPED_TASK_LABEL_PADDING },
      align: 'center-middle',
    });
  });

  it('covers the bpmn-js typed-task handlers', () => {
    expect(TYPED_TASK_TYPES).toContain('bpmn:UserTask');
    expect(TYPED_TASK_TYPES).toContain('bpmn:ServiceTask');
    expect(isTypedTaskType('bpmn:UserTask')).toBe(true);
    expect(isTypedTaskType('bpmn:Task')).toBe(false);
    expect(isTypedTaskType('bpmn:StartEvent')).toBe(false);
    expect(typedTaskPaintModule.__init__).toEqual(['typedTaskLabelPad']);
  });

  it('applies left inset only while a typed task handler runs', () => {
    const calls: Array<unknown> = [];
    const textRenderer = {
      createText: (_text: string, options?: unknown) => {
        calls.push(options);
        return 'text';
      },
    };
    const user = vi.fn((_parent: unknown, _element: unknown) => {
      textRenderer.createText('Create purchase request', { padding: 7, align: 'center-middle' });
    });
    const bpmnRenderer = {
      handlers: {
        'bpmn:UserTask': user,
        'bpmn:Task': vi.fn(),
      },
    };

    installTypedTaskLabelPad(bpmnRenderer, textRenderer);
    bpmnRenderer.handlers['bpmn:UserTask']({}, {});
    expect(calls[0]).toEqual({
      padding: { ...TYPED_TASK_LABEL_PADDING },
      align: 'center-middle',
    });

    textRenderer.createText('Start', { padding: 7 });
    expect(calls[1]).toEqual({ padding: 7 });
  });

  it('clears marker fills that match the task body, not stroke-colored glyphs', () => {
    const attr = (initial: Record<string, string>) => {
      const store = { ...initial };
      return {
        getAttribute: (name: string) => store[name] ?? null,
        setAttribute: (name: string, value: string) => {
          store[name] = value;
        },
      };
    };
    const body = { tagName: 'path', ...attr({ fill: 'white' }) };
    const torso = { tagName: 'path', ...attr({ fill: 'white' }) };
    const head = { tagName: 'path', ...attr({ fill: 'black' }) };
    const loop = { tagName: 'path', ...attr({ fill: 'white', 'data-marker': 'loop' }) };
    const label = { tagName: 'text', ...attr({ fill: 'black' }) };
    clearMatchingTaskMarkerFills({ children: [body, torso, head, loop, label] });
    expect(torso.getAttribute('fill')).toBe('none');
    expect(head.getAttribute('fill')).toBe('black');
    expect(loop.getAttribute('fill')).toBe('white');
    expect(body.getAttribute('fill')).toBe('white');
  });
});
