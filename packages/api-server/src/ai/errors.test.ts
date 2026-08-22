import { describe, expect, it } from 'vitest';
import { friendlyAiError, isConfigError, isUpstreamError } from './errors.js';
import { assistantTimeoutError, assistantUpstreamError } from './timeout.js';

describe('friendly AI errors', () => {
  it('fails fast on missing keys and silent upstream, not a generation timeout', () => {
    expect(friendlyAiError(new Error('NVIDIA_API_KEY environment variable is not configured.'))).toMatch(
      /not configured/i,
    );
    expect(isConfigError(new Error('AI agent is not configured.'))).toBe(true);
    expect(friendlyAiError(assistantUpstreamError())).toMatch(/did not respond/i);
    expect(isUpstreamError(assistantUpstreamError())).toBe(true);
    expect(isUpstreamError(assistantTimeoutError())).toBe(false);
    expect(friendlyAiError(assistantTimeoutError())).toMatch(/timed out after 50s/i);
  });
});
