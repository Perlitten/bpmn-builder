import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  applySpacePanDown,
  applySpacePanUp,
  bindKeyboardToHost,
  createSpacePanHold,
  isCopyKey,
  isPasteKey,
  isRedoKey,
  isSpaceKey,
  isUndoKey,
  releaseSpacePan,
  silenceCanvasTabStop,
  type SpacePanKeyEvent,
} from './hostKeyboard';

function spaceEvent(overrides: Partial<SpacePanKeyEvent> = {}): SpacePanKeyEvent {
  return {
    key: ' ',
    code: 'Space',
    repeat: false,
    isComposing: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

describe('bindKeyboardToHost', () => {
  it('rebinds diagram-js keyboard onto the canvas host, not document', () => {
    const host = { id: 'canvas-host' } as unknown as HTMLElement;
    const svg = { id: 'svg' } as unknown as EventTarget;
    const keyboard = {
      _target: svg,
      bind: vi.fn(function bind(this: { _target: EventTarget }) {
        this._target = this._target;
      }),
      unbind: vi.fn(),
      addListener: vi.fn(),
    };
    bindKeyboardToHost(keyboard, host);
    expect(keyboard.unbind).toHaveBeenCalledOnce();
    expect(keyboard._target).toBe(host);
    expect(keyboard.bind).toHaveBeenCalledOnce();
    expect(keyboard._target).not.toBe(svg);
    expect(keyboard.addListener).toHaveBeenCalledWith(1600, expect.any(Function), 'keyboard.keydown');
    expect(keyboard.addListener).toHaveBeenCalledWith(1600, expect.any(Function), 'keyboard.keyup');
    const swallow = keyboard.addListener.mock.calls[0][1] as (e: { keyEvent: { key: string; code?: string } }) => unknown;
    expect(swallow({ keyEvent: { key: ' ', code: 'Space' } })).toBe(false);
    expect(swallow({ keyEvent: { key: 'h' } })).toBeUndefined();
  });

  it('takes the canvas SVG out of the tab order', () => {
    const svg = { setAttribute: vi.fn() };
    const host = { querySelectorAll: () => [svg] } as unknown as HTMLElement;
    silenceCanvasTabStop(host);
    expect(svg.setAttribute).toHaveBeenCalledWith('tabindex', '-1');
  });

  it('does not restore Space Tool or global connect, and does not bind to document', () => {
    const src = readFileSync(new URL('./BpmnEditor.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/bindTo:\s*document/);
    expect(src).toMatch(/keyboard:\s*\{\s*bind:\s*false/);
    expect(src).toMatch(/bindKeyboardToHost/);
    expect(src).toMatch(/applySpacePanDown/);
    expect(src).toMatch(/applySpacePanUp/);
    expect(src).toMatch(/addEventListener\('keyup'/);
    const geometry = readFileSync(new URL('./palette/semanticGeometry.ts', import.meta.url), 'utf8');
    expect(geometry).toMatch(/spaceTool/);
    expect(geometry).toMatch(/globalConnectTool/);
    expect(src).toMatch(/isCopyKey/);
    expect(src).toMatch(/session\.copy/);
    expect(src).toMatch(/session\.paste/);
    expect(src).toMatch(/session\.undo/);
    expect(src).toMatch(/createSelectMarqueeModule/);
    expect(src).toMatch(/silenceCanvasTabStop/);
    expect(src).toMatch(/applyViewerLabel/);
    expect(src).toMatch(/labelWriteRef/);
    expect(src).not.toMatch(/activateHand/);
    expect(src).not.toMatch(/spaceTool\.activate/);
  });

  it('extends chrome typing targets to any contenteditable', () => {
    const selectable = readFileSync(new URL('./inspector/selectable.ts', import.meta.url), 'utf8');
    expect(selectable).toMatch(/\[contenteditable\]:not\(\[contenteditable="false"\]\)/);
    expect(selectable).toMatch(/isEditorChromeKeyTarget/);
  });

  it('treats ⌘/Ctrl+C and ⌘/Ctrl+V as copy/paste chords', () => {
    expect(isCopyKey({ key: 'c', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent)).toBe(
      true,
    );
    expect(isPasteKey({ key: 'v', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false } as KeyboardEvent)).toBe(
      true,
    );
    expect(isCopyKey({ key: 'c', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent)).toBe(
      false,
    );
    expect(isUndoKey({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent)).toBe(
      true,
    );
    expect(isRedoKey({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false } as KeyboardEvent)).toBe(
      true,
    );
    expect(isRedoKey({ key: 'y', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false } as KeyboardEvent)).toBe(
      true,
    );
  });
});

describe('Space hold-to-pan', () => {
  it('treats Space by key or code', () => {
    expect(isSpaceKey({ key: ' ', code: 'Space' })).toBe(true);
    expect(isSpaceKey({ key: 'Spacebar' })).toBe(true);
    expect(isSpaceKey({ key: 'Space' })).toBe(true);
    expect(isSpaceKey({ key: 's', code: 'KeyS' })).toBe(false);
  });

  it('holds Space to pan and restores Select on release', () => {
    const hold = createSpacePanHold();
    const down = spaceEvent();
    expect(applySpacePanDown(down, 'select', hold, false)).toBe('pan');
    expect(down.preventDefault).toHaveBeenCalledOnce();
    expect(down.stopPropagation).toHaveBeenCalledOnce();
    expect(applySpacePanDown(spaceEvent({ repeat: true }), 'pan', hold, false)).toBeUndefined();
    const up = spaceEvent();
    expect(applySpacePanUp(up, hold)).toBe('select');
    expect(up.stopPropagation).toHaveBeenCalledOnce();
  });

  it('stays on Pan if Pan was already selected', () => {
    const hold = createSpacePanHold();
    const down = spaceEvent();
    expect(applySpacePanDown(down, 'pan', hold, false)).toBeUndefined();
    expect(down.preventDefault).toHaveBeenCalledOnce();
    expect(applySpacePanUp(spaceEvent(), hold)).toBeUndefined();
  });

  it('ignores typing, IME, modifiers, and does not preventDefault', () => {
    const hold = createSpacePanHold();
    const typing = spaceEvent();
    expect(applySpacePanDown(typing, 'select', hold, true)).toBeUndefined();
    expect(typing.preventDefault).not.toHaveBeenCalled();

    const ime = spaceEvent({ isComposing: true });
    expect(applySpacePanDown(ime, 'select', hold, false)).toBeUndefined();
    expect(ime.preventDefault).not.toHaveBeenCalled();

    const imeKey = spaceEvent({ keyCode: 229 });
    expect(applySpacePanDown(imeKey, 'select', hold, false)).toBeUndefined();

    const meta = spaceEvent({ metaKey: true });
    expect(applySpacePanDown(meta, 'select', hold, false)).toBeUndefined();
    expect(meta.preventDefault).not.toHaveBeenCalled();
    expect(applySpacePanUp(spaceEvent(), hold)).toBeUndefined();
  });

  it('restores Select if Space is interrupted', () => {
    const hold = createSpacePanHold();
    expect(applySpacePanDown(spaceEvent(), 'select', hold, false)).toBe('pan');
    expect(releaseSpacePan(hold)).toBe('select');
    expect(releaseSpacePan(hold)).toBeUndefined();
  });
});
