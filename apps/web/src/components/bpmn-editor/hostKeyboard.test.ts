import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { bindKeyboardToHost, isCopyKey, isPasteKey } from './hostKeyboard';

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
    };
    bindKeyboardToHost(keyboard, host);
    expect(keyboard.unbind).toHaveBeenCalledOnce();
    expect(keyboard._target).toBe(host);
    expect(keyboard.bind).toHaveBeenCalledOnce();
    expect(keyboard._target).not.toBe(svg);
  });

  it('does not restore Space Tool or global connect, and does not bind to document', () => {
    const src = readFileSync(new URL('./BpmnEditor.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/bindTo:\s*document/);
    expect(src).toMatch(/keyboard:\s*\{\s*bind:\s*false/);
    expect(src).toMatch(/bindKeyboardToHost/);
    const geometry = readFileSync(new URL('./palette/semanticGeometry.ts', import.meta.url), 'utf8');
    expect(geometry).toMatch(/spaceTool/);
    expect(geometry).toMatch(/globalConnectTool/);
    expect(src).toMatch(/isCopyKey/);
    expect(src).toMatch(/session\.copy/);
    expect(src).toMatch(/session\.paste/);
    expect(src).toMatch(/createSelectMarqueeModule/);
    expect(src).not.toMatch(/activateHand/);
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
  });
});
