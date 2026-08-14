import { describe, expect, it } from 'vitest';
import { greetingReply, isGreetingMessage } from './greeting';

describe('Architect greeting', () => {
  it('short-circuits привет and hello without a modeling request', () => {
    expect(isGreetingMessage('привет')).toBe(true);
    expect(isGreetingMessage('hello')).toBe(true);
    expect(isGreetingMessage('hello, add a review task')).toBe(false);
    expect(greetingReply('привет')).toMatch(/процесс/i);
  });
});
