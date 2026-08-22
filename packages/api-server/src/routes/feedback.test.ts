import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, resetDbForTests } from '@bpmn/db';
import { createApp } from '../app.js';
import { issueTestSession } from '../auth/testSession.js';

const listen = (app: ReturnType<typeof createApp>) =>
  new Promise<{ server: http.Server; url: string }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('no port');
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });

describe('feedback routes', () => {
  const snapshot = { ...process.env };
  const servers: http.Server[] = [];

  beforeEach(async () => {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = ':memory:';
    delete process.env.SQLITE_PATH;
    delete process.env.FEEDBACK_INBOX_EMAIL;
    await resetDbForTests();
    await migrate();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    await resetDbForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('stores feedback and lists only the signed-in user inbox', async () => {
    const first = await issueTestSession({ email: 'first@example.com' });
    const second = await issueTestSession({ email: 'second@example.com' });
    const { server, url } = await listen(createApp());
    servers.push(server);

    const post = await fetch(`${url}/api/feedback`, {
      method: 'POST',
      headers: { Cookie: first.cookie, 'Content-Type': 'application/json', 'X-BPMN-CSRF': '1' },
      body: JSON.stringify({ category: 'bug', message: 'The preview menu is too tall.', page: '/processes/demo' }),
    });
    expect(post.status).toBe(201);
    expect(await post.json()).toMatchObject({ feedback: { category: 'bug', message: 'The preview menu is too tall.', page: '/processes/demo', status: 'new' } });

    const own = await fetch(`${url}/api/feedback`, { headers: { Cookie: first.cookie } });
    expect(own.status).toBe(200);
    expect((await own.json() as { feedback: Array<{ message: string }> }).feedback).toHaveLength(1);

    const other = await fetch(`${url}/api/feedback`, { headers: { Cookie: second.cookie } });
    expect(other.status).toBe(200);
    expect((await other.json() as { feedback: unknown[] }).feedback).toEqual([]);
  });

  it('rejects empty and oversized feedback', async () => {
    const session = await issueTestSession();
    const { server, url } = await listen(createApp());
    servers.push(server);
    const request = (body: unknown) => fetch(`${url}/api/feedback`, {
      method: 'POST',
      headers: { Cookie: session.cookie, 'Content-Type': 'application/json', 'X-BPMN-CSRF': '1' },
      body: JSON.stringify(body),
    });
    expect((await request({ message: ' ' })).status).toBe(400);
    expect((await request({ message: 'x'.repeat(5001) })).status).toBe(400);
    expect((await request({ category: 'other', message: 'Nope' })).status).toBe(400);
  });

  it('gives the configured product owner a private inbox for all new submissions', async () => {
    process.env.FEEDBACK_INBOX_EMAIL = 'owner@example.com';
    const sender = await issueTestSession({ email: 'sender@example.com' });
    const otherSender = await issueTestSession({ email: 'other@example.com' });
    const owner = await issueTestSession({ email: 'OWNER@example.com' });
    const { server, url } = await listen(createApp());
    servers.push(server);

    const send = (cookie: string, message: string) => fetch(`${url}/api/feedback`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-BPMN-CSRF': '1' },
      body: JSON.stringify({ message }),
    });
    expect((await send(sender.cookie, 'First report')).status).toBe(201);
    expect((await send(otherSender.cookie, 'Second report')).status).toBe(201);

    const ownerInbox = await fetch(`${url}/api/feedback`, { headers: { Cookie: owner.cookie } });
    expect(ownerInbox.status).toBe(200);
    expect((await ownerInbox.json() as { feedback: Array<{ message: string }> }).feedback.map((item) => item.message))
      .toEqual(['Second report', 'First report']);
  });
});
