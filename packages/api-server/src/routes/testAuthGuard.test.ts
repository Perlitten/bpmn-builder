import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, resetDbForTests } from '@bpmn/db';
import { createApp } from '../app.js';

const listen = (app: ReturnType<typeof createApp>) =>
  new Promise<{ server: http.Server; url: string }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('no port');
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });

describe('security: test-session route guarding', () => {
  const snapshot = { ...process.env };
  const servers: http.Server[] = [];

  beforeEach(async () => {
    resetDbForTests();
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = ':memory:';
    delete process.env.SQLITE_PATH;
    await migrate();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('STRUCTURALLY REFUSES to register /api/auth/test-session under NODE_ENV=production, even if ENABLE_TEST_AUTH=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_AUTH = 'true';

    const { server, url } = await listen(createApp());
    servers.push(server);

    const res = await fetch(`${url}/api/auth/test-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'attacker@example.com' }),
    });
    expect(res.status).toBe(404);
  });

  it('registers /api/auth/test-session when NODE_ENV is test/development AND ENABLE_TEST_AUTH=true', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_TEST_AUTH = 'true';

    const { server, url } = await listen(createApp());
    servers.push(server);

    const res = await fetch(`${url}/api/auth/test-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'e2e@example.com' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; user: { email: string } };
    expect(body.ok).toBe(true);
    expect(body.user.email).toBe('e2e@example.com');
  });
});
