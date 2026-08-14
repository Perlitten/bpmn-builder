import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api.duplicateProcess', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the confirmed name and does not PATCH when POST already used it', async () => {
    const calls: Array<{ url: string; method?: string; body: unknown }> = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return jsonResponse(201, { process: { id: 'copy-1', name: 'AP clone', version: 1 } });
    });

    const result = await api.duplicateProcess('src-1', 'AP clone');
    expect(result.id).toBe('copy-1');
    expect(calls).toEqual([
      { url: '/api/processes/src-1/duplicate', method: 'POST', body: { name: 'AP clone' } },
    ]);
  });

  it('PATCHes the confirmed name when duplicate still returns X (copy)', async () => {
    const calls: Array<{ url: string; method?: string; body: unknown }> = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init?.method, body });
      if (String(url).endsWith('/duplicate')) {
        return jsonResponse(201, { process: { id: 'copy-1', name: 'Invoice (copy)', version: 1 } });
      }
      return jsonResponse(200, { process: { id: 'copy-1', name: body.name, version: 2 } });
    });

    const result = await api.duplicateProcess('src-1', 'AP clone');
    expect(result.id).toBe('copy-1');
    expect(calls).toEqual([
      { url: '/api/processes/src-1/duplicate', method: 'POST', body: { name: 'AP clone' } },
      { url: '/api/processes/copy-1', method: 'PATCH', body: { name: 'AP clone', version: 1 } },
    ]);
  });
});
