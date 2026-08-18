import { useCallback, useEffect, useRef, useState } from 'react';
import type { Process } from '@bpmn/domain';
import { BpmnEditor, type BpmnEditorHandle } from '../components/bpmn-editor/BpmnEditor';
import { EditorChrome } from '../components/shell/EditorChrome';
import { UserMenu } from '../components/shell/UserMenu';
import { fetchProcess, saveAsTemplate, saveProcess } from '../lib/api';
import { bpmnDownloadFilename, downloadBpmnXml, downloadBlob, downloadFilename, downloadText } from '../lib/downloadBpmn';
import { svgToPdfBlob } from '../lib/exportDiagram';
import { pageTitle } from '../lib/pageTitle';

type ProcessEditorPageProps = {
  processId: string;
  onBack: () => void;
};

export function ProcessEditorPage({ processId, onBack }: ProcessEditorPageProps) {
  const editorRef = useRef<BpmnEditorHandle>(null);
  const [process, setProcess] = useState<Process | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simStatus, setSimStatus] = useState<string | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    document.title = pageTitle('editor', name);
    return () => {
      document.title = pageTitle('list');
    };
  }, [name]);

  useEffect(() => {
    let cancelled = false;
    void fetchProcess(processId)
      .then((data) => {
        if (cancelled) return;
        setProcess(data.process);
        setName(data.process.name);
        setSavedAt(data.process.updatedAt);
        versionRef.current = data.process.version;
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [processId]);

  const persist = useCallback(
    async (patch: Parameters<typeof saveProcess>[1]) => {
      const data = await saveProcess(processId, { ...patch, version: versionRef.current });
      versionRef.current = data.process.version;
      setProcess((prev) => (prev ? { ...prev, ...data.process, bpmnXml: prev.bpmnXml } : data.process));
      if (patch.name) setName(data.process.name);
      setSavedAt(data.process.updatedAt);
      setError(null);
      return data.process;
    },
    [processId],
  );

  const handleXmlChange = useCallback(
    (bpmnXml: string) => {
      setSaving(true);
      setNotice(null);
      void persist({ bpmnXml })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Failed to save');
        })
        .finally(() => setSaving(false));
    },
    [persist],
  );

  const commitName = useCallback(() => {
    const next = name.trim();
    if (!next) {
      setName(process?.name ?? '');
      return;
    }
    if (next === process?.name) return;
    setSaving(true);
    void persist({ name: next })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to save name');
      })
      .finally(() => setSaving(false));
  }, [name, persist, process?.name]);

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
        <button type="button" className="mt-4 text-sm text-muted underline" onClick={onBack}>
          Back to list
        </button>
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
        saving={saving}
        savedAt={savedAt}
        busy={busy}
        notice={notice}
        simulating={simulating}
        simStatus={simStatus}
        onBack={onBack}
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
          onChange={handleXmlChange}
          onSimStatus={(status) => setSimStatus(status || null)}
        />
        {error ? (
          <p className="absolute bottom-4 right-4 z-10 rounded border border-border bg-canvas px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
