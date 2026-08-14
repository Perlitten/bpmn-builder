import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createSelectMarqueeModule,
  isMarqueeSurface,
  onSelectMarqueeDown,
} from './selectMarquee';

describe('select marquee', () => {
  it('treats empty process / pool as a box-select surface, not a task', () => {
    expect(isMarqueeSurface({ type: 'bpmn:Process' })).toBe(true);
    expect(isMarqueeSurface({ type: 'bpmn:Participant', parent: {} })).toBe(true);
    expect(isMarqueeSurface({ type: 'bpmn:Task', parent: {} })).toBe(false);
    expect(isMarqueeSurface({ type: 'bpmn:SequenceFlow', waypoints: [] })).toBe(false);
  });

  it('Select on empty canvas starts lasso; Pan pans; task drag is left alone', () => {
    const lasso = { isActive: () => false, activateLasso: vi.fn() };
    const hand = { isActive: () => false, activateMove: vi.fn() };
    const mouse = { button: 0 } as MouseEvent;
    const root = { element: { type: 'bpmn:Process' }, originalEvent: mouse };
    const task = { element: { type: 'bpmn:Task', parent: {} }, originalEvent: mouse };

    expect(onSelectMarqueeDown(root, () => 'select', lasso, hand)).toBe(true);
    expect(lasso.activateLasso).toHaveBeenCalledWith(mouse, true);
    expect(hand.activateMove).not.toHaveBeenCalled();

    lasso.activateLasso.mockClear();
    expect(onSelectMarqueeDown(root, () => 'pan', lasso, hand)).toBe(true);
    expect(hand.activateMove).toHaveBeenCalledWith(mouse, true);
    expect(lasso.activateLasso).not.toHaveBeenCalled();

    hand.activateMove.mockClear();
    expect(onSelectMarqueeDown(task, () => 'select', lasso, hand)).toBeUndefined();
    expect(lasso.activateLasso).not.toHaveBeenCalled();
    expect(hand.activateMove).not.toHaveBeenCalled();
  });

  it('does not restore Space Tool or global connect', () => {
    const src = readFileSync(new URL('./selectMarquee.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/spaceTool/);
    expect(src).not.toMatch(/globalConnect/);
    expect(createSelectMarqueeModule(() => 'select').__init__).toEqual(['selectMarquee']);
  });

  it('shows the marquee overlay and keeps Space Tool hidden', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.djs-lasso-overlay \{[^}]*stroke: var\(--color-accent\)/s);
    expect(css).not.toMatch(/\.djs-lasso-overlay,\s*\n\.bpmn-editor-stage \.djs-lasso-overlay \{\s*\n\s*display: none/s);
    expect(css).toMatch(/\.djs-space-tool,\s*\n\.bpmn-editor-stage \.djs-space-tool \{\s*\n\s*display: none/s);
  });
});
