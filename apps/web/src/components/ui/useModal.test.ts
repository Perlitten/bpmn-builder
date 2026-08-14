import { describe, expect, it } from 'vitest';
import { wrapFocusIndex } from './useModal';

describe('modal focus cycle', () => {
  it('wraps Tab from the last control to the first', () => {
    expect(wrapFocusIndex(3, 2, false)).toBe(0);
    expect(wrapFocusIndex(3, 0, false)).toBe(1);
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    expect(wrapFocusIndex(3, 0, true)).toBe(2);
    expect(wrapFocusIndex(3, 2, true)).toBe(1);
  });

  it('stays put when there are no controls', () => {
    expect(wrapFocusIndex(0, 0, false)).toBe(0);
  });
});
