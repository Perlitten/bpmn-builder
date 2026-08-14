import { describe, expect, it } from 'vitest';
import { isAuthorizedBasic } from './passwordGate';

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

describe('isAuthorizedBasic', () => {
  it('accepts only the configured username and password', () => {
    expect(isAuthorizedBasic(basic('preview', 'correct horse'), 'preview', 'correct horse')).toBe(true);
    expect(isAuthorizedBasic(basic('preview', 'wrong'), 'preview', 'correct horse')).toBe(false);
    expect(isAuthorizedBasic(basic('other', 'correct horse'), 'preview', 'correct horse')).toBe(false);
  });

  it('rejects absent and malformed credentials', () => {
    expect(isAuthorizedBasic(undefined, 'preview', 'secret')).toBe(false);
    expect(isAuthorizedBasic('Bearer token', 'preview', 'secret')).toBe(false);
    expect(isAuthorizedBasic('Basic !!!', 'preview', 'secret')).toBe(false);
  });
});
