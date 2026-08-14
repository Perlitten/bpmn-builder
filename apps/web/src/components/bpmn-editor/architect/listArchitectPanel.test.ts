import { describe, expect, it } from 'vitest';
import { listArchitectPanelBox } from './listArchitectPanel';

describe('listArchitectPanelBox', () => {
  it('opens below the taller list header, not under the 44px bar or above the viewport', () => {
    const box = listArchitectPanelBox(
      { right: 900, bottom: 40 },
      112,
      { width: 1280, height: 800 },
    );
    expect(box.top).toBe(120);
    expect(box.top).toBeGreaterThan(112);
    expect(box.right).toBe(1280 - 900);
    expect(box.maxHeight).toBe(800 - 120 - 8);
  });

  it('uses the mascot bottom when it sits below the header', () => {
    const box = listArchitectPanelBox(
      { right: 400, bottom: 200 },
      48,
      { width: 800, height: 600 },
    );
    expect(box.top).toBe(208);
  });
});
