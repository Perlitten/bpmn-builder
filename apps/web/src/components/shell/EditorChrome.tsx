import { useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Ellipsis,
  FileCode,
  FileImage,
  FileText,
  LayoutTemplate,
  PlayCircle,
  RotateCcw,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Button, ChromeMenu, ChromeMenuItem, ConfirmDialog, SaveStatus, TextField } from '../ui';
import { useCompactViewport } from '../bpmn-editor/compactViewport';
import type { ProcessSavePhase } from '../../lib/processSaveQueue';

function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={14} strokeWidth={1.75} aria-hidden />;
}

type EditorChromeProps = {
  name: string;
  savePhase: ProcessSavePhase;
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
  account?: ReactNode;
};

export function EditorChrome({
  name,
  savePhase,
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
  account,
}: EditorChromeProps) {
  const compactViewport = useCompactViewport();
  const compact = compactProp ?? compactViewport;
  const [confirmClear, setConfirmClear] = useState(false);
  const live = [notice, simulating ? simStatus : null].filter(Boolean).join(' · ');

  return (
    <header className="editor-chrome z-[var(--z-chrome)] flex h-11 shrink-0 flex-nowrap items-center gap-2 overflow-visible border-b border-border bg-canvas px-2 sm:px-3">
      <a
        href="#process-diagram"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[var(--z-skip-link)] focus:bg-canvas focus:px-3 focus:py-1.5 focus:text-sm"
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
      <SaveStatus phase={savePhase} savedAt={savedAt} />
      {live ? (
        <span className="sr-only" aria-live="polite">
          {live}
        </span>
      ) : null}
      {notice && !compact ? <span className="max-w-[10rem] truncate text-xs text-accent">{notice}</span> : null}
      {simulating && simStatus && !compact ? (
        <span
          className="hidden min-w-0 max-w-[min(28rem,40vw)] truncate font-mono text-xs text-ink sm:inline"
          title={simStatus}
        >
          {simStatus}
        </span>
      ) : null}
      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1.5">
        <Button
          variant={simulating ? 'accent' : 'outline'}
          size="sm"
          disabled={busy}
          aria-pressed={simulating}
          aria-label={
            simulating
              ? simStatus
                ? `Stop token simulation. ${simStatus}`
                : 'Stop token simulation'
              : 'Simulate BPMN tokens on the process'
          }
          title={
            simulating
              ? (simStatus ?? 'Token simulation on')
              : 'Play a BPMN token through the process'
          }
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
          {simulating ? (
            <ChromeMenuItem icon={<MenuIcon icon={Undo2} />} onSelect={onResetSimulation}>
              Reset tokens
            </ChromeMenuItem>
          ) : null}
          <ChromeMenuItem icon={<MenuIcon icon={FileCode} />} onSelect={onExport}>
            Download BPMN
          </ChromeMenuItem>
          <ChromeMenuItem disabled={busy} icon={<MenuIcon icon={FileImage} />} onSelect={onExportSvg}>
            Download diagram
            <span className="text-[11px] font-normal text-muted">SVG · vector</span>
          </ChromeMenuItem>
          <ChromeMenuItem disabled={busy} icon={<MenuIcon icon={FileText} />} onSelect={onExportPdf}>
            Download diagram
            <span className="text-[11px] font-normal text-muted">PDF · printable</span>
          </ChromeMenuItem>
          <ChromeMenuItem disabled={busy} icon={<MenuIcon icon={LayoutTemplate} />} onSelect={onSaveTemplate}>
            Save as template
          </ChromeMenuItem>
          <ChromeMenuItem disabled={busy} icon={<MenuIcon icon={RotateCcw} />} onSelect={() => setConfirmClear(true)}>
            Reset process
          </ChromeMenuItem>
        </ChromeMenu>
        {account}
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
