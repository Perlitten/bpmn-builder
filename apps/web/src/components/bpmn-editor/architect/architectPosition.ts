import {
  ARCHITECT_MARGIN,
  ARCHITECT_PANEL_ESTIMATE_HEIGHT,
  ARCHITECT_PANEL_WIDTH,
  COMPACT_MAX_WIDTH,
  EDITOR_CHROME_HEIGHT,
  EDITOR_INSPECTOR_WIDTH,
  MOBILE_PALETTE_BAR,
  PALETTE_RAIL_WIDTH,
  isCompactViewport,
} from '../layoutMetrics';

export {
  ARCHITECT_MARGIN,
  ARCHITECT_PANEL_ESTIMATE_HEIGHT,
  ARCHITECT_PANEL_WIDTH,
  COMPACT_MAX_WIDTH,
  PALETTE_RAIL_WIDTH,
};

export const ARCHITECT_STORAGE_KEY = 'bpmn.architect.position';
export const ARCHITECT_OPEN_KEY = 'bpmn.architect.open';
export const ARCHITECT_COMPANION_WIDTH = 80;
export const ARCHITECT_COMPANION_HEIGHT = 100;
/** Pointer travel past this (px) is a drag; otherwise the mascot click toggles Architect. */
export const ARCHITECT_DRAG_THRESHOLD_PX = 4;

export type ArchitectSurface = 'editor' | 'list';
export type CompanionMode = 'float' | 'dock' | 'hidden';
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

function between(n: number, a: number, b: number) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.min(hi, Math.max(lo, n));
}

export function isArchitectDragMove(
  dx: number,
  dy: number,
  threshold = ARCHITECT_DRAG_THRESHOLD_PX,
): boolean {
  return dx * dx + dy * dy > threshold * threshold;
}

export function isArchitectClick(dx: number, dy: number, threshold = ARCHITECT_DRAG_THRESHOLD_PX): boolean {
  return !isArchitectDragMove(dx, dy, threshold);
}

/** Skip form controls inside the open panel. The mascot hit target is a div, so it is never ignored. */
export function isArchitectDragIgnoreTarget(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest?.('button, textarea, input, label, a, select'));
}

/** Architect never covers the process list. Compact editor docks; desktop editor floats. */
export function companionMode(surface: ArchitectSurface, compact: boolean): CompanionMode {
  if (surface === 'list') return 'hidden';
  return compact ? 'dock' : 'float';
}

export function listNeedsCompanionClearance(compact: boolean): boolean {
  return companionMode('list', compact) === 'float';
}

export function clampArchitectPosition(
  pos: Point,
  viewport: Size,
  panel: Size,
  surface: ArchitectSurface = 'editor',
): Point {
  const compact = isCompactViewport(viewport.width);
  const desktopEditor = surface === 'editor' && !compact;
  const minX = surface === 'list' || compact ? ARCHITECT_MARGIN : PALETTE_RAIL_WIDTH + ARCHITECT_MARGIN;
  const maxX = viewport.width - panel.width - ARCHITECT_MARGIN - (desktopEditor ? EDITOR_INSPECTOR_WIDTH : 0);
  const minY = desktopEditor ? EDITOR_CHROME_HEIGHT + ARCHITECT_MARGIN : ARCHITECT_MARGIN;
  const bottomReserve = surface === 'editor' && compact ? MOBILE_PALETTE_BAR + ARCHITECT_MARGIN : ARCHITECT_MARGIN;
  return {
    x: maxX < minX ? minX : between(pos.x, minX, maxX),
    y: between(pos.y, minY, viewport.height - panel.height - bottomReserve),
  };
}

/** Desktop editor starts above the canvas, clear of chrome and inspector. */
export function defaultArchitectPosition(
  viewport: Size,
  panel: Size,
  surface: ArchitectSurface = 'editor',
): Point {
  const compact = isCompactViewport(viewport.width);
  const desktopEditor = surface === 'editor' && !compact;
  return clampArchitectPosition(
    {
      x: viewport.width - panel.width - ARCHITECT_MARGIN - (desktopEditor ? EDITOR_INSPECTOR_WIDTH : 0),
      y: desktopEditor ? EDITOR_CHROME_HEIGHT + ARCHITECT_MARGIN : viewport.height - panel.height - ARCHITECT_MARGIN,
    },
    viewport,
    panel,
    surface,
  );
}

function parsePos(raw: string | null): Point | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof value.x !== 'number' || typeof value.y !== 'number') return null;
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
    return { x: value.x, y: value.y };
  } catch {
    return null;
  }
}

export function readArchitectPosition(
  storage: Pick<Storage, 'getItem'>,
  viewport: Size,
  panel: Size,
  surface: ArchitectSurface = 'editor',
): Point {
  const stored = parsePos(storage.getItem(ARCHITECT_STORAGE_KEY));
  if (!stored) return defaultArchitectPosition(viewport, panel, surface);
  return clampArchitectPosition(stored, viewport, panel, surface);
}

export function writeArchitectPosition(storage: Pick<Storage, 'setItem'>, pos: Point): void {
  storage.setItem(ARCHITECT_STORAGE_KEY, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }));
}

export function readArchitectOpen(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(ARCHITECT_OPEN_KEY) === '1';
}

export function writeArchitectOpen(storage: Pick<Storage, 'setItem'>, open: boolean): void {
  storage.setItem(ARCHITECT_OPEN_KEY, open ? '1' : '0');
}

export function architectStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return sessionStorage;
  } catch {
    const store: Record<string, string> = {};
    return {
      getItem: (key) => store[key] ?? null,
      setItem: (key, value) => {
        store[key] = value;
      },
    };
  }
}
