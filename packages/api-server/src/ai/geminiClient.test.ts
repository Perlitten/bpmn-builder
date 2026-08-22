import { describe, expect, it } from 'vitest';
import { geminiMaxOutputTokens } from './geminiClient.js';

describe('gemini output budget', () => {
  it('uses the default for missing and invalid values', () => {
    expect(geminiMaxOutputTokens({})).toBe(8192);
    expect(geminiMaxOutputTokens({ GEMINI_MAX_OUTPUT_TOKENS: 'not-a-number' })).toBe(8192);
    expect(geminiMaxOutputTokens({ GEMINI_MAX_OUTPUT_TOKENS: '128' })).toBe(8192);
  });

  it('accepts a bounded configured token budget', () => {
    expect(geminiMaxOutputTokens({ GEMINI_MAX_OUTPUT_TOKENS: '12000' })).toBe(12000);
    expect(geminiMaxOutputTokens({ GEMINI_MAX_OUTPUT_TOKENS: '99999' })).toBe(32768);
  });
});
