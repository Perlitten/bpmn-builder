import { describe, expect, it } from 'vitest';
import { canMascotGreet } from './mascotHello';

describe('canMascotGreet', () => {
  it('greets only while hovered', () => {
    expect(canMascotGreet('idle', false)).toBe(false);
    expect(canMascotGreet('hover', false)).toBe(true);
    expect(canMascotGreet('hover', true)).toBe(true);
    expect(canMascotGreet('success', false)).toBe(false);
    expect(canMascotGreet('thinking', false)).toBe(false);
    expect(canMascotGreet('error', false)).toBe(false);
    expect(canMascotGreet('idle', true)).toBe(false);
  });
});
