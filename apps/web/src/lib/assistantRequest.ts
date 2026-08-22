import { userFacingPlanError } from '@bpmn/agent-tools';

// The server aborts at 50s; this small grace period lets its structured 504
// reach the client before the browser-side deadline fires.
export const ASSISTANT_TIMEOUT_MS = 55_000;

export function assistantTimeoutLabel(ms = ASSISTANT_TIMEOUT_MS): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
  );
}

function timeoutFailure(ms: number): Error {
  const timeout = new Error(
    `Architect timed out after ${assistantTimeoutLabel(ms)}. Retry, edit the request, or cancel.`,
  );
  timeout.name = 'TimeoutError';
  return timeout;
}

export function mergeTimeoutSignal(user: AbortSignal | undefined, timeoutMs: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => {
    ac.abort(timeoutFailure(timeoutMs));
  }, timeoutMs);
  const onAbort = () => ac.abort();
  if (user) {
    if (user.aborted) ac.abort();
    else user.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ac.signal,
    dispose: () => {
      clearTimeout(timer);
      user?.removeEventListener('abort', onAbort);
    },
  };
}

export function waitOrAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function diagramImportError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/root-0/i.test(message) || /cannot read properties of undefined/i.test(message)) {
    return new Error('Could not import the generated BPMN diagram');
  }
  return err instanceof Error ? err : new Error(message);
}

export function mapAssistantError(err: unknown, userCancelled: boolean): Error {
  if (userCancelled) return new Error('Cancelled');
  if (isAbortError(err)) {
    return timeoutFailure(ASSISTANT_TIMEOUT_MS);
  }
  const rawMessage = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|network request failed/i.test(rawMessage)) {
    return new Error('Architect could not reach the server. Check your connection and retry; the process was left unchanged.');
  }
  const mapped = diagramImportError(err);
  if (mapped.message === 'Could not import the generated BPMN diagram') {
    return new Error('Could not apply the generated diagram. The process was left unchanged.');
  }
  return new Error(userFacingPlanError(mapped.message));
}
