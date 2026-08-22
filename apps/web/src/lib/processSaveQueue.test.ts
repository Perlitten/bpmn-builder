import { describe, expect, it, vi } from 'vitest';
import type { StoredProcess } from '@bpmn/domain';
import {
  createProcessSaveQueue,
  guardDirtyProcessLeave,
  processSaveStorageKey,
  readProcessSaveJournal,
} from './processSaveQueue';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function saved(version: number, patch: Partial<StoredProcess> = {}): StoredProcess {
  return {
    id: 'process-1',
    name: 'Process',
    description: null,
    status: 'draft',
    bpmnXml: '<xml />',
    workflowJson: null,
    version,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: `2026-01-01T00:00:0${version}.000Z`,
    ...patch,
  };
}

describe('process save queue', () => {
  it('uses the design-system 800ms autosave debounce by default', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (patch) => saved(2, patch));
    const queue = createProcessSaveQueue({
      storageKey: 'default-debounce',
      initialVersion: 1,
      save,
      onState: () => undefined,
      storage: memoryStorage(),
      isOnline: () => true,
    });

    queue.enqueue({ name: 'One sentence' });
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('serializes writes and coalesces edits made while a write is in flight', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const releases: Array<(value: StoredProcess) => void> = [];
    const save = vi.fn(() => new Promise<StoredProcess>((resolve) => releases.push(resolve)));
    const queue = createProcessSaveQueue({
      storageKey: 'journal',
      initialVersion: 3,
      save,
      onState: () => undefined,
      storage,
      isOnline: () => true,
      debounceMs: 10,
    });

    queue.enqueue({ bpmnXml: '<xml id="1" />' });
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenCalledWith({ bpmnXml: '<xml id="1" />', version: 3 });

    queue.enqueue({ bpmnXml: '<xml id="2" />' });
    queue.enqueue({ name: 'Latest name' });
    expect(save).toHaveBeenCalledTimes(1);
    releases[0]!(saved(4));
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenNthCalledWith(2, {
      bpmnXml: '<xml id="2" />',
      name: 'Latest name',
      version: 4,
    });
    releases[1]!(saved(5));
    await vi.runAllTimersAsync();
    expect(storage.getItem('journal')).toBeNull();
    expect(queue.getState().phase).toBe('idle');
    vi.useRealTimers();
  });

  it('journals the active request together with edits queued behind it', async () => {
    const storage = memoryStorage();
    let finishFirst!: (value: StoredProcess) => void;
    const firstSave = new Promise<StoredProcess>((resolve) => {
      finishFirst = resolve;
    });
    const queue = createProcessSaveQueue({
      storageKey: 'journal-active',
      initialVersion: 1,
      storage,
      debounceMs: 0,
      save: () => firstSave,
      onState: () => undefined,
    });

    queue.enqueue({ name: 'First name' }, true);
    const saving = queue.flush();
    queue.enqueue({ description: 'Second edit' }, true);

    expect(readProcessSaveJournal('journal-active', storage)).toMatchObject({
      baseVersion: 1,
      patch: { name: 'First name', description: 'Second edit' },
    });

    finishFirst(saved(2, { name: 'First name' }));
    await saving;
    queue.destroy();
  });

  it('keeps a user-scoped recovery journal until the save succeeds', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const key = processSaveStorageKey('user@example.com', 'process/1');
    const queue = createProcessSaveQueue({
      storageKey: key,
      initialVersion: 2,
      save: async (patch) => saved(3, patch),
      onState: () => undefined,
      storage,
      isOnline: () => false,
    });
    queue.enqueue({ name: 'Recovered', bpmnXml: '<xml id="local" />' });
    await vi.runAllTimersAsync();

    expect(readProcessSaveJournal(key, storage)).toMatchObject({
      baseVersion: 2,
      patch: { name: 'Recovered', bpmnXml: '<xml id="local" />' },
    });
    expect(queue.getState().phase).toBe('offline');
    vi.useRealTimers();
  });

  it('continues network saving when browser recovery storage is unavailable', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (patch) => saved(2, patch));
    const queue = createProcessSaveQueue({
      storageKey: 'blocked-storage',
      initialVersion: 1,
      save,
      onState: () => undefined,
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota blocked');
        },
        removeItem: () => {
          throw new Error('quota blocked');
        },
      },
      isOnline: () => true,
      debounceMs: 0,
    });

    expect(() => queue.enqueue({ name: 'Still saved' }, true)).not.toThrow();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledWith({ name: 'Still saved', version: 1 });
    expect(queue.getState().phase).toBe('idle');
    vi.useRealTimers();
  });

  it('resumes an offline journal when connectivity returns', async () => {
    vi.useFakeTimers();
    let online = false;
    const save = vi.fn(async (patch) => saved(2, patch));
    const queue = createProcessSaveQueue({
      storageKey: 'offline-resume',
      initialVersion: 1,
      save,
      onState: () => undefined,
      storage: memoryStorage(),
      isOnline: () => online,
      debounceMs: 0,
    });

    queue.enqueue({ name: 'Safe offline edit' }, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getState().phase).toBe('offline');
    expect(save).not.toHaveBeenCalled();

    online = true;
    queue.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith({ name: 'Safe offline edit', version: 1 });
    expect(queue.getState().phase).toBe('idle');
    vi.useRealTimers();
  });

  it('retries transient server failures with backoff and preserves the pending patch', async () => {
    vi.useFakeTimers();
    const unavailable = Object.assign(new Error('Temporarily unavailable'), { status: 503 });
    const save = vi.fn().mockRejectedValueOnce(unavailable).mockResolvedValueOnce(saved(2));
    const queue = createProcessSaveQueue({
      storageKey: 'transient-retry',
      initialVersion: 1,
      save,
      onState: () => undefined,
      storage: memoryStorage(),
      isOnline: () => true,
      debounceMs: 0,
      retryMs: 1_000,
    });

    queue.enqueue({ bpmnXml: '<xml id="retry" />' }, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getState().phase).toBe('failed');
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenLastCalledWith({ bpmnXml: '<xml id="retry" />', version: 1 });
    expect(queue.getState().phase).toBe('idle');
    vi.useRealTimers();
  });

  it('does not schedule another retry after the queue is destroyed', async () => {
    vi.useFakeTimers();
    let rejectSave!: (error: unknown) => void;
    const save = vi.fn(() => new Promise<StoredProcess>((_resolve, reject) => {
      rejectSave = reject;
    }));
    const queue = createProcessSaveQueue({
      storageKey: 'destroyed-retry',
      initialVersion: 1,
      save,
      onState: () => undefined,
      storage: memoryStorage(),
      isOnline: () => true,
      debounceMs: 0,
      retryMs: 1_000,
    });

    queue.enqueue({ name: 'Do not retry' }, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledOnce();
    queue.destroy();
    rejectSave(Object.assign(new Error('Temporarily unavailable'), { status: 503 }));
    await vi.runAllTimersAsync();

    expect(save).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('preserves a recovered journal base version until the conflict is explicitly resolved', () => {
    const storage = memoryStorage();
    const queue = createProcessSaveQueue({
      storageKey: 'stale-recovery',
      initialVersion: 9,
      save: async () => saved(10),
      onState: () => undefined,
      storage,
      isOnline: () => true,
    });

    queue.restore({ name: 'Recovered name' }, 7);

    expect(queue.getState()).toMatchObject({ phase: 'conflict', currentVersion: 9 });
    expect(readProcessSaveJournal('stale-recovery', storage)).toMatchObject({
      baseVersion: 7,
      patch: { name: 'Recovered name' },
    });
  });

  it('guards browser leave only while the queue is dirty', () => {
    const cleanEvent = { preventDefault: vi.fn(), returnValue: 'untouched' };
    expect(guardDirtyProcessLeave({ isDirty: () => false }, cleanEvent)).toBe(false);
    expect(cleanEvent.preventDefault).not.toHaveBeenCalled();
    expect(cleanEvent.returnValue).toBe('untouched');

    const dirtyEvent = { preventDefault: vi.fn(), returnValue: 'untouched' };
    expect(guardDirtyProcessLeave({ isDirty: () => true }, dirtyEvent)).toBe(true);
    expect(dirtyEvent.preventDefault).toHaveBeenCalledOnce();
    expect(dirtyEvent.returnValue).toBe('');
  });

  it('stops on a version conflict and retries only after explicit resolution', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const conflict = Object.assign(new Error('Version conflict'), { status: 409, currentVersion: 8 });
    const save = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce(saved(9));
    const queue = createProcessSaveQueue({
      storageKey: 'journal',
      initialVersion: 7,
      save,
      onState: () => undefined,
      storage,
      isOnline: () => true,
      debounceMs: 0,
    });

    queue.enqueue({ name: 'Mine' }, true);
    await vi.runAllTimersAsync();
    expect(queue.getState()).toMatchObject({ phase: 'conflict', currentVersion: 8 });
    expect(save).toHaveBeenCalledTimes(1);

    queue.retry();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    queue.resolveConflict(8);
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenLastCalledWith({ name: 'Mine', version: 8 });
    expect(queue.getState().phase).toBe('idle');
    vi.useRealTimers();
  });
});
