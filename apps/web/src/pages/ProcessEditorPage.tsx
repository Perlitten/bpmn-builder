import { useCallback, useEffect, useRef, useState } from 'react';
import type { Process } from '@bpmn/domain';
import { BpmnEditor, type BpmnEditorHandle } from '../components/bpmn-editor/BpmnEditor';
import { EditorChrome } from '../components/shell/EditorChrome';
import { UserMenu } from '../components/shell/UserMenu';
import { Button } from '../components/ui';
import { useAuth } from '../components/auth/AuthGate';
import { fetchProcess, saveAsTemplate, saveProcess } from '../lib/api';
import { bpmnDownloadFilename, downloadBpmnXml, downloadBlob, downloadFilename, downloadText } from '../lib/downloadBpmn';
import { svgToPdfBlob } from '../lib/exportDiagram';
import { pageTitle } from '../lib/pageTitle';
import {
  createProcessSaveQueue,
  guardDirtyProcessLeave,
  processSaveStorageKey,
  readProcessSaveJournal,
  type ProcessSavePatch,
  type ProcessSaveQueue,
  type ProcessSaveState,
} from '../lib/processSaveQueue';
import '../styles/productFonts';

type ProcessEditorPageProps = {
  processId: string;
  onBack: () => void;
};

export function mergeLatestProcessWithPendingPatch(
  latest: Process,
  pending: ProcessSavePatch,
): Process {
  return { ...latest, ...pending };
}

export function ProcessEditorPage({ processId, onBack }: ProcessEditorPageProps) {
  const { user } = useAuth();
  const editorRef = useRef<BpmnEditorHandle>(null);
  const saveQueueRef = useRef<ProcessSaveQueue | null>(null);
  const [process, setProcess] = useState<Process | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ProcessSaveState>({
    phase: 'idle',
    savedAt: null,
    error: null,
    currentVersion: null,
  });
  const [busy, setBusy] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationStarting, setSimulationStarting] = useState(false);
  const [simStatus, setSimStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!simulating) {
      setSimulationStarting(false);
      return;
    }
    setSimulationStarting(true);
    const timer = window.setTimeout(() => setSimulationStarting(false), 450);
    return () => window.clearTimeout(timer);
  }, [simulating]);

  useEffect(() => {
    document.title = pageTitle('editor', name);
    return () => {
      document.title = pageTitle('list');
    };
  }, [name]);

  useEffect(() => {
    let cancelled = false;
    const storageKey = processSaveStorageKey(user.id, processId);
    void fetchProcess(processId)
      .then((data) => {
        if (cancelled) return;
        const journal = readProcessSaveJournal(storageKey);
        const recovered = journal ? { ...data.process, ...journal.patch } : data.process;
        setProcess(recovered);
        setName(recovered.name);
        const queue = createProcessSaveQueue({
          storageKey,
          initialVersion: data.process.version,
          initialSavedAt: data.process.updatedAt,
          save: async (patch) => {
            const saved = (await saveProcess(processId, patch)).process;
            setProcess((current) =>
              current ? { ...current, version: saved.version, updatedAt: saved.updatedAt } : saved,
            );
            return saved;
          },
          onState: setSaveState,
        });
        saveQueueRef.current = queue;
        setSaveState(queue.getState());
        if (journal) queue.restore(journal.patch, journal.baseVersion);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
      const queue = saveQueueRef.current;
      if (queue) {
        void queue.flush();
        queue.destroy();
        saveQueueRef.current = null;
      }
    };
  }, [processId, user.id]);

  useEffect(() => {
    const onOnline = () => saveQueueRef.current?.retry();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      guardDirtyProcessLeave(saveQueueRef.current, event);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  const handleXmlChange = useCallback(
    (bpmnXml: string) => {
      setNotice(null);
      setProcess((current) => (current ? { ...current, bpmnXml } : current));
      saveQueueRef.current?.enqueue({ bpmnXml });
    },
    [],
  );

  const commitName = useCallback(() => {
    const next = name.trim();
    if (!next) {
      setName(process?.name ?? '');
      return;
    }
    if (next === process?.name) return;
    setName(next);
    setProcess((current) => (current ? { ...current, name: next } : current));
    saveQueueRef.current?.enqueue({ name: next });
  }, [name, process?.name]);

  const handleKeepLocalChanges = useCallback(async () => {
    try {
      const latest = (await fetchProcess(processId)).process;
      const queue = saveQueueRef.current;
      if (!queue) return;
      const reconciled = mergeLatestProcessWithPendingPatch(latest, queue.getPendingPatch());
      setProcess(reconciled);
      setName(reconciled.name);
      queue.resolveConflict(latest.version);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to read the server version');
    }
  }, [processId]);

  const handleReloadServer = useCallback(() => {
    saveQueueRef.current?.discard();
    window.location.reload();
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const bpmnXml = await editorRef.current?.getXml();
      await saveAsTemplate(processId, bpmnXml);
      setNotice('Saved as template');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setBusy(false);
    }
  }, [processId]);

  const handleExport = useCallback(async () => {
    setNotice(null);
    try {
      const xml = await editorRef.current?.getXml();
      if (!xml) {
        setError('Could not export BPMN');
        return;
      }
      downloadBpmnXml(xml, bpmnDownloadFilename(name || process?.name || 'process'));
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export BPMN');
    }
  }, [name, process?.name]);

  const handleExportDiagram = useCallback(
    async (format: 'svg' | 'pdf') => {
      setNotice(null);
      setBusy(true);
      try {
        const svg = await editorRef.current?.getDiagramSvg();
        if (!svg) {
          setError('Could not export diagram');
          return;
        }
        const stem = name || process?.name || 'process';
        if (format === 'svg') {
          downloadText(svg, downloadFilename(stem, 'svg'), 'image/svg+xml;charset=utf-8');
        } else {
          downloadBlob(await svgToPdfBlob(svg), downloadFilename(stem, 'pdf'));
        }
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to export diagram');
      } finally {
        setBusy(false);
      }
    },
    [name, process?.name],
  );

  const handleClear = useCallback(() => {
    setNotice(null);
    setSimulating(false);
    void editorRef.current?.resetToStarter().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to reset process');
    });
  }, []);

  if (error && !process) {
    return (
      <div className="p-6">
        <p className="text-danger">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onBack}>
          Back to list
        </Button>
      </div>
    );
  }

  if (!process) {
    return <p className="p-6 text-sm text-muted">Loading editor…</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorChrome
        name={name}
        savePhase={saveState.phase}
        savedAt={saveState.savedAt}
        busy={busy}
        notice={notice}
        simulating={simulating}
        simulationStarting={simulationStarting}
        simStatus={simStatus}
        onBack={() => {
          void saveQueueRef.current?.flush();
          onBack();
        }}
        onNameChange={setName}
        onNameCommit={commitName}
        onExport={() => void handleExport()}
        onExportSvg={() => void handleExportDiagram('svg')}
        onExportPdf={() => void handleExportDiagram('pdf')}
        onSaveTemplate={() => void handleSaveTemplate()}
        onClear={handleClear}
        onToggleSimulate={() => {
          setSimulating((on) => !on);
          setNotice(null);
        }}
        onResetSimulation={() => editorRef.current?.resetSimulation()}
        account={<UserMenu />}
      />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <BpmnEditor
          ref={editorRef}
          processId={processId}
          xml={process.bpmnXml}
          simulating={simulating}
          onExitSimulation={() => setSimulating(false)}
          onChange={handleXmlChange}
          onSimStatus={(status) => setSimStatus(status || null)}
        />
        {error ? (
          <p className="editor-import-error absolute bottom-4 right-4 z-[var(--z-zoom)] border border-danger bg-canvas px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
        {saveState.phase === 'conflict' ? (
          <div
            className="absolute bottom-4 left-1/2 z-[var(--z-chrome)] flex max-w-[min(42rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 border border-danger bg-canvas px-4 py-3 text-sm"
            role="alert"
          >
            <p className="min-w-0 flex-1 text-ink">
              {saveState.error ?? 'This process changed elsewhere.'} Your local work is still stored on this device.
            </p>
            <Button variant="outline" size="sm" onClick={handleReloadServer}>
              Use server version
            </Button>
            <Button variant="accent" size="sm" onClick={() => void handleKeepLocalChanges()}>
              Keep my changes
            </Button>
          </div>
        ) : null}
        {saveState.phase === 'failed' ? (
          <div className="absolute bottom-4 left-4 z-[var(--z-zoom)] flex items-center gap-2 border border-danger bg-canvas px-3 py-2 text-xs text-danger">
            <span>{saveState.error ?? 'Save failed. Changes are stored locally.'}</span>
            <Button variant="outline" size="sm" onClick={() => saveQueueRef.current?.retry()}>
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
