import { describe, expect, it } from 'vitest';
import { greetingReply, isGreetingMessage, normalizeGreeting } from './greeting.js';

describe('assistant greeting', () => {
  it('treats hello / привет as a no-op chat, not a tool plan', () => {
    expect(isGreetingMessage('привет')).toBe(true);
    expect(isGreetingMessage('Привет!')).toBe(true);
    expect(isGreetingMessage('hello')).toBe(true);
    expect(isGreetingMessage('Hello there')).toBe(true);
    expect(isGreetingMessage('thanks')).toBe(true);
    expect(greetingReply('привет')).toMatch(/процесс/i);
    expect(greetingReply('hello')).toMatch(/process structure/i);
  });

  it('does not swallow modeling requests that start with a hello', () => {
    expect(isGreetingMessage('hello, add a review task')).toBe(false);
    expect(isGreetingMessage('привет, добавь задачу')).toBe(false);
    expect(isGreetingMessage('add a task')).toBe(false);
    expect(isGreetingMessage('split after Review')).toBe(false);
    expect(normalizeGreeting('Привет!!!')).toBe('привет');
  });
});
