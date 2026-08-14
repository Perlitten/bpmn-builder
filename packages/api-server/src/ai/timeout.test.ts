import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assistantConnectTimeoutMs,
  assistantTimeoutError,
  assistantTimeoutMs,
  createConnectGate,
  isAbortError,
  isTimeoutError,
  raceTimeout,
  useFastConnectTimeout,
  whenAborted,
} from './timeout.js';

describe('assistant timeout', () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    vi.useRealTimers();
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) delete process.env[key];
    }
    Object.assign(process.env, snapshot);
  });

  it('raceTimeout rejects after the budget and leaves a finished job alone', async () => {
    vi.useFakeTimers();
    const hung = raceTimeout(new Promise(() => {}), 30_000);
    const expectHung = expect(hung).rejects.toMatchObject({ name: 'TimeoutError', message: /timed out after 30s/ });
    await vi.advanceTimersByTimeAsync(30_000);
    await expectHung;

    expect(await raceTimeout(Promise.resolve('ok'), 30_000)).toBe('ok');
  });

  it('detects timeout errors from AbortSignal and our sentinel', () => {
    expect(isTimeoutError(assistantTimeoutError())).toBe(true);
    expect(isAbortError(assistantTimeoutError())).toBe(true);
    const aborted = new Error('The operation was aborted due to timeout');
    aborted.name = 'TimeoutError';
    expect(isTimeoutError(aborted)).toBe(true);
    const wrapped = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    expect(isTimeoutError(wrapped)).toBe(true);
    expect(isTimeoutError(new Error('not configured'))).toBe(false);
  });

  it('whenAborted rejects as soon as the signal fires', async () => {
    const ac = new AbortController();
    const pending = whenAborted(ac.signal);
    ac.abort(assistantTimeoutError());
    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('reads ASSISTANT_TIMEOUT_MS from the environment', () => {
    const previous = process.env.ASSISTANT_TIMEOUT_MS;
    process.env.ASSISTANT_TIMEOUT_MS = '40';
    expect(assistantTimeoutMs()).toBe(40);
    expect(useFastConnectTimeout()).toBe(false);
    if (previous === undefined) delete process.env.ASSISTANT_TIMEOUT_MS;
    else process.env.ASSISTANT_TIMEOUT_MS = previous;
    expect(assistantTimeoutMs()).toBe(30_000);
  });

  it('fails the connect gate before the 30s generation budget', async () => {
    const previousTimeout = process.env.ASSISTANT_TIMEOUT_MS;
    const previousConnect = process.env.ASSISTANT_CONNECT_TIMEOUT_MS;
    process.env.ASSISTANT_TIMEOUT_MS = '5000';
    process.env.ASSISTANT_CONNECT_TIMEOUT_MS = '40';
    expect(assistantConnectTimeoutMs()).toBe(40);
    expect(useFastConnectTimeout()).toBe(true);
    const overall = new AbortController();
    const gate = createConnectGate(overall.signal);
    const started = Date.now();
    await expect(whenAborted(gate.signal)).rejects.toMatchObject({ name: 'UpstreamError' });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(overall.signal.aborted).toBe(false);
    gate.dispose();
    if (previousTimeout === undefined) delete process.env.ASSISTANT_TIMEOUT_MS;
    else process.env.ASSISTANT_TIMEOUT_MS = previousTimeout;
    if (previousConnect === undefined) delete process.env.ASSISTANT_CONNECT_TIMEOUT_MS;
    else process.env.ASSISTANT_CONNECT_TIMEOUT_MS = previousConnect;
  });
});
