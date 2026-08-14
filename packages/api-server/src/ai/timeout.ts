export const ASSISTANT_TIMEOUT_MS = 30_000;

export function assistantTimeoutMs(): number {
  const raw = Number(process.env.ASSISTANT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : ASSISTANT_TIMEOUT_MS;
}

export function assistantTimeoutError(): Error {
  const error = new Error('Architect timed out after 30s.');
  error.name = 'TimeoutError';
  return error;
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
  if (/timed out after 30s|aborted due to timeout|this operation was aborted/i.test(message)) return true;
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

export function createDeadline(ms = assistantTimeoutMs(), extra?: AbortSignal): Deadline {
  const ac = new AbortController();
  const abort = (reason: unknown = assistantTimeoutError()) => {
    if (!ac.signal.aborted) ac.abort(reason);
  };
  const timer = setTimeout(() => abort(assistantTimeoutError()), ms);
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
