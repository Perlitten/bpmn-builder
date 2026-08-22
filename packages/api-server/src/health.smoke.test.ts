import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '@bpmn/db';
import { createApp } from './app.js';

describe('health and operational headers', () => {
  const environment = { ...process.env };

  beforeEach(async () => {
    await resetDbForTests();
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = ':memory:';
  });

  afterEach(async () => {
    await resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in environment)) delete process.env[key];
    }
    Object.assign(process.env, environment);
  });

  it('performs a database round-trip and returns hardened no-store headers', async () => {
    const app = createApp();
    const server = app.listen(0);
    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
        headers: { 'x-request-id': 'health-test' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-request-id')).toBe('health-test');
      await expect(response.json()).resolves.toMatchObject({
        status: 'ok',
        database: { driver: 'sqlite', status: 'connected' },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
