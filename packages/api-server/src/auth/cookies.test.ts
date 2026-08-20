import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseCookieHeader } from './cookies.js';

describe('parseCookieHeader', () => {
  it('decodes ordinary cookies and keeps the final duplicate value', () => {
    expect(parseCookieHeader('theme=dark; display%20name=Ada%20Lovelace; theme=light')).toEqual({
      theme: 'light',
      'display%20name': 'Ada Lovelace',
    });
  });

  it('does not allow cookie names to mutate object prototypes', () => {
    const parsed = parseCookieHeader('__proto__=polluted; constructor=shadowed; safe=value');
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(parsed.safe).toBe('value');
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(true);
  });

  it('never throws on arbitrary untrusted cookie headers', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 4_096 }), (header) => {
        const parsed = parseCookieHeader(header);
        expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
      }),
      { numRuns: 250 },
    );
  });
});
