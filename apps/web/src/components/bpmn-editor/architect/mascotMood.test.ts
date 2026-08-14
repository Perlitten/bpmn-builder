import { describe, expect, it } from 'vitest';
import { resolveMascotMood } from './mascotMood';

describe('resolveMascotMood', () => {
  it('prefers thinking while Architect is applying', () => {
    expect(resolveMascotMood({ busy: true, error: true, success: true, hover: true })).toBe('thinking');
  });

  it('shows error, then success, then hover, then idle', () => {
    expect(resolveMascotMood({ error: true, success: true, hover: true })).toBe('error');
    expect(resolveMascotMood({ success: true, hover: true })).toBe('success');
    expect(resolveMascotMood({ hover: true })).toBe('hover');
    expect(resolveMascotMood({})).toBe('idle');
  });
});
