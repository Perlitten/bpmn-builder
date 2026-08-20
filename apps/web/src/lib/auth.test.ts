import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeOAuthHandoff } from './auth';

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
        body: JSON.stringify({ token: 'handoff-secret' }),
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('auth_token');
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
});
