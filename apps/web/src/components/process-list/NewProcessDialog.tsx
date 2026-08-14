import { useEffect, useRef, useState } from 'react';
import { descriptionInputIssue } from '../../lib/describeProcess';
import { MAX_DESCRIPTION_CHARS } from '../../lib/linearProcess';
import { BPMN_FILE_ACCEPT, readBpmnFile } from '../../lib/readBpmnFile';
import { Button } from '../ui/Button';
import { useModal } from '../ui/useModal';

type NewProcessDialogProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDescribe: (text: string) => void;
  onBlank: () => void;
  onImport: (file: File, xml: string) => void;
  onRetryImport?: () => void;
};

export function NewProcessDialog({
  open,
  busy,
  error,
  onClose,
  onDescribe,
  onBlank,
  onImport,
  onRetryImport,
}: NewProcessDialogProps) {
  const [text, setText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { ref } = useModal({
    open,
    onClose: () => {
      if (!busy) onClose();
    },
  });

  useEffect(() => {
    if (!open) return;
    setText('');
    setImportError(null);
  }, [open]);

  if (!open) return null;
  const inputIssue = descriptionInputIssue(text);

  const readFile = (file: File) => {
    setImportError(null);
    void readBpmnFile(file)
      .then((xml) => onImport(file, xml))
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : 'Could not read file');
      });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 p-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-process-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded border border-border bg-canvas p-4 outline-none"
      >
        <h2 id="new-process-title" className="text-sm font-semibold text-ink">
          New process
        </h2>

        <section className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Describe it</p>
          <textarea
            value={text}
            disabled={busy}
            maxLength={MAX_DESCRIPTION_CHARS}
            rows={4}
            placeholder="Receive application then screen then interview"
            data-modal-initial-focus
            aria-describedby="new-process-description-meta"
            className="mt-1.5 w-full resize-y rounded border border-border bg-canvas px-2.5 py-2 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent"
            onChange={(event) => setText(event.target.value)}
          />
          <div id="new-process-description-meta" className="mt-1.5 flex justify-between gap-3 text-[11px] text-muted">
            <span className={inputIssue ? 'text-danger' : ''}>
              {inputIssue ?? 'Saved as the description. Supports linear steps, one decision, or parallel work.'}
            </span>
            <span className="shrink-0 tabular-nums">{text.length.toLocaleString()}/{MAX_DESCRIPTION_CHARS.toLocaleString()}</span>
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              variant="accent"
              size="sm"
              disabled={busy || !text.trim() || Boolean(inputIssue)}
              onClick={() => onDescribe(text)}
            >
              Create process
            </Button>
          </div>
        </section>

        <div className="mt-4 h-px bg-border" />

        <section className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink">Blank process</p>
            <p className="text-xs text-muted">Starter Start → Task → End</p>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={onBlank}>
            Create blank
          </Button>
        </section>

        <div className="mt-4 h-px bg-border" />

        <section className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink">Import BPMN 2.0</p>
            <p className="text-xs text-muted">.bpmn or .xml — stored as-is, no generated diagram</p>
          </div>
          <label className="inline-flex cursor-pointer items-center rounded border border-border bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface">
            Choose file
            <input
              ref={fileRef}
              type="file"
              accept={BPMN_FILE_ACCEPT}
              aria-label="Import BPMN 2.0 file"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) readFile(file);
              }}
            />
          </label>
        </section>

        {importError || error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {importError || error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {importError || (error && onRetryImport) ? (
            <Button
              variant="accent"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (importError || !onRetryImport) fileRef.current?.click();
                else onRetryImport();
              }}
            >
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
