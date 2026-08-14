import { describe, expect, it } from 'vitest';
import { COMPACT_MAX_WIDTH, isCompactViewport } from './compactViewport';

describe('isCompactViewport', () => {
  it('treats 390px and the phone-width boundary as compact', () => {
    expect(isCompactViewport(390)).toBe(true);
    expect(isCompactViewport(COMPACT_MAX_WIDTH)).toBe(true);
  });

  it('leaves desktop widths on the rail layout', () => {
    expect(isCompactViewport(COMPACT_MAX_WIDTH + 1)).toBe(false);
    expect(isCompactViewport(1280)).toBe(false);
  });
});
