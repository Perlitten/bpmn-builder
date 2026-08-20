import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProcessesTable, getQueryDb, migrate, resetDbForTests } from '@bpmn/db';
import { createApp } from '../app.js';
import { issueTestSession } from '../auth/testSession.js';
import { hashOAuthStateNonce, parseOAuthState } from '../auth/session.js';
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from '../auth/types.js';
import { DEFAULT_BPMN_XML } from '../defaultBpmn.js';

const listen = (app: ReturnType<typeof createApp>) =>
  new Promise<{ server: http.Server; url: string }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('no port');
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });

function cookieValue(headers: Headers, name: string): string | null {
  for (const line of headers.getSetCookie()) {
    if (line.startsWith(`${name}=`)) {
      return decodeURIComponent(line.slice(name.length + 1).split(';')[0] ?? '');
    }
  }
  return null;
}

describe('google auth and process isolation', () => {
  const snapshot = { ...process.env };
  const servers: http.Server[] = [];

  beforeEach(async () => {
    process.env.DB_PROVIDER = 'sqlite';
    process.env.DATABASE_URL = ':memory:';
    delete process.env.SQLITE_PATH;
    process.env.SESSION_SECRET = 'test-session-secret-at-least-16';
    process.env.GOOGLE_CLIENT_ID = 'google-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    resetDbForTests();
    await migrate();
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    resetDbForTests();
    vi.unstubAllGlobals();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('keeps health public and rejects unauthenticated process and assistant writes', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);

    const health = await fetch(`${url}/api/health`);
    expect(health.status).toBe(200);

    const listed = await fetch(`${url}/api/processes`);
    expect(listed.status).toBe(401);
    expect(((await listed.json()) as { error: string }).error).toBe('Sign in required');

    const created = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Secret' }),
    });
    expect(created.status).toBe(401);

    const assistant = await fetch(`${url}/api/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'add a task' }),
    });
    expect(assistant.status).toBe(401);
  });

  it('fails closed with a setup hint when Google OAuth env is missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.SESSION_SECRET;
    const { server, url } = await listen(createApp());
    servers.push(server);

    const status = await fetch(`${url}/api/auth/status`);
    expect(status.status).toBe(200);
    const body = (await status.json()) as { configured: boolean; error: string; callbackUrl: string };
    expect(body.configured).toBe(false);
    expect(body.error).toMatch(/GOOGLE_CLIENT_ID/);
    expect(body.callbackUrl).toMatch(/\/api\/auth\/google\/callback$/);

    const start = await fetch(`${url}/api/auth/google`, { redirect: 'manual' });
    expect(start.status).toBe(503);
    expect(((await start.json()) as { error: string }).error).toMatch(/GOOGLE_CLIENT_ID|SESSION_SECRET/);

    const listed = await fetch(`${url}/api/processes`);
    expect(listed.status).toBe(401);
  });

  it('exchanges a mocked Google callback, sets an httpOnly session, and signs out', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);

    const start = await fetch(`${url}/api/auth/google`, { redirect: 'manual' });
    expect(start.status).toBe(302);
    expect(start.headers.get('ratelimit')).toBeTruthy();
    const location = start.headers.get('location') ?? '';
    expect(location).toContain('accounts.google.com');
    const state = new URL(location).searchParams.get('state');
    expect(state).toBeTruthy();
    const stateToken = cookieValue(start.headers, OAUTH_STATE_COOKIE);
    const parsedState = parseOAuthState(state ?? '');
    expect(parsedState).toBeTruthy();
    expect(stateToken).toBe(hashOAuthStateNonce(parsedState?.nonce ?? ''));
    expect(stateToken).not.toBe(state);
    expect(start.headers.getSetCookie().join('; ').toLowerCase()).toContain('secure');

    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input);
        if (href.includes('oauth2.googleapis.com/token')) {
          const body = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : '';
          expect(body).toContain('client_id=');
          expect(body).not.toContain('localStorage');
          return new Response(JSON.stringify({ access_token: 'ya29.not-for-logs' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (href.includes('openidconnect.googleapis.com/v1/userinfo')) {
          return new Response(
            JSON.stringify({
              sub: 'google-sub-ada',
              email: 'ada@example.com',
              name: 'Ada Lovelace',
              picture: 'https://example.com/ada.png',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return originalFetch(input, init);
      },
    );

    const callback = await fetch(`${url}/api/auth/google/callback?code=test-code&state=${state}`, {
      redirect: 'manual',
      headers: { Cookie: `${OAUTH_STATE_COOKIE}=${stateToken}` },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toMatch(/\/$/);
    const sessionToken = cookieValue(callback.headers, SESSION_COOKIE);
    expect(sessionToken).toBeTruthy();
    const setCookie = callback.headers.getSetCookie().join('; ');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie.toLowerCase()).toContain('secure');

    const me = await fetch(`${url}/api/auth/me`, { headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` } });
    expect(me.status).toBe(200);
    const { user } = (await me.json()) as { user: { email: string; name: string; id: string } };
    expect(user.email).toBe('ada@example.com');
    expect(user.name).toBe('Ada Lovelace');
    expect(user.id).toBeTruthy();

    const logout = await fetch(`${url}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });
    expect(logout.status).toBe(200);
    const after = await fetch(`${url}/api/auth/me`, { headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` } });
    expect(after.status).toBe(401);
  });

  it('rejects a Google callback when the CSRF state does not match', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const callback = await fetch(`${url}/api/auth/google/callback?code=test-code&state=forged`, {
      redirect: 'manual',
      headers: { Cookie: `${OAUTH_STATE_COOKIE}=other-state` },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toMatch(/error=state/);

    const denied = await fetch(`${url}/api/auth/google/callback?error=access_denied&state=forged`, {
      redirect: 'manual',
      headers: { Cookie: `${OAUTH_STATE_COOKIE}=other-state` },
    });
    expect(denied.status).toBe(302);
    expect(denied.headers.get('location')).toMatch(/error=state/);
  });

  it('honors a Google denial only when it carries the matching CSRF state', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const start = await fetch(`${url}/api/auth/google`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? '';
    const stateToken = cookieValue(start.headers, OAUTH_STATE_COOKIE) ?? '';

    const denied = await fetch(`${url}/api/auth/google/callback?error=access_denied&state=${state}`, {
      redirect: 'manual',
      headers: { Cookie: `${OAUTH_STATE_COOKIE}=${stateToken}` },
    });
    expect(denied.status).toBe(302);
    expect(denied.headers.get('location')).toMatch(/error=denied/);
  });

  it('completes an OAuth handoff through a POST body', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const handoff = await issueTestSession({ email: 'handoff@example.com', name: 'Handoff User' });

    const completed = await fetch(`${url}/api/auth/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: handoff.token }),
    });
    expect(completed.status).toBe(200);
    expect(completed.headers.get('cache-control')).toContain('no-store');
    const sessionToken = cookieValue(completed.headers, SESSION_COOKIE);
    expect(sessionToken).toBeTruthy();

    const me = await fetch(`${url}/api/auth/me`, { headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe('handoff@example.com');
  });

  it('isolates processes between two users and hides orphan rows', async () => {
    const { server, url } = await listen(createApp());
    servers.push(server);
    const alice = await issueTestSession({ email: 'alice@example.com', name: 'Alice' });
    const bob = await issueTestSession({ email: 'bob@example.com', name: 'Bob' });

    const created = await fetch(`${url}/api/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alice.cookie },
      body: JSON.stringify({ name: 'Alice invoice' }),
    });
    expect(created.status).toBe(201);
    const { process } = (await created.json()) as { process: { id: string } };

    const bobList = await fetch(`${url}/api/processes`, { headers: { Cookie: bob.cookie } });
    expect(bobList.status).toBe(200);
    const bobPage = (await bobList.json()) as { processes: { id: string }[]; total: number };
    expect(bobPage.total).toBe(0);
    expect(bobPage.processes).toEqual([]);

    const bobGet = await fetch(`${url}/api/processes/${process.id}`, { headers: { Cookie: bob.cookie } });
    expect(bobGet.status).toBe(404);

    const bobPatch = await fetch(`${url}/api/processes/${process.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: bob.cookie },
      body: JSON.stringify({ name: 'Stolen', version: 1 }),
    });
    expect(bobPatch.status).toBe(404);

    const db = getQueryDb();
    const table = getProcessesTable();
    const now = new Date().toISOString();
    await db.insert(table).values({
      id: 'orphan-row',
      userId: null,
      name: 'Legacy orphan',
      description: null,
      status: 'draft',
      bpmnXml: DEFAULT_BPMN_XML,
      workflowJson: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const aliceList = await fetch(`${url}/api/processes?limit=100`, { headers: { Cookie: alice.cookie } });
    const alicePage = (await aliceList.json()) as { processes: { id: string }[]; total: number };
    expect(alicePage.processes.some((item) => item.id === process.id)).toBe(true);
    expect(alicePage.processes.some((item) => item.id === 'orphan-row')).toBe(false);

    const orphanGet = await fetch(`${url}/api/processes/orphan-row`, { headers: { Cookie: alice.cookie } });
    expect(orphanGet.status).toBe(404);
  });
});
