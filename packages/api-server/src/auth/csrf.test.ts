import http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { csrfProtection } from './csrf.js';

const servers: http.Server[] = [];

async function listen() {
  const app = express();
  app.use(csrfProtection);
  app.all('/api/write', (_req, res) => res.json({ ok: true }));
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('csrfProtection', () => {
  it('requires the custom header for API writes', async () => {
    const url = await listen();
    const response = await fetch(`${url}/api/write`, { method: 'POST' });
    expect(response.status).toBe(403);
  });

  it('accepts a protected same-origin write and leaves safe methods alone', async () => {
    const url = await listen();
    const written = await fetch(`${url}/api/write`, {
      method: 'POST',
      headers: { Origin: url, 'X-BPMN-CSRF': '1' },
    });
    expect(written.status).toBe(200);
    expect((await fetch(`${url}/api/write`)).status).toBe(200);
  });

  it('rejects a foreign origin even when it knows the header name', async () => {
    const url = await listen();
    const response = await fetch(`${url}/api/write`, {
      method: 'DELETE',
      headers: { Origin: 'https://attacker.example', 'X-BPMN-CSRF': '1' },
    });
    expect(response.status).toBe(403);
  });
});
