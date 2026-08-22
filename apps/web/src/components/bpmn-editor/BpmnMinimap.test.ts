import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BpmnMinimap, LARGE_DIAGRAM_SHAPES, diagramBounds } from './BpmnMinimap';

const item = (index: number) => ({
  id: `Task_${index}`,
  name: `Task ${index}`,
  type: 'task',
  x: index * 10,
  y: 0,
  width: 8,
  height: 6,
});

describe('large-diagram minimap', () => {
  it('computes model bounds without depending on DOM geometry', () => {
    expect(diagramBounds([item(0), item(2)])).toEqual({ x: 0, y: 0, width: 28, height: 6 });
  });

  it('appears only above the shared 300-shape threshold', () => {
    const hidden = renderToStaticMarkup(createElement(BpmnMinimap, {
      items: Array.from({ length: LARGE_DIAGRAM_SHAPES }, (_, index) => item(index)),
      onNavigate: () => undefined,
    }));
    const shown = renderToStaticMarkup(createElement(BpmnMinimap, {
      items: Array.from({ length: LARGE_DIAGRAM_SHAPES + 1 }, (_, index) => item(index)),
      viewport: { x: 0, y: 0, width: 100, height: 100 },
      onNavigate: () => undefined,
    }));
    expect(hidden).toBe('');
    expect(shown).toContain('aria-label="Diagram minimap"');
    expect(shown).toContain('bpmn-minimap-viewport');
  });
});
