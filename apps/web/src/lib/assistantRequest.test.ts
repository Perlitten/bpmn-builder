import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_TIMEOUT_MS,
  diagramImportError,
  isAbortError,
  mapAssistantError,
  mergeTimeoutSignal,
  waitOrAbort,
} from './assistantRequest';

describe('mergeTimeoutSignal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts after the assistant timeout', () => {
    expect(ASSISTANT_TIMEOUT_MS).toBe(55_000);
    vi.useFakeTimers();
    const merged = mergeTimeoutSignal(undefined, ASSISTANT_TIMEOUT_MS);
    expect(merged.signal.aborted).toBe(false);
    vi.advanceTimersByTime(ASSISTANT_TIMEOUT_MS);
    expect(merged.signal.aborted).toBe(true);
    merged.dispose();
  });

  it('aborts immediately when the user signal is already aborted', () => {
    const user = new AbortController();
    user.abort();
    const merged = mergeTimeoutSignal(user.signal, ASSISTANT_TIMEOUT_MS);
    expect(merged.signal.aborted).toBe(true);
    merged.dispose();
  });

  it('waitOrAbort rejects as soon as the signal aborts', async () => {
    const ac = new AbortController();
    const pending = waitOrAbort(new Promise<string>(() => {}), ac.signal);
    ac.abort();
    await expect(pending).rejects.toSatisfy(isAbortError);
  });
});

describe('mapAssistantError', () => {
  it('does not mention process vibes', () => {
    expect(mapAssistantError(new Error('boom'), false).message).not.toMatch(/vibe/i);
    expect(mapAssistantError(new DOMException('Aborted', 'AbortError'), false).message).not.toMatch(/vibe/i);
  });

  it('maps timeout, cancel, and root-0 import failures', () => {
    expect(mapAssistantError(new Error('x'), true).message).toBe('Cancelled');
    expect(mapAssistantError(new DOMException('Aborted', 'AbortError'), false).message).toMatch(
      /timed out after 55s/i,
    );
    expect(diagramImportError(new Error("Cannot read properties of undefined (reading 'root-0')")).message).toMatch(
      /could not import/i,
    );
    expect(
      mapAssistantError(new Error("Cannot read properties of undefined (reading 'root-0')"), false).message,
    ).toMatch(/left unchanged/i);
  });

  it('maps raw addTask unknown branch to a BPMN sentence', () => {
    const message = mapAssistantError(new Error('addTask: unknown branch: Region_1'), false).message;
    expect(message).not.toMatch(/unknown branch: Region_1/);
    expect(message).toMatch(/gateway branch|region/i);
  });
});
