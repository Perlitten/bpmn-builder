import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeOAuthHandoff, fetchAuthBootstrap, signOut } from './auth';

describe('completeOAuthHandoff', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes the token from the URL and exchanges it through a POST body', async () => {
    const replaceState = vi.fn();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('window', {
      location: {
        hash: '#auth_token=handoff-secret',
        pathname: '/processes',
        search: '?view=mine',
      },
      history: { replaceState },
    });
    vi.stubGlobal('document', { title: 'BPMN' });
    vi.stubGlobal('fetch', fetchMock);

    await completeOAuthHandoff();

    expect(replaceState).toHaveBeenCalledWith(null, 'BPMN', '/processes?view=mine');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/complete',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ 'X-BPMN-CSRF': '1' }),
        body: JSON.stringify({ token: 'handoff-secret' }),
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('auth_token');
  });

  it('keeps the handoff token in the URL after a transient failure so retry is possible', async () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { hash: '#auth_token=handoff-secret', pathname: '/', search: '' },
      history: { replaceState },
    });
    vi.stubGlobal('document', { title: 'BPMN' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));

    await expect(completeOAuthHandoff()).rejects.toThrow(/handoff/i);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('clears an expired handoff token and lets auth bootstrap fall back to the session or sign-in', async () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { hash: '#auth_token=expired-secret', pathname: '/processes', search: '' },
      history: { replaceState },
    });
    vi.stubGlobal('document', { title: 'BPMN' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 410 })));

    await expect(completeOAuthHandoff()).resolves.toBeUndefined();
    expect(replaceState).toHaveBeenCalledWith(null, 'BPMN', '/processes');
  });

  it('protects sign out with the CSRF header and reports server failures', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(signOut()).rejects.toThrow(/sign out/i);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ headers: { 'X-BPMN-CSRF': '1' } }),
    );
  });

  it('ignores unrelated URL fragments', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('window', {
      location: { hash: '#section', pathname: '/', search: '' },
      history: { replaceState: vi.fn() },
    });
    vi.stubGlobal('fetch', fetchMock);

    await completeOAuthHandoff();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bootstraps signed-out state without an expected 401 request', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ configured: true, callbackUrl: '/callback', user: null }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAuthBootstrap()).resolves.toMatchObject({ configured: true, user: null });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/status',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('/api/auth/me');
  });
});
