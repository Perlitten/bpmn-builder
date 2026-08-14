import { describe, expect, it } from 'vitest';
import { createInspectorCreateGate } from './inspectorCreateGesture';

describe('inspector create gesture', () => {
  it('rejects a select click-through (no pointerdown on the control)', () => {
    const gate = createInspectorCreateGate();
    expect(gate.click(1)).toBe(false);
  });

  it('accepts primary pointerdown on the control and ignores the following mouse click', () => {
    const gate = createInspectorCreateGate();
    expect(gate.pointerDown(0)).toBe(true);
    expect(gate.click(1)).toBe(false);
  });

  it('accepts keyboard activation (click detail 0) without a prior pointerdown', () => {
    const gate = createInspectorCreateGate();
    expect(gate.click(0)).toBe(true);
  });

  it('does not double-create when a touch click reports detail 0 after pointerdown', () => {
    const gate = createInspectorCreateGate();
    expect(gate.pointerDown(0)).toBe(true);
    expect(gate.click(0)).toBe(false);
  });

  it('ignores non-primary pointerdown', () => {
    const gate = createInspectorCreateGate();
    expect(gate.pointerDown(2)).toBe(false);
    expect(gate.click(1)).toBe(false);
  });

  it('reset clears a pending pointer so selection change cannot inherit it', () => {
    const gate = createInspectorCreateGate();
    expect(gate.pointerDown(0)).toBe(true);
    gate.reset();
    expect(gate.click(1)).toBe(false);
  });

  it('selecting a pool does not increment lane count until Add lane is pressed', () => {
    let lanes = 0;
    const addLane = () => {
      lanes += 1;
    };
    const gate = createInspectorCreateGate();
    if (gate.click(1)) addLane();
    expect(lanes).toBe(0);
    if (gate.pointerDown(0)) addLane();
    if (gate.click(1)) addLane();
    expect(lanes).toBe(1);
  });
});
