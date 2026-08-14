export const ASSISTANT_TIMEOUT_MS = 120_000;
export const ASSISTANT_CONNECT_TIMEOUT_MS = 8_000;

const TIMED_OUT =
  /timed out after \d+(?:\.\d+)?(?:s|ms)|aborted due to timeout|this operation was aborted/i;

export function assistantTimeoutMs(): number {
  const raw = Number(process.env.ASSISTANT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : ASSISTANT_TIMEOUT_MS;
}

export function assistantConnectTimeoutMs(): number {
  const overall = assistantTimeoutMs();
  const raw = Number(process.env.ASSISTANT_CONNECT_TIMEOUT_MS);
  const connect = Number.isFinite(raw) && raw > 0 ? raw : ASSISTANT_CONNECT_TIMEOUT_MS;
  return Math.min(connect, overall);
}

export function assistantTimeoutLabel(ms = assistantTimeoutMs()): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
}

export function assistantTimeoutError(ms = assistantTimeoutMs()): Error {
  const error = new Error(`Architect timed out after ${assistantTimeoutLabel(ms)}.`);
  error.name = 'TimeoutError';
  return error;
}

export function assistantUpstreamError(): Error {
  const error = new Error('AI provider did not respond. Check the API key and network, then retry.');
  error.name = 'UpstreamError';
  return error;
}

/** True when headers can fail faster than the generation budget. */
export function useFastConnectTimeout(): boolean {
  return assistantConnectTimeoutMs() + 50 < assistantTimeoutMs();
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
  return name === 'AbortError' || name === 'TimeoutError';
}

export function isTimeoutError(error: unknown): boolean {
  if (isAbortError(error)) return true;
  if (!error || typeof error !== 'object') return false;
  const message = error instanceof Error ? error.message : String(error);
  if (TIMED_OUT.test(message)) return true;
  const cause = 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  return cause != null && cause !== error && isTimeoutError(cause);
}

export function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(signal.reason ?? assistantTimeoutError());
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
}

export type Deadline = {
  signal: AbortSignal;
  abort: (reason?: unknown) => void;
  dispose: () => void;
};

export type ConnectGate = {
  signal: AbortSignal;
  headersArrived: () => void;
  dispose: () => void;
};

/** Abort if headers never arrive. Generation keeps the overall budget once the stream starts. */
export function createConnectGate(overall: AbortSignal): ConnectGate {
  if (!useFastConnectTimeout()) {
    return { signal: overall, headersArrived: () => undefined, dispose: () => undefined };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => {
    if (!ac.signal.aborted && !overall.aborted) ac.abort(assistantUpstreamError());
  }, assistantConnectTimeoutMs());
  const onOverall = () => {
    clearTimeout(timer);
    if (!ac.signal.aborted) ac.abort(overall.reason ?? assistantTimeoutError());
  };
  if (overall.aborted) onOverall();
  else overall.addEventListener('abort', onOverall, { once: true });
  const dispose = () => {
    clearTimeout(timer);
    overall.removeEventListener('abort', onOverall);
  };
  return {
    signal: AbortSignal.any([overall, ac.signal]),
    headersArrived: dispose,
    dispose,
  };
}

export function connectGateFailed(gate: ConnectGate, overall: AbortSignal): boolean {
  return gate.signal.aborted && !overall.aborted;
}

export function createDeadline(ms = assistantTimeoutMs(), extra?: AbortSignal): Deadline {
  const ac = new AbortController();
  const timedOut = () => assistantTimeoutError(ms);
  const abort = (reason: unknown = timedOut()) => {
    if (!ac.signal.aborted) ac.abort(reason);
  };
  const timer = setTimeout(() => abort(timedOut()), ms);
  const onExtra = () => abort(extra?.reason ?? assistantTimeoutError());
  if (extra) {
    if (extra.aborted) onExtra();
    else extra.addEventListener('abort', onExtra, { once: true });
  }
  return {
    signal: ac.signal,
    abort,
    dispose: () => {
      clearTimeout(timer);
      extra?.removeEventListener('abort', onExtra);
    },
  };
}

export async function raceTimeout<T>(work: Promise<T>, ms = assistantTimeoutMs(), signal?: AbortSignal): Promise<T> {
  const deadline = createDeadline(ms, signal);
  const stop = whenAborted(deadline.signal);
  void stop.catch(() => undefined);
  try {
    return await Promise.race([work, stop]);
  } catch (error) {
    if (deadline.signal.aborted) {
      void work.catch((late) => {
        console.warn('[assistant] upstream after abort:', late instanceof Error ? late.message : late);
      });
    }
    throw error;
  } finally {
    deadline.dispose();
  }
}
