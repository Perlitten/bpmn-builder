import { describe, expect, it } from 'vitest';
import { clampInspectorWidth } from './InspectorShell';

describe('inspector shell geometry', () => {
  it('resizes only inside the 220–380px contract', () => {
    expect(clampInspectorWidth(180)).toBe(220);
    expect(clampInspectorWidth(252)).toBe(252);
    expect(clampInspectorWidth(500)).toBe(380);
  });

  it('keeps at least 60% of the desktop shell for the canvas', () => {
    expect(clampInspectorWidth(380, 800)).toBe(320);
    expect(clampInspectorWidth(380, 1_200)).toBe(380);
  });
});
