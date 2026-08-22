import { afterEach, describe, expect, it } from 'vitest';
import { AuthConfigurationError, sessionSecret } from './env.js';
import { hashSessionToken } from './session.js';

describe('session secret', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('fails closed in production when the secret is missing or too short', () => {
    expect(() => sessionSecret({ NODE_ENV: 'production' })).toThrow(AuthConfigurationError);
    expect(() => sessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'short' })).toThrow(
      /at least 16/i,
    );
  });

  it('uses the configured secret and keeps the local-only fallback out of production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'production-session-secret';
    expect(hashSessionToken('token')).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionSecret({ NODE_ENV: 'development' })).toBe('dev-insecure-session-pepper');
  });
});
