import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BpmnSchematic } from './BpmnSchematic';

const nodes = [
  { id: 'start', type: 'startEvent', label: 'Start', x: 0, y: 0 },
  { id: 'task', type: 'task', label: 'Review request', x: 90, y: 0 },
];

describe('BpmnSchematic collaboration preview', () => {
  it('labels a multi-pool thumbnail as a sequence-flow preview instead of inventing a pool layout', () => {
    const html = renderToStaticMarkup(createElement(BpmnSchematic, {
      preview: {
        caption: 'Customer request',
        participants: 2,
        lanes: 3,
        messageFlows: 2,
        boundaryEvents: 1,
        nodes,
        edges: [{ source: 'start', target: 'task' }],
      },
    }));

    expect(html).toContain('Sequence-flow preview; collaboration: 2 pools · 3 lanes · 2 message flows · 1 boundary event');
    expect(html).toContain('2 pools · 3 lanes · 2 message flows · 1 boundary event');
    // Task rect plus the summary strip; no extra rect must pretend to be a shared pool.
    expect((html.match(/<rect /g) ?? [])).toHaveLength(2);
  });

  it('draws a pool boundary only when the aggregate data proves there is one pool', () => {
    const html = renderToStaticMarkup(createElement(BpmnSchematic, {
      preview: {
        caption: 'Internal approval',
        participants: 1,
        lanes: 2,
        nodes,
        edges: [{ source: 'start', target: 'task' }],
      },
    }));

    // Task rect, collaboration strip, and one genuine pool boundary.
    expect((html.match(/<rect /g) ?? [])).toHaveLength(3);
    expect(html).toContain('Sequence-flow preview; collaboration: 1 pool · 2 lanes');
  });
});
