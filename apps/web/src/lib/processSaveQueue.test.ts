import { describe, expect, it, vi } from 'vitest';
import type { Process } from '@bpmn/domain';
import { createProcessSaveQueue, processSaveStorageKey, readProcessSaveJournal } from './processSaveQueue';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function saved(version: number, patch: Partial<Process> = {}): Process {
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
  it('serializes writes and coalesces edits made while a write is in flight', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const releases: Array<(value: Process) => void> = [];
    const save = vi.fn(() => new Promise<Process>((resolve) => releases.push(resolve)));
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
    let finishFirst!: (value: Process) => void;
    const firstSave = new Promise<Process>((resolve) => {
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
