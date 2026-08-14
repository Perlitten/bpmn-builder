import { exportProcessXml, xmlToProcess } from '@bpmn/bpmn-adapter';
import { layoutProcess } from '@bpmn/layout-engine';
import { addTask, createProcess, splitExclusive } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BPMN_XML } from '../components/bpmn-editor/defaultBpmnXml';
import { layoutToSvg, previewLayoutSvg } from './layoutPreview';

function count(svg: string, tag: string): number {
  return svg.split(`<${tag} `).length - 1;
}

function polylinePoints(svg: string): { x: number; y: number }[][] {
  const re = /<polyline points="([^"]+)"/g;
  const out: { x: number; y: number }[][] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(svg))) {
    out.push(
      match[1]!.split(' ').map((pair) => {
        const [x, y] = pair.split(',').map(Number);
        return { x: x!, y: y! };
      }),
    );
  }
  return out;
}

function polylinesOrthogonal(svg: string): boolean {
  const lines = polylinePoints(svg);
  if (!lines.length) return false;
  for (const pts of lines) {
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (a.x !== b.x && a.y !== b.y) return false;
    }
  }
  return true;
}

function hasVerticalSegment(svg: string): boolean {
  return polylinePoints(svg).some((pts) =>
    pts.some((b, i) => i > 0 && pts[i - 1]!.x === b.x && pts[i - 1]!.y !== b.y),
  );
}

function xorXml(): string {
  let process = createProcess();
  process = addTask(process, { name: 'A' }).process;
  process = splitExclusive(process, { after: process.nodes.find((n) => n.name === 'A')!.id }).process;
  const yes = process.regions[0]!.branches[0]!.id;
  const no = process.regions[0]!.branches[1]!.id;
  process = addTask(process, { name: 'YesTask', branchId: yes }).process;
  process = addTask(process, { name: 'NoTask', branchId: no }).process;
  return exportProcessXml(process);
}

describe('layoutToSvg', () => {
  it('paints start circle, task rect, end double-circle, and orthogonal flows from layout bounds', () => {
    let process = createProcess();
    process = addTask(process, { name: 'Task' }).process;
    const layout = layoutProcess(process);
    const start = layout.shapes.StartEvent_1!;
    const svg = layoutToSvg(process, layout);
    expect(svg).toBeTruthy();
    expect(svg).toContain('<rect ');
    expect(svg).toContain('<circle ');
    expect(svg).toContain('<polyline ');
    expect(svg).not.toContain('●');
    expect(count(svg!, 'circle')).toBe(3);
    expect(count(svg!, 'rect')).toBe(1);
    expect(count(svg!, 'polyline')).toBe(2);
    expect(polylinesOrthogonal(svg!)).toBe(true);
    const cx = start.x + start.width / 2;
    expect(svg).toContain(`cx="${cx}"`);
  });

  it('paints gateway diamonds on an XOR', () => {
    let process = createProcess();
    process = addTask(process, { name: 'A' }).process;
    process = splitExclusive(process, { after: process.nodes.find((n) => n.name === 'A')!.id }).process;
    const svg = layoutToSvg(process, layoutProcess(process));
    expect(svg).toContain('<polygon ');
    expect(count(svg!, 'polygon')).toBeGreaterThanOrEqual(2);
    expect(polylinesOrthogonal(svg!)).toBe(true);
  });
});

describe('previewLayoutSvg', () => {
  it('uses layoutProcess(xmlToProcess), not stored DI', async () => {
    const process = await xmlToProcess(DEFAULT_BPMN_XML);
    const layout = layoutProcess(process);
    const start = layout.shapes.StartEvent_1!;
    expect(start.x).not.toBe(180);
    const svg = await previewLayoutSvg(DEFAULT_BPMN_XML);
    expect(svg).toEqual(layoutToSvg(process, layout));
    expect(svg).toContain(`cx="${start.x + start.width / 2}"`);
    expect(svg).not.toMatch(/●──\[Task\]──◎/);
  });

  it('renders XOR as diamonds, stacked rects, circles, and orthogonal polylines', async () => {
    const svg = await previewLayoutSvg(xorXml());
    expect(count(svg!, 'polygon')).toBe(2);
    expect(count(svg!, 'rect')).toBe(3);
    expect(svg).toContain('<circle ');
    expect(polylinesOrthogonal(svg!)).toBe(true);
    expect(hasVerticalSegment(svg!)).toBe(true);
  });

  it('returns null when parse fails so the UI can fall back to ASCII', async () => {
    expect(await previewLayoutSvg('')).toBeNull();
    expect(await previewLayoutSvg('<not-bpmn>')).toBeNull();
  });
});
