import { useState } from 'react';
import { ArrowLeft, Ellipsis, PlayCircle } from 'lucide-react';
import { Button, ChromeMenu, ChromeMenuItem, ConfirmDialog, SaveStatus, TextField } from '../ui';
import { useCompactViewport } from '../bpmn-editor/compactViewport';

type EditorChromeProps = {
  name: string;
  saving: boolean;
  savedAt: string | null;
  busy: boolean;
  notice: string | null;
  simulating: boolean;
  simStatus: string | null;
  compact?: boolean;
  onBack: () => void;
  onNameChange: (name: string) => void;
  onNameCommit: () => void;
  onExport: () => void;
  onExportSvg: () => void;
  onExportPdf: () => void;
  onSaveTemplate: () => void;
  onClear: () => void;
  onToggleSimulate: () => void;
  onResetSimulation: () => void;
};

export function EditorChrome({
  name,
  saving,
  savedAt,
  busy,
  notice,
  simulating,
  simStatus,
  compact: compactProp,
  onBack,
  onNameChange,
  onNameCommit,
  onExport,
  onExportSvg,
  onExportPdf,
  onSaveTemplate,
  onClear,
  onToggleSimulate,
  onResetSimulation,
}: EditorChromeProps) {
  const compactViewport = useCompactViewport();
  const compact = compactProp ?? compactViewport;
  const [confirmClear, setConfirmClear] = useState(false);
  const live = [notice, simulating ? simStatus : null].filter(Boolean).join(' · ');

  return (
    <header className="editor-chrome z-20 flex h-11 shrink-0 flex-nowrap items-center gap-2 overflow-visible border-b border-border bg-canvas px-2 sm:px-3">
      <a
        href="#process-diagram"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[500] focus:bg-canvas focus:px-3 focus:py-1.5 focus:text-sm"
      >
        Skip to diagram
      </a>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={onBack} aria-label="Back to process list">
        <ArrowLeft size={16} aria-hidden />
        <span className="hidden sm:inline">Back</span>
      </Button>
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
      <TextField
        variant="title"
        value={name}
        aria-label="Process name"
        placeholder="Process name"
        className="min-w-0 flex-1 sm:max-w-lg"
        onChange={(event) => onNameChange(event.target.value)}
        onBlur={onNameCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <SaveStatus saving={saving} savedAt={savedAt} />
      {live ? (
        <span className="sr-only" aria-live="polite">
          {live}
        </span>
      ) : null}
      {notice && !compact ? <span className="max-w-[10rem] truncate text-xs text-accent">{notice}</span> : null}
      {simulating && simStatus && !compact ? (
        <span className="hidden font-mono text-xs text-muted lg:inline">{simStatus}</span>
      ) : null}
      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1.5">
        <Button
          variant={simulating ? 'accent' : 'outline'}
          size="sm"
          disabled={busy}
          aria-pressed={simulating}
          aria-label={simulating ? 'Stop token simulation' : 'Simulate tokens'}
          onClick={onToggleSimulate}
        >
          <PlayCircle size={14} aria-hidden />
          <span className="hidden sm:inline">{simulating ? 'Stop' : 'Simulate'}</span>
        </Button>
        <ChromeMenu
          disabled={busy && !simulating}
          ariaLabel="More editor actions"
          label={
            <>
              <Ellipsis size={16} aria-hidden />
              <span className="hidden sm:inline">More</span>
            </>
          }
        >
          {simulating ? <ChromeMenuItem onSelect={onResetSimulation}>Reset tokens</ChromeMenuItem> : null}
          <ChromeMenuItem onSelect={onExport}>Download BPMN</ChromeMenuItem>
          <ChromeMenuItem disabled={busy} onSelect={onExportSvg}>
            Download diagram
            <span className="text-[11px] font-normal text-muted">SVG · vector</span>
          </ChromeMenuItem>
          <ChromeMenuItem disabled={busy} onSelect={onExportPdf}>
            Download diagram
            <span className="text-[11px] font-normal text-muted">PDF · printable</span>
          </ChromeMenuItem>
          <ChromeMenuItem disabled={busy} onSelect={onSaveTemplate}>
            Save as template
          </ChromeMenuItem>
          <ChromeMenuItem disabled={busy} onSelect={() => setConfirmClear(true)}>
            Reset process
          </ChromeMenuItem>
        </ChromeMenu>
      </div>
      <ConfirmDialog
        open={confirmClear}
        title="Reset process?"
        body="This resets to a starter process with a start event. Ctrl+Z undoes subsequent edits."
        confirmLabel="Reset"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          onClear();
        }}
      />
    </header>
  );
}
