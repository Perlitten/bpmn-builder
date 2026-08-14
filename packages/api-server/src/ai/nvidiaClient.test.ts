import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNvidiaClient } from './nvidiaClient.js';
import { assistantTimeoutError } from './timeout.js';

const streamResponse = (content: string) =>
  new Response(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });

describe('NVIDIA client', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('parses streamed JSON without leaking the key into the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse('{"message":"ok","actions":[]}'));
    vi.stubGlobal('fetch', fetchMock);
    const client = createNvidiaClient('secret-test-key', 'nvidia/nemotron-3-super-120b-a12b');
    const data = (await client.generateJson({
      systemInstruction: 'Return JSON.',
      prompt: 'hi',
    })) as { message: string };
    expect(data.message).toBe('ok');
    const request = fetchMock.mock.calls[0][1] as { headers: { Authorization: string }; body: string; signal: AbortSignal };
    expect(request.headers.Authorization).toBe('Bearer secret-test-key');
    expect(request.body).not.toContain('secret-test-key');
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not retry when the upstream is aborted', async () => {
    const aborted = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    const fetchMock = vi.fn().mockRejectedValue(aborted);
    vi.stubGlobal('fetch', fetchMock);
    const client = createNvidiaClient('key', 'nvidia/nemotron-3-super-120b-a12b');
    await expect(
      client.generateJson({ systemInstruction: 'Return JSON.', prompt: 'hi' }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels a streaming body when the deadline aborts', async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull() {
        return new Promise(() => {});
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createNvidiaClient('key', 'nvidia/nemotron-3-super-120b-a12b');
    const ac = new AbortController();
    const pending = client.generateJson({
      systemInstruction: 'Return JSON.',
      prompt: 'hi',
      signal: ac.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    ac.abort(assistantTimeoutError());
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError', message: /timed out after 30s/ });
    expect(cancelled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast when NVIDIA never sends headers', async () => {
    process.env.ASSISTANT_TIMEOUT_MS = '5000';
    process.env.ASSISTANT_CONNECT_TIMEOUT_MS = '40';
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const client = createNvidiaClient('key', 'nvidia/nemotron-3-super-120b-a12b');
    const started = Date.now();
    await expect(client.generateJson({ systemInstruction: 'Return JSON.', prompt: 'add a task' })).rejects.toMatchObject({
      name: 'UpstreamError',
      message: /did not respond/i,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    delete process.env.ASSISTANT_TIMEOUT_MS;
    delete process.env.ASSISTANT_CONNECT_TIMEOUT_MS;
  });
});
