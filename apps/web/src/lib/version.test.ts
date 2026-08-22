import { describe, expect, it } from 'vitest';
import { formatVersionInfo, getBuildVersionInfo, resolveCommitSha } from './version';

describe('version helper', () => {
  it('resolves commit SHA to 7 characters when SHA is provided', () => {
    expect(resolveCommitSha('a1b2c3d4e5f6789')).toBe('a1b2c3d');
    expect(resolveCommitSha('a1b2c3d-dirty')).toBe('a1b2c3d-dirty');
  });

  it('falls back to "dev" when SHA is undefined, empty, or whitespace', () => {
    expect(resolveCommitSha(undefined)).toBe('dev');
    expect(resolveCommitSha('')).toBe('dev');
    expect(resolveCommitSha('   ')).toBe('dev');
  });

  it('formats version label correctly with full SHA', () => {
    expect(formatVersionInfo('0.1.0', 'a1b2c3d4e5f6')).toBe('v0.1.0 · a1b2c3d');
    expect(formatVersionInfo('v0.1.0', 'a1b2c3d4e5f6')).toBe('v0.1.0 · a1b2c3d');
  });

  it('formats version label with fallback "dev" when SHA is undefined', () => {
    expect(formatVersionInfo('0.1.0', undefined)).toBe('v0.1.0 · dev');
  });

  it('returns formatted build version info from getBuildVersionInfo', () => {
    expect(getBuildVersionInfo()).toMatch(/^v\d+\.\d+\.\d+ · /);
  });
});
