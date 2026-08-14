import { useEffect, useId, useState } from 'react';
import type { ProcessSummary } from '@bpmn/domain';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { useModal } from '../ui/useModal';

type RenameProcessDialogProps = {
  process: ProcessSummary | null;
  busy: boolean;
  error: string | null;
  onRename: (name: string) => void;
  onClose: () => void;
};

export function RenameProcessDialog({
  process,
  busy,
  error,
  onRename,
  onClose,
}: RenameProcessDialogProps) {
  const [name, setName] = useState('');
  const titleId = useId();
  const errorId = useId();
  const { ref } = useModal({
    open: Boolean(process),
    onClose: () => {
      if (!busy) onClose();
    },
  });

  useEffect(() => {
    setName(process?.name ?? '');
  }, [process]);

  if (!process) return null;
  const trimmed = name.trim();

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-ink/40 p-4" role="presentation">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        tabIndex={-1}
        className="w-full max-w-sm rounded border border-border bg-canvas p-5 outline-none"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed && trimmed !== process.name && !busy) onRename(trimmed);
          }}
        >
          <h2 id={titleId} className="text-base font-semibold text-ink">
            Rename process
          </h2>
          <label className="mt-4 block">
            <span className="text-xs font-medium text-muted">Name</span>
            <TextField
              value={name}
              maxLength={200}
              autoComplete="off"
              data-modal-initial-focus
              className="mt-1 w-full"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error ? (
            <p id={errorId} className="mt-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              type="submit"
              disabled={busy || !trimmed || trimmed === process.name}
            >
              Rename
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
