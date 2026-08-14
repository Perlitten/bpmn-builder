import { describe, expect, it } from 'vitest';
import {
  ARCHITECT_MARGIN,
  ARCHITECT_OPEN_KEY,
  ARCHITECT_PANEL_WIDTH,
  ARCHITECT_STORAGE_KEY,
  ARCHITECT_Z_INDEX,
  PALETTE_RAIL_WIDTH,
  clampArchitectPosition,
  companionMode,
  defaultArchitectPosition,
  isArchitectClick,
  isArchitectDragIgnoreTarget,
  isArchitectDragMove,
  listNeedsCompanionClearance,
  readArchitectOpen,
  readArchitectPosition,
  writeArchitectOpen,
  writeArchitectPosition,
} from './architectPosition';

const panel = { width: ARCHITECT_PANEL_WIDTH, height: 240 };
const viewport = { width: 1280, height: 800 };

function memory() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
}

describe('architectPosition', () => {
  it('stays above catalog, inspector, and palette', () => {
    expect(ARCHITECT_Z_INDEX).toBeGreaterThanOrEqual(200);
  });
  it('defaults to bottom-right without covering the left rail', () => {
    const pos = defaultArchitectPosition(viewport, panel);
    expect(pos.x).toBe(viewport.width - panel.width - ARCHITECT_MARGIN);
    expect(pos.y).toBe(viewport.height - panel.height - ARCHITECT_MARGIN);
    expect(pos.x).toBeGreaterThanOrEqual(PALETTE_RAIL_WIDTH + ARCHITECT_MARGIN);
  });

  it('clamps stored positions that would cover the catalog rail', () => {
    const pos = clampArchitectPosition({ x: 0, y: 0 }, viewport, panel);
    expect(pos.x).toBe(PALETTE_RAIL_WIDTH + ARCHITECT_MARGIN);
    expect(pos.y).toBe(ARCHITECT_MARGIN);
  });

  it('persists and restores a clamped position from sessionStorage', () => {
    const storage = memory();
    writeArchitectPosition(storage, { x: 640.4, y: 200.6 });
    expect(JSON.parse(storage.getItem(ARCHITECT_STORAGE_KEY)!)).toEqual({ x: 640, y: 201 });
    expect(readArchitectPosition(storage, viewport, panel)).toEqual({ x: 640, y: 201 });
  });

  it('drops the rail inset on compact viewports so a docked panel can use the full width', () => {
    const compact = { width: 390, height: 844 };
    expect(clampArchitectPosition({ x: 0, y: 0 }, compact, panel).x).toBe(ARCHITECT_MARGIN);
    expect(defaultArchitectPosition(compact, panel).x).toBeGreaterThanOrEqual(ARCHITECT_MARGIN);
  });

  it('keeps default x on the rail inset when a desktop viewport is narrower than the panel', () => {
    const pos = defaultArchitectPosition({ width: 800, height: 600 }, { width: 760, height: 240 });
    expect(pos.x).toBe(PALETTE_RAIL_WIDTH + ARCHITECT_MARGIN);
  });

  it('falls back to default when storage is empty or invalid', () => {
    const storage = memory();
    expect(readArchitectPosition(storage, viewport, panel)).toEqual(defaultArchitectPosition(viewport, panel));
    storage.setItem(ARCHITECT_STORAGE_KEY, 'nope');
    expect(readArchitectPosition(storage, viewport, panel)).toEqual(defaultArchitectPosition(viewport, panel));
  });

  it('does not inset the list companion for the catalog rail', () => {
    const pos = clampArchitectPosition({ x: 0, y: 0 }, viewport, panel, 'list');
    expect(pos.x).toBe(ARCHITECT_MARGIN);
  });

  it('never covers the process list with Architect', () => {
    expect(companionMode('list', true)).toBe('hidden');
    expect(companionMode('list', false)).toBe('hidden');
    expect(listNeedsCompanionClearance(true)).toBe(false);
    expect(listNeedsCompanionClearance(false)).toBe(false);
    expect(companionMode('editor', true)).toBe('dock');
    expect(companionMode('editor', false)).toBe('float');
  });

  it('treats sub-4px pointer travel as a click and longer travel as a drag', () => {
    expect(isArchitectClick(0, 0)).toBe(true);
    expect(isArchitectClick(3, 0)).toBe(true);
    expect(isArchitectClick(4, 0)).toBe(true);
    expect(isArchitectDragMove(4, 0)).toBe(false);
    expect(isArchitectDragMove(5, 0)).toBe(true);
    expect(isArchitectClick(5, 0)).toBe(false);
    expect(isArchitectDragMove(3, 3)).toBe(true);
  });

  it('ignores panel controls so Apply does not start a drag', () => {
    const mascot = { closest: () => null };
    const apply = { closest: (sel: string) => (sel.includes('button') ? {} : null) };
    const head = { closest: () => null };
    expect(isArchitectDragIgnoreTarget(mascot as unknown as EventTarget)).toBe(false);
    expect(isArchitectDragIgnoreTarget(apply as unknown as EventTarget)).toBe(true);
    expect(isArchitectDragIgnoreTarget(head as unknown as EventTarget)).toBe(false);
  });

  it('persists Architect open/closed without treating missing storage as open', () => {
    const storage = memory();
    expect(readArchitectOpen(storage)).toBe(false);
    writeArchitectOpen(storage, true);
    expect(storage.getItem(ARCHITECT_OPEN_KEY)).toBe('1');
    expect(readArchitectOpen(storage)).toBe(true);
    writeArchitectOpen(storage, false);
    expect(readArchitectOpen(storage)).toBe(false);
  });
});
