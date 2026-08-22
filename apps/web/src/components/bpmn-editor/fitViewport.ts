import { MOBILE_PALETTE_BAR, PALETTE_RAIL_WIDTH, ZOOM_CONTROLS_SIZE } from './layoutMetrics';

export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type Box = { x: number; y: number; width: number; height: number };

export type FitPadding = { top: number; right: number; bottom: number; left: number };

export const FIT_GUTTER = 24;
export const FIT_MIN_VIEW = 80;

/** Fallback when the canvas is full-bleed under the token-aligned rail. */
export const DESKTOP_FIT_PADDING: FitPadding = {
  top: FIT_GUTTER,
  right: FIT_GUTTER,
  bottom: ZOOM_CONTROLS_SIZE + 8,
  left: PALETTE_RAIL_WIDTH + FIT_GUTTER,
};

/** Fallback when the catalog rail docks as a bottom strip. */
export const COMPACT_FIT_PADDING: FitPadding = {
  top: FIT_GUTTER,
  right: FIT_GUTTER,
  bottom: MOBILE_PALETTE_BAR + FIT_GUTTER,
  left: FIT_GUTTER,
};

type FitCanvas = {
  resized: () => void;
  viewbox: (next?: Box & { scale?: number }) => Box & {
    inner?: Box;
    outer?: { width: number; height: number };
  };
};

export function rect(left: number, top: number, right: number, bottom: number): Rect {
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function fromDomRect(r: { left: number; top: number; right: number; bottom: number }): Rect {
  return rect(r.left, r.top, r.right, r.bottom);
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function intersection(a: Rect, b: Rect): Rect | null {
  if (!intersects(a, b)) return null;
  return rect(Math.max(a.left, b.left), Math.max(a.top, b.top), Math.min(a.right, b.right), Math.min(a.bottom, b.bottom));
}

function area(r: Rect): number {
  return r.width * r.height;
}

/** Cut `avail` so it no longer overlaps `obstacle`, keeping the largest leftover rectangle. */
export function cutAround(avail: Rect, obstacle: Rect): Rect {
  const hit = intersection(avail, obstacle);
  if (!hit) return avail;
  const candidates: Rect[] = [];
  if (hit.left > avail.left) candidates.push(rect(avail.left, avail.top, hit.left, avail.bottom));
  if (hit.right < avail.right) candidates.push(rect(hit.right, avail.top, avail.right, avail.bottom));
  if (hit.top > avail.top) candidates.push(rect(avail.left, avail.top, avail.right, hit.top));
  if (hit.bottom < avail.bottom) candidates.push(rect(avail.left, hit.bottom, avail.right, avail.bottom));
  if (!candidates.length) return avail;
  return candidates.reduce((best, next) => (area(next) > area(best) ? next : best));
}

export function remainingCanvas(canvas: Rect, obstacles: Rect[]): Rect {
  return obstacles.reduce(cutAround, canvas);
}

export function paddingFromRemaining(canvas: Rect, remaining: Rect, gutter = FIT_GUTTER): FitPadding {
  const pad: FitPadding = {
    left: Math.max(0, remaining.left - canvas.left) + gutter,
    top: Math.max(0, remaining.top - canvas.top) + gutter,
    right: Math.max(0, canvas.right - remaining.right) + gutter,
    bottom: Math.max(0, canvas.bottom - remaining.bottom) + gutter,
  };
  const maxX = Math.max(0, canvas.width - FIT_MIN_VIEW);
  const maxY = Math.max(0, canvas.height - FIT_MIN_VIEW);
  if (pad.left + pad.right > maxX) {
    const scale = maxX / (pad.left + pad.right || 1);
    pad.left *= scale;
    pad.right *= scale;
  }
  if (pad.top + pad.bottom > maxY) {
    const scale = maxY / (pad.top + pad.bottom || 1);
    pad.top *= scale;
    pad.bottom *= scale;
  }
  return pad;
}

/**
 * Left rail overlapping the canvas, or the contract rail width when the canvas is full-bleed
 * and we could not measure the rail. A measured sibling or bottom bar is not an obstacle.
 */
export function paletteObstacle(canvas: Rect, stage: Rect | null, palette: Rect | null): Rect | null {
  if (palette) return intersects(canvas, palette) ? palette : null;
  if (!stage || canvas.left - stage.left < 8) {
    return rect(canvas.left, canvas.top, canvas.left + PALETTE_RAIL_WIDTH, canvas.bottom);
  }
  return null;
}

export function fitViewbox(inner: Box, outer: { width: number; height: number }, pad: FitPadding): Box | null {
  if (inner.width <= 0 || inner.height <= 0 || outer.width <= 0 || outer.height <= 0) return null;
  const availW = Math.max(1, outer.width - pad.left - pad.right);
  const availH = Math.max(1, outer.height - pad.top - pad.bottom);
  const scale = Math.min(1, availW / inner.width, availH / inner.height);
  const originX = pad.left + (availW - inner.width * scale) / 2;
  const originY = pad.top + (availH - inner.height * scale) / 2;
  return {
    x: inner.x - originX / scale,
    y: inner.y - originY / scale,
    width: outer.width / scale,
    height: outer.height / scale,
  };
}

export function diagramToScreenX(diagramX: number, viewbox: Box, outerWidth: number): number {
  return (diagramX - viewbox.x) * (outerWidth / viewbox.width);
}

export function diagramToScreenY(diagramY: number, viewbox: Box, outerHeight: number): number {
  return (diagramY - viewbox.y) * (outerHeight / viewbox.height);
}

function elementRect(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return fromDomRect(r);
}

export function collectFitObstacles(host: HTMLElement): Rect[] {
  const canvas = elementRect(host);
  if (!canvas) return [];
  const stage = host.closest('.bpmn-editor-stage');
  const doc = host.ownerDocument;
  const obstacles: Rect[] = [];
  const pal = paletteObstacle(canvas, elementRect(stage), elementRect(stage?.querySelector('.palette-rail') ?? null));
  if (pal) obstacles.push(pal);
  const zoom = elementRect(host.querySelector('.bpmn-zoom-controls'));
  if (zoom) obstacles.push(zoom);
  const inspector = elementRect(stage?.querySelector('.element-inspector') ?? null);
  if (inspector && intersects(canvas, inspector)) obstacles.push(inspector);
  // Architect is a real editing surface, not a decoration: when open it must
  // be excluded from the fit area even if the user dragged it over the canvas.
  const architect = elementRect(doc.querySelector('.architect-shell.is-open'));
  if (architect && intersects(canvas, architect)) obstacles.push(architect);
  return obstacles;
}

export function resolveFitPadding(fallback: FitPadding, host?: HTMLElement | null): FitPadding {
  if (!host) return fallback;
  const box = fromDomRect(host.getBoundingClientRect());
  if (box.width < 1 || box.height < 1) return fallback;
  return paddingFromRemaining(box, remainingCanvas(box, collectFitObstacles(host)));
}

export function panViewbox(
  viewbox: Box,
  outer: { width: number; height: number },
  shape: Box,
  pad: FitPadding,
  gutter = FIT_GUTTER,
): Box {
  if (outer.width <= 0 || viewbox.width <= 0) return viewbox;
  const scale = outer.width / viewbox.width;
  const visLeft = viewbox.x + pad.left / scale;
  const visTop = viewbox.y + pad.top / scale;
  const visRight = viewbox.x + (outer.width - pad.right) / scale;
  const visBottom = viewbox.y + (outer.height - pad.bottom) / scale;
  const margin = gutter / scale;
  let dx = 0;
  let dy = 0;
  if (shape.x < visLeft) dx = shape.x - visLeft - margin;
  else if (shape.x + shape.width > visRight) dx = shape.x + shape.width - visRight + margin;
  if (shape.y < visTop) dy = shape.y - visTop - margin;
  else if (shape.y + shape.height > visBottom) dy = shape.y + shape.height - visBottom + margin;
  if (!dx && !dy) return viewbox;
  return { ...viewbox, x: viewbox.x + dx, y: viewbox.y + dy };
}

export function panCanvasToShape(canvas: FitCanvas, shape: Box, host?: HTMLElement | null): void {
  let vb: ReturnType<FitCanvas['viewbox']>;
  try {
    vb = canvas.viewbox();
  } catch {
    return;
  }
  const outer = vb.outer;
  if (!outer) return;
  const next = panViewbox(
    { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
    outer,
    shape,
    resolveFitPadding(DESKTOP_FIT_PADDING, host),
  );
  try {
    canvas.viewbox(next);
  } catch {
    /* canvas not ready */
  }
}

export function applyFit(canvas: FitCanvas, padding: FitPadding = DESKTOP_FIT_PADDING, host?: HTMLElement | null): boolean {
  try {
    canvas.resized();
  } catch {
    return false;
  }
  let vb: ReturnType<FitCanvas['viewbox']>;
  try {
    vb = canvas.viewbox();
  } catch {
    return false;
  }
  const inner = vb.inner;
  const outer = vb.outer;
  if (!inner || !outer) return false;
  const next = fitViewbox(inner, outer, resolveFitPadding(padding, host));
  if (!next) return false;
  try {
    canvas.viewbox(next);
    return true;
  } catch {
    return false;
  }
}

export function fitCanvasToChrome(canvas: FitCanvas, host: HTMLElement): boolean {
  return applyFit(canvas, DESKTOP_FIT_PADDING, host);
}
