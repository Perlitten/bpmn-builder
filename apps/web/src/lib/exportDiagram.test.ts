import { describe, expect, it } from 'vitest';
import {
  DIAGRAM_EXPORT_PADDING,
  isSvgMarkup,
  modelBoundsFromViewbox,
  padBox,
  pdfPageSize,
  prepareDiagramSvg,
} from './exportDiagram';

const croppedSvg =
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="500 0 400 300" version="1.1">' +
  '<g class="viewport"><rect x="0" y="0" width="1400" height="220"/></g></svg>';

describe('modelBoundsFromViewbox', () => {
  it('uses inner model bounds, not the cropped viewport', () => {
    expect(
      modelBoundsFromViewbox({
        x: 400,
        y: 0,
        width: 800,
        height: 600,
        inner: { x: 0, y: 0, width: 1400, height: 220 },
      }),
    ).toEqual({ x: 0, y: 0, width: 1400, height: 220 });
  });
});

describe('prepareDiagramSvg', () => {
  it('produces SVG covering the full process plus padding', () => {
    const model = { x: 10, y: 20, width: 200, height: 80 };
    const svg = prepareDiagramSvg(croppedSvg, model, 32);
    expect(isSvgMarkup(svg)).toBe(true);
    expect(svg).toContain('viewBox="-22 -12 264 144"');
    expect(svg).toMatch(/<svg[^>]*width="264"/);
    expect(svg).toMatch(/<svg[^>]*height="144"/);
    expect(svg).not.toContain('viewBox="500 0 400 300"');
    expect(svg).toContain('data-export-bg="true"');
  });

  it('falls back to the SVG viewBox when model bounds are missing', () => {
    const svg = prepareDiagramSvg(croppedSvg, null, DIAGRAM_EXPORT_PADDING);
    const padded = padBox({ x: 500, y: 0, width: 400, height: 300 }, DIAGRAM_EXPORT_PADDING);
    expect(svg).toContain(`viewBox="${padded.x} ${padded.y} ${padded.width} ${padded.height}"`);
  });
});

describe('pdfPageSize', () => {
  it('keeps page size in SVG units', () => {
    expect(pdfPageSize({ x: 0, y: 0, width: 800, height: 400 })).toEqual({ width: 800, height: 400 });
  });
});
