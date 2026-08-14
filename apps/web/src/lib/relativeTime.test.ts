import { describe, expect, it } from 'vitest';
import { absoluteTime, relativeTime } from './relativeTime';

const NOW = Date.parse('2026-08-14T12:00:00.000Z');

describe('relativeTime', () => {
  it('renders past times deterministically', () => {
    expect(relativeTime('2026-08-14T11:59:30.000Z', NOW)).toBe('Just now');
    expect(relativeTime('2026-08-14T11:57:00.000Z', NOW)).toBe('3m ago');
    expect(relativeTime('2026-08-14T10:00:00.000Z', NOW)).toBe('2h ago');
  });

  it('surfaces clock skew instead of calling future timestamps “Just now”', () => {
    expect(relativeTime('2026-08-14T12:03:00.000Z', NOW)).toBe('in 3m');
    expect(relativeTime('2026-08-14T14:00:00.000Z', NOW)).toBe('in 2h');
  });

  it('handles invalid timestamps and provides an absolute label', () => {
    expect(relativeTime('invalid', NOW)).toBe('Unknown time');
    expect(absoluteTime('invalid')).toBe('Invalid timestamp');
    expect(absoluteTime('2026-08-14T12:00:00.000Z')).toContain('2026');
  });
});
