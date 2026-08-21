import { validateProcessPatch, type Process, type ProcessPatch } from '@bpmn/domain';

export type ProcessSavePatch = Omit<ProcessPatch, 'version'>;
export type ProcessSavePhase = 'idle' | 'dirty' | 'saving' | 'offline' | 'failed' | 'conflict';

export type ProcessSaveState = {
  phase: ProcessSavePhase;
  savedAt: string | null;
  error: string | null;
  currentVersion: number | null;
};

type SaveJournal = {
  schema: 1;
  baseVersion: number;
  patch: ProcessSavePatch;
  updatedAt: string;
};

type QueueOptions = {
  storageKey: string;
  initialVersion: number;
  initialSavedAt?: string | null;
  save: (patch: ProcessPatch) => Promise<Process>;
  onState: (state: ProcessSaveState) => void;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  isOnline?: () => boolean;
  debounceMs?: number;
  retryMs?: number;
  maxRetryMs?: number;
};

const PATCH_KEYS = ['name', 'description', 'status', 'bpmnXml', 'workflowJson'] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to save changes';
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function conflictVersion(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const value = (error as { currentVersion?: unknown }).currentVersion;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function sanitisePatch(value: unknown): ProcessSavePatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const patch: ProcessSavePatch = {};
  for (const key of PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      (patch as Record<string, unknown>)[key] = source[key];
    }
  }
  if (!Object.keys(patch).length) return null;
  return validateProcessPatch(patch).ok ? patch : null;
}

export function processSaveStorageKey(userId: string, processId: string): string {
  return `bpmn:save-journal:v1:${encodeURIComponent(userId)}:${encodeURIComponent(processId)}`;
}

export function readProcessSaveJournal(
  storageKey: string,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): { baseVersion: number; patch: ProcessSavePatch; updatedAt: string } | null {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SaveJournal>;
    const patch = sanitisePatch(value.patch);
    if (
      value.schema !== 1 ||
      !Number.isInteger(value.baseVersion) ||
      (value.baseVersion ?? 0) < 1 ||
      typeof value.updatedAt !== 'string' ||
      !patch
    ) {
      return null;
    }
    return { baseVersion: value.baseVersion!, patch, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}

export function guardDirtyProcessLeave(
  queue: Pick<ProcessSaveQueue, 'isDirty'> | null,
  event: Pick<BeforeUnloadEvent, 'preventDefault' | 'returnValue'>,
): boolean {
  if (!queue?.isDirty()) return false;
  event.preventDefault();
  event.returnValue = '';
  return true;
}

export function createProcessSaveQueue(options: QueueOptions) {
  const storage = options.storage ?? window.localStorage;
  const isOnline = options.isOnline ?? (() => navigator.onLine);
  const debounceMs = options.debounceMs ?? 300;
  const retryMs = options.retryMs ?? 1_000;
  const maxRetryMs = options.maxRetryMs ?? 30_000;
  let version = options.initialVersion;
  let savedAt = options.initialSavedAt ?? null;
  let pending: ProcessSavePatch | null = null;
  let active: ProcessSavePatch | null = null;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  let stopped = false;
  let journalAvailable = true;
  let state: ProcessSaveState = { phase: 'idle', savedAt, error: null, currentVersion: null };

  const publish = (next: Partial<ProcessSaveState>) => {
    state = { ...state, ...next };
    if (!stopped) options.onState(state);
  };

  const journalPatch = () => ({ ...(active ?? {}), ...(pending ?? {}) });
  const writeJournal = () => {
    const patch = journalPatch();
    try {
      if (!Object.keys(patch).length) {
        storage.removeItem(options.storageKey);
      } else {
        const journal: SaveJournal = {
          schema: 1,
          baseVersion: version,
          patch,
          updatedAt: new Date().toISOString(),
        };
        storage.setItem(options.storageKey, JSON.stringify(journal));
      }
      journalAvailable = true;
    } catch {
      // Persistence can be blocked by browser policy or quota. Network saving
      // must continue, while offline UI must not claim the edit is durable.
      journalAvailable = false;
    }
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const schedule = (delay: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  };

  const flush = (): Promise<void> => {
    clearTimer();
    if (inFlight) return inFlight;
    if (!pending || state.phase === 'conflict') return Promise.resolve();
    if (!isOnline()) {
      publish({
        phase: journalAvailable ? 'offline' : 'failed',
        error: journalAvailable
          ? 'Offline — changes are safe on this device'
          : 'Offline and local recovery storage is unavailable. Keep this tab open.',
      });
      return Promise.resolve();
    }

    const sending = pending;
    pending = null;
    active = sending;
    writeJournal();
    publish({ phase: 'saving', error: null, currentVersion: null });
    inFlight = options
      .save({ ...sending, version })
      .then((saved) => {
        active = null;
        version = saved.version;
        savedAt = saved.updatedAt;
        retries = 0;
        writeJournal();
        publish({
          phase: pending ? 'dirty' : 'idle',
          savedAt,
          error: null,
          currentVersion: null,
        });
      })
      .catch((error: unknown) => {
        pending = { ...sending, ...(pending ?? {}) };
        active = null;
        writeJournal();
        const status = errorStatus(error);
        if (status === 409) {
          publish({
            phase: 'conflict',
            error: 'This process changed elsewhere. Choose which version to keep.',
            currentVersion: conflictVersion(error),
          });
          return;
        }
        const online = isOnline();
        publish({
          phase: online ? 'failed' : 'offline',
          error: online ? errorMessage(error) : 'Offline — changes are safe on this device',
          currentVersion: null,
        });
        if (!status || status >= 500) {
          const delay = Math.min(retryMs * 2 ** retries, maxRetryMs);
          retries += 1;
          schedule(delay);
        }
      })
      .finally(() => {
        inFlight = null;
        if (pending && state.phase === 'dirty') schedule(0);
      });
    return inFlight;
  };

  const enqueue = (patch: ProcessSavePatch, immediate = false) => {
    pending = { ...(pending ?? {}), ...patch };
    writeJournal();
    const online = isOnline();
    publish({
      phase: online ? 'dirty' : journalAvailable ? 'offline' : 'failed',
      error: online
        ? null
        : journalAvailable
          ? 'Offline — changes are safe on this device'
          : 'Offline and local recovery storage is unavailable. Keep this tab open.',
      currentVersion: null,
    });
    schedule(immediate ? 0 : debounceMs);
  };

  const restore = (patch: ProcessSavePatch, baseVersion: number) => {
    pending = { ...(pending ?? {}), ...patch };
    writeJournal();
    if (baseVersion !== version) {
      publish({
        phase: 'conflict',
        error: 'Recovered local changes conflict with a newer server version.',
        currentVersion: version,
      });
      return;
    }
    publish({ phase: isOnline() ? 'dirty' : 'offline', error: null, currentVersion: null });
    schedule(0);
  };

  const retry = () => {
    if (!pending || state.phase === 'conflict') return;
    publish({ phase: 'dirty', error: null, currentVersion: null });
    schedule(0);
  };

  const resolveConflict = (currentVersion: number) => {
    if (!Number.isInteger(currentVersion) || currentVersion < 1) return;
    version = currentVersion;
    retries = 0;
    publish({ phase: pending ? 'dirty' : 'idle', error: null, currentVersion: null });
    writeJournal();
    if (pending) schedule(0);
  };

  const discard = () => {
    clearTimer();
    pending = null;
    active = null;
    retries = 0;
    writeJournal();
    publish({ phase: 'idle', error: null, currentVersion: null });
  };

  const destroy = () => {
    stopped = true;
    clearTimer();
  };

  return {
    enqueue,
    restore,
    flush,
    retry,
    resolveConflict,
    discard,
    destroy,
    isDirty: () => Boolean(pending || active || inFlight || state.phase !== 'idle'),
    getState: () => state,
  };
}

export type ProcessSaveQueue = ReturnType<typeof createProcessSaveQueue>;
