import { describe, expect, it } from 'vitest';
import { PALETTE_RAIL_WIDTH } from './layoutMetrics';
import {
  DESKTOP_FIT_PADDING,
  FIT_GUTTER,
  cutAround,
  diagramToScreenX,
  diagramToScreenY,
  fitViewbox,
  paddingFromRemaining,
  paletteObstacle,
  panViewbox,
  rect,
  remainingCanvas,
} from './fitViewport';

const canvas = rect(0, 0, 1000, 600);
const starter = { x: 180, y: 80, width: 286, height: 80 };

describe('paletteObstacle', () => {
  it('uses the measured rail when it overlaps the canvas', () => {
    const pal = rect(0, 0, PALETTE_RAIL_WIDTH, 600);
    expect(paletteObstacle(canvas, canvas, pal)).toEqual(pal);
  });

  it('does not subtract the rail width when the rail is a sibling of the canvas', () => {
    const pal = rect(0, 0, PALETTE_RAIL_WIDTH, 600);
    const host = rect(PALETTE_RAIL_WIDTH, 0, 1000, 600);
    const stage = rect(0, 0, 1000, 600);
    expect(paletteObstacle(host, stage, pal)).toBeNull();
  });

  it('synthesizes the contract rail strip when the canvas is flush with the stage', () => {
    const stage = rect(0, 48, 1000, 648);
    const host = rect(0, 48, 1000, 648);
    expect(paletteObstacle(host, stage, null)).toEqual(rect(0, 48, PALETTE_RAIL_WIDTH, 648));
  });

  it('does not invent a left rail when the catalog is a bottom bar', () => {
    const pal = rect(0, 588, 390, 644);
    const host = rect(0, 0, 390, 588);
    const stage = rect(0, 0, 390, 644);
    expect(paletteObstacle(host, stage, pal)).toBeNull();
  });
});

describe('remainingCanvas', () => {
  it('cuts the left strip for a full-height palette', () => {
    const remaining = remainingCanvas(canvas, [rect(0, 0, PALETTE_RAIL_WIDTH, 600)]);
    expect(remaining.left).toBe(PALETTE_RAIL_WIDTH);
    expect(remaining.width).toBe(1000 - PALETTE_RAIL_WIDTH);
  });

  it('cuts the shorter zoom footprint from the bottom, not a 140px left inset', () => {
    const afterPalette = remainingCanvas(canvas, [rect(0, 0, PALETTE_RAIL_WIDTH, 600)]);
    const zoom = rect(84, 548, 228, 588);
    const remaining = remainingCanvas(afterPalette, [zoom]);
    expect(remaining.left).toBe(PALETTE_RAIL_WIDTH);
    expect(remaining.bottom).toBe(548);
    expect(remaining.width).toBe(1000 - PALETTE_RAIL_WIDTH);
  });

  it('keeps the larger leftover when Architect sits on the bottom-right', () => {
    const remaining = remainingCanvas(canvas, [rect(720, 360, 1000, 600)]);
    expect(remaining.width * remaining.height).toBeGreaterThan(700 * 350);
    expect(remaining.right === 720 || remaining.bottom === 360).toBe(true);
  });
});

describe('DESKTOP_FIT_PADDING', () => {
  it('subtracts the palette rail in the fallback padding', () => {
    expect(DESKTOP_FIT_PADDING.left).toBeGreaterThanOrEqual(PALETTE_RAIL_WIDTH);
  });
});

describe('cutAround', () => {
  it('ignores obstacles that miss the canvas', () => {
    expect(cutAround(canvas, rect(1200, 0, 1400, 100))).toEqual(canvas);
  });
});

describe('fitViewbox', () => {
  it('places the start event to the right of the palette padding', () => {
    const remaining = remainingCanvas(canvas, [rect(0, 0, PALETTE_RAIL_WIDTH, 600)]);
    const pad = paddingFromRemaining(canvas, remaining);
    expect(pad.left).toBe(PALETTE_RAIL_WIDTH + FIT_GUTTER);
    const vb = fitViewbox(starter, { width: 1000, height: 600 }, pad);
    expect(vb).not.toBeNull();
    const startScreenX = diagramToScreenX(starter.x, vb!, 1000);
    const startScreenY = diagramToScreenY(starter.y, vb!, 600);
    expect(startScreenX).toBeGreaterThanOrEqual(pad.left - 0.5);
    expect(startScreenY).toBeGreaterThanOrEqual(pad.top - 0.5);
    expect(diagramToScreenX(starter.x + starter.width, vb!, 1000)).toBeLessThanOrEqual(1000 - pad.right + 0.5);
  });

  it('does not zoom in past 100%', () => {
    const pad = { top: 24, right: 24, bottom: 24, left: 96 };
    const vb = fitViewbox(starter, { width: 1000, height: 600 }, pad)!;
    expect(1000 / vb.width).toBeLessThanOrEqual(1);
  });

  it('returns null for an empty diagram', () => {
    expect(fitViewbox({ x: 0, y: 0, width: 0, height: 0 }, { width: 1000, height: 600 }, { top: 0, right: 0, bottom: 0, left: 0 })).toBeNull();
  });

  it('keeps Start→End inside a 390px remaining canvas', () => {
    const outer = { width: 390, height: 640 };
    const pad = { top: 16, right: 16, bottom: 56, left: 16 };
    const vb = fitViewbox(starter, outer, pad)!;
    expect(diagramToScreenX(starter.x, vb, outer.width)).toBeGreaterThanOrEqual(pad.left - 0.5);
    expect(diagramToScreenX(starter.x + starter.width, vb, outer.width)).toBeLessThanOrEqual(outer.width - pad.right + 0.5);
  });

  it('centers a small diagram in the remaining canvas', () => {
    const remaining = remainingCanvas(canvas, [rect(0, 0, 72, 600)]);
    const pad = paddingFromRemaining(canvas, remaining);
    const vb = fitViewbox(starter, { width: 1000, height: 600 }, pad)!;
    const midX = diagramToScreenX(starter.x + starter.width / 2, vb, 1000);
    const midY = diagramToScreenY(starter.y + starter.height / 2, vb, 600);
    expect(midX).toBeCloseTo(pad.left + (1000 - pad.left - pad.right) / 2, 5);
    expect(midY).toBeCloseTo(pad.top + (600 - pad.top - pad.bottom) / 2, 5);
  });
});

describe('panViewbox', () => {
  it('pans right so a shape past the inspector is visible', () => {
    const vb = { x: 0, y: 0, width: 1000, height: 600 };
    const next = panViewbox(vb, { width: 1000, height: 600 }, { x: 900, y: 80, width: 120, height: 72 }, {
      top: 24,
      right: 280,
      bottom: 24,
      left: 96,
    });
    expect(next.x).toBeGreaterThan(vb.x);
    expect(next.y).toBe(vb.y);
  });
});
